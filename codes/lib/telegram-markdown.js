const NL = "\n";

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** Split on fenced ``` blocks (optional language on first line). */
function splitFencedCode(input) {
    const parts = [];
    const re = /```([^\n`]*)\n?([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = re.exec(input)) !== null) {
        if (m.index > last) parts.push({ type: "text", content: input.slice(last, m.index) });
        parts.push({ type: "code", lang: (m[1] || "").trim(), content: m[2] ?? "" });
        last = m.index + m[0].length;
    }
    if (last < input.length) parts.push({ type: "text", content: input.slice(last) });
    if (!parts.length) parts.push({ type: "text", content: input });
    return parts;
}

function formatInlineMarkdown(line) {
    const placeholders = [];
    let s = escapeHtml(line);

    s = s.replace(/`([^`\n]+)`/g, (_, code) => {
        const i = placeholders.length;
        placeholders.push(`<code>${escapeHtml(code)}</code>`);
        return `\x00C${i}\x00`;
    });

    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const href = escapeHtml(url.trim());
        const safe = /^https?:\/\//i.test(url.trim()) || /^tg:/i.test(url.trim());
        if (!safe) return escapeHtml(`[${label}](${url})`);
        return `<a href="${href}">${escapeHtml(label)}</a>`;
    });

    s = s.replace(/<((?:https?:\/\/|tg:)[^>\s]+)>/gi, (_, url) => {
        const href = escapeHtml(url);
        return `<a href="${href}">${href}</a>`;
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/__([^_]+)__/g, "<b>$1</b>");
    s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<i>$1</i>");
    s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<i>$1</i>");

    s = s.replace(/\x00C(\d+)\x00/g, (_, i) => placeholders[Number(i)] ?? "");
    return s;
}

function renderCodeBlock(content) {
    const body = escapeHtml(String(content ?? "").replace(/\n$/, ""));
    if (!body) return "";
    return `<pre><code>${body}</code></pre>`;
}

/** Split a pipe row (with or without leading/trailing |). */
function splitTableLine(line) {
    let t = String(line ?? "").trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|")) t = t.slice(0, -1);
    return t.split("|").map((c) => c.trim());
}

function isTableSeparator(line) {
    const cells = splitTableLine(line);
    if (cells.length < 2) return false;
    return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/** Any line with 2+ pipe-separated cells, or a GFM separator row. */
function isTableLine(line) {
    const t = String(line ?? "").trim();
    if (!t || !t.includes("|")) return false;
    if (isTableSeparator(t)) return true;
    const cells = splitTableLine(t);
    return cells.length >= 2 && cells.some((c) => c.length > 0);
}

function parseTableLines(lines) {
    return lines
        .map((l) => l.trim())
        .filter((l) => l && !isTableSeparator(l))
        .map(splitTableLine)
        .filter((row) => row.length >= 2);
}

/** Strip inline markdown from table cells before PNG render. */
function stripCellMarkdown(text) {
    return String(text ?? "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
}

function plainTableRows(lines) {
    return parseTableLines(lines).map((row) => row.map(stripCellMarkdown));
}

function isPipeTableContent(text) {
    const lines = String(text ?? "")
        .trim()
        .split("\n")
        .filter((l) => l.trim());
    if (lines.length < 2) return false;
    return lines.filter((l) => isTableLine(l.trim())).length >= 2;
}

function listMatch(line) {
    const m = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!m) return null;
    return { indent: m[1].length, marker: m[2], text: m[3] };
}

function listBullet(marker, indent) {
    if (/^\d+\.$/.test(marker)) return marker;
    const depth = Math.floor(indent / 2);
    return depth % 2 === 1 ? "◦" : "•";
}

function groupTextBlocks(text) {
    const lines = String(text ?? "").split("\n");
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i++;
            continue;
        }

        if (/^#{1,6}\s+/.test(trimmed)) {
            blocks.push({ type: "heading", text: trimmed.replace(/^#{1,6}\s+/, "") });
            i++;
            continue;
        }

        if (/^[-*_]{3,}$/.test(trimmed)) {
            blocks.push({ type: "hr" });
            i++;
            continue;
        }

        if (trimmed.startsWith(">")) {
            const quoteLines = [];
            while (i < lines.length && lines[i].trim().startsWith(">")) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
                i++;
            }
            blocks.push({ type: "blockquote", lines: quoteLines });
            continue;
        }

        if (isTableLine(trimmed)) {
            const tableLines = [];
            while (i < lines.length && isTableLine(lines[i].trim())) {
                tableLines.push(lines[i]);
                i++;
            }
            blocks.push({ type: "table", lines: tableLines });
            continue;
        }

        const lm = listMatch(line);
        if (lm) {
            const items = [];
            while (i < lines.length) {
                const m = listMatch(lines[i]);
                if (!m) break;
                items.push(m);
                i++;
            }
            blocks.push({ type: "list", items });
            continue;
        }

        if (/^( {4}|\t)/.test(line)) {
            const codeLines = [];
            while (i < lines.length && /^( {4}|\t)/.test(lines[i])) {
                codeLines.push(lines[i].replace(/^( {4}|\t)/, ""));
                i++;
            }
            blocks.push({ type: "code", content: codeLines.join("\n") });
            continue;
        }

        const paraLines = [];
        while (i < lines.length) {
            const l = lines[i];
            const t = l.trim();
            if (!t) break;
            if (/^#{1,6}\s+/.test(t) || /^[-*_]{3,}$/.test(t) || t.startsWith(">") || isTableLine(t) || listMatch(l) || /^( {4}|\t)/.test(l)) {
                break;
            }
            paraLines.push(l);
            i++;
        }
        blocks.push({ type: "paragraph", lines: paraLines });
    }

    return blocks;
}

function blockToParts(block) {
    switch (block.type) {
        case "heading":
            return [{ type: "html", content: `<b>${formatInlineMarkdown(block.text)}</b>` }];
        case "hr":
            return [{ type: "html", content: "────────" }];
        case "blockquote":
            return [
                {
                    type: "html",
                    content: `<blockquote>${block.lines.map((l) => formatInlineMarkdown(l)).join(NL)}</blockquote>`,
                },
            ];
        case "table": {
            const rows = plainTableRows(block.lines);
            return rows.length ? [{ type: "table", rows }] : [];
        }
        case "list": {
            const lines = block.items.map(({ indent, marker, text }) => {
                const bullet = listBullet(marker, indent);
                const pad = indent > 0 ? " ".repeat(Math.min(indent, 8)) : "";
                return `${pad}${bullet} ${formatInlineMarkdown(text)}`;
            });
            return [{ type: "html", content: lines.join(NL) }];
        }
        case "code":
            return [{ type: "html", content: renderCodeBlock(block.content) }];
        case "paragraph":
            return [{ type: "html", content: block.lines.map((l) => formatInlineMarkdown(l)).join(NL) }];
        default:
            return [];
    }
}

function renderTextBlockParts(text) {
    return groupTextBlocks(text).flatMap(blockToParts);
}

/** Markdown → ordered HTML + table row parts for sendTelegramReply. */
export function buildTelegramParts(input) {
    const text = String(input ?? "").replace(/\r\n/g, "\n");
    if (!text.trim()) return [{ type: "html", content: "…" }];

    const parts = [];
    const segments = splitFencedCode(text);

    for (const seg of segments) {
        if (seg.type === "code") {
            if (!seg.lang && isPipeTableContent(seg.content)) {
                const rows = plainTableRows(seg.content.split("\n"));
                if (rows.length) parts.push({ type: "table", rows });
            } else {
                const html = renderCodeBlock(seg.content);
                if (html) parts.push({ type: "html", content: html });
            }
        } else {
            parts.push(...renderTextBlockParts(seg.content));
        }
    }

    return parts.length ? parts : [{ type: "html", content: "…" }];
}
