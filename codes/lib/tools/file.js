import fs from "node:fs";
import path from "node:path";
import { countMessagesTokens, countTokens, getContextWindow } from "../agent/context.js";
import { formatAllowedPaths, isAllowedFilePath, resolveAgentPath } from "../paths.js";
import { filePathParamDescription, filePatchDescription, fileReadDescription } from "../path-labels.js";

function resolveFilePath(rawPath, { write = false } = {}) {
    const resolved = resolveAgentPath(rawPath);
    if (!resolved) return null;
    return isAllowedFilePath(resolved, { write }) ? resolved : null;
}

function getMaxFileReadTokens(messages, modelMeta, model) {
    const window = getContextWindow(modelMeta);
    const used = countMessagesTokens(messages || [], model);
    const remaining = Math.max(0, window - used);
    const half = Math.floor(remaining * 0.5);
    return Math.max(0, half - 1);
}

function splitLines(text) {
    if (!text) return [];
    const lines = text.split("\n");
    if (text.endsWith("\n") && lines.length > 0) lines.pop();
    return lines;
}

function joinLines(lines, { trailingNewline = false } = {}) {
    if (!lines.length) return trailingNewline ? "\n" : "";
    let out = lines.join("\n");
    if (trailingNewline) out += "\n";
    return out;
}

function formatLineNumbered(lines, startLine) {
    const width = String(startLine + lines.length - 1).length;
    return lines.map((line, i) => `${String(startLine + i).padStart(width, " ")}|${line}`).join("\n");
}

function sliceByLineRange(lines, startLine, endLine) {
    const start = Math.max(1, startLine ?? 1);
    const end = endLine == null ? lines.length : Math.min(lines.length, endLine);
    if (start > lines.length) return { start, end: start - 1, slice: [] };
    return { start, end, slice: lines.slice(start - 1, end) };
}

function truncateToTokenBudget(text, maxTokens, model) {
    if (maxTokens <= 0) {
        return { text: "", tokens: 0, truncated: true };
    }
    const lines = text.split("\n");
    let lo = 0;
    let hi = lines.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const chunk = lines.slice(0, mid).join("\n");
        if (countTokens(chunk, model) <= maxTokens) lo = mid;
        else hi = mid - 1;
    }
    const kept = lines.slice(0, lo).join("\n");
    return {
        text: kept,
        tokens: countTokens(kept, model),
        truncated: lo < lines.length,
    };
}

export const fileToolDefinitions = [
    {
        type: "function",
        function: {
            name: "file_read",
            description: fileReadDescription(),
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: filePathParamDescription(),
                    },
                    startLine: { type: "integer", description: "First line to read (1-based, default 1)" },
                    endLine: { type: "integer", description: "Last line to read (1-based, inclusive)" },
                    limit: { type: "integer", description: "Number of lines from startLine (alternative to endLine)" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "file_patch",
            description: filePatchDescription(),
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: filePathParamDescription(),
                    },
                    diff: {
                        type: "string",
                        description: "Unified diff (---/+++/@@ hunks). Use context lines, lines to remove (-), and lines to add (+).",
                    },
                },
                required: ["path", "diff"],
            },
        },
    },
];

function recordFileSnapshot(ctx, resolvedPath, content) {
    ctx.fileSnapshots?.set(resolvedPath, content);
}

export async function executeFileRead(args, ctx) {
    const resolved = resolveFilePath(args?.path, { write: false });
    if (!resolved) return { error: `path not allowed or missing (readable: ${formatAllowedPaths()})` };
    if (!fs.existsSync(resolved)) return { error: "file not found", path: resolved };
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { error: "not a file", path: resolved };

    const model = ctx.model || "gpt-4o-mini";
    const maxTokens = getMaxFileReadTokens(ctx.messages, ctx.modelMeta, model);
    if (maxTokens <= 0) {
        return {
            error: "No context budget left for file_read (must stay under 50% of remaining window)",
            maxTokens: 0,
        };
    }

    const content = fs.readFileSync(resolved, "utf8");
    recordFileSnapshot(ctx, resolved, content);

    const lines = splitLines(content);
    const startLine = args?.startLine;
    let endLine = args?.endLine;
    const limit = args?.limit;
    if (limit != null && startLine != null) {
        endLine = startLine + Math.max(0, limit) - 1;
    } else if (limit != null) {
        endLine = limit;
    }

    const { start, end, slice } = sliceByLineRange(lines, startLine ?? 1, endLine);
    const numbered = formatLineNumbered(slice, start);
    const { text, tokens, truncated } = truncateToTokenBudget(numbered, maxTokens, model);
    const returnedLineCount = text ? text.split("\n").length : 0;

    return {
        path: resolved,
        startLine: start,
        endLine: truncated && returnedLineCount > 0 ? start + returnedLineCount - 1 : end,
        totalLines: lines.length,
        content: text,
        tokens,
        maxTokens,
        truncated,
        ...(truncated ? { note: "Output truncated to fit context budget; use a smaller line range or startLine/endLine." } : {}),
    };
}

function parseUnifiedDiff(diffText) {
    const lines = diffText.replace(/\r\n/g, "\n").split("\n");
    const hunks = [];
    let i = 0;
    while (i < lines.length && !lines[i].startsWith("@@")) i += 1;

    while (i < lines.length) {
        const header = lines[i];
        if (!header.startsWith("@@")) break;
        const match = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(header);
        if (!match) return { error: `Invalid hunk header: ${header}` };
        const oldStart = Number(match[1]);
        i += 1;
        const hunkLines = [];
        while (i < lines.length && !lines[i].startsWith("@@")) {
            const line = lines[i];
            if (line === "\\ No newline at end of file") {
                i += 1;
                continue;
            }
            const prefix = line[0];
            if (prefix !== " " && prefix !== "+" && prefix !== "-") break;
            hunkLines.push({ type: prefix, text: line.slice(1) });
            i += 1;
        }
        hunks.push({ oldStart, lines: hunkLines });
    }

    if (!hunks.length) return { error: "No diff hunks found (expected @@ headers)" };
    return { hunks };
}

function applyHunk(fileLines, hunk) {
    const fileIndex = hunk.oldStart - 1;
    const expected = [];
    const replacement = [];

    for (const entry of hunk.lines) {
        if (entry.type === " ") {
            expected.push(entry.text);
            replacement.push(entry.text);
        } else if (entry.type === "-") {
            expected.push(entry.text);
        } else if (entry.type === "+") {
            replacement.push(entry.text);
        }
    }

    const actual = fileLines.slice(fileIndex, fileIndex + expected.length);
    if (actual.length !== expected.length || actual.some((l, idx) => l !== expected[idx])) {
        return {
            error: "Hunk context does not match file",
            oldStart: hunk.oldStart,
            expectedPreview: expected.slice(0, 5),
            actualPreview: actual.slice(0, 5),
        };
    }

    const next = [...fileLines.slice(0, fileIndex), ...replacement, ...fileLines.slice(fileIndex + expected.length)];
    return { lines: next };
}

export async function executeFilePatch(args, ctx = {}) {
    const resolved = resolveFilePath(args?.path, { write: true });
    if (!resolved) return { error: `path not allowed or missing (writable: ${formatAllowedPaths({ write: true })})` };

    const diff = args?.diff;
    if (!diff?.trim()) return { error: "diff is required" };

    const parsed = parseUnifiedDiff(diff);
    if (parsed.error) return parsed;

    const existed = fs.existsSync(resolved);
    const snapshots = ctx.fileSnapshots;

    if (existed) {
        if (!snapshots?.has(resolved)) {
            return {
                error: "file_patch requires file_read on this path earlier in the same turn",
                path: resolved,
            };
        }
        const snapshot = snapshots.get(resolved);
        const onDisk = fs.readFileSync(resolved, "utf8");
        if (onDisk !== snapshot) {
            return {
                error: "File changed on disk since file_read (not by this agent). Call file_read again, then file_patch.",
                path: resolved,
            };
        }
    }

    const original = existed ? snapshots.get(resolved) : "";
    const trailingNewline = existed ? original.endsWith("\n") : true;
    let fileLines = splitLines(original);

    const sorted = [...parsed.hunks].sort((a, b) => b.oldStart - a.oldStart);
    for (const hunk of sorted) {
        const applied = applyHunk(fileLines, hunk);
        if (applied.error) return { ...applied, path: resolved };
        fileLines = applied.lines;
    }

    const parent = path.dirname(resolved);
    fs.mkdirSync(parent, { recursive: true });
    const out = joinLines(fileLines, { trailingNewline });
    fs.writeFileSync(resolved, out, "utf8");
    recordFileSnapshot(ctx, resolved, out);

    return { ok: true, path: resolved, hunksApplied: parsed.hunks.length };
}
