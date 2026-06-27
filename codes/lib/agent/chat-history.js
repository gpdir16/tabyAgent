import fs from "node:fs";
import path from "node:path";
import { USER_DIR } from "../paths.js";

import { STOP_BY_USER_HINT } from "./session.js";

const HISTORY_VERSION = 3;
const MANIFEST_VERSION = 1;

const INTERNAL_USER_HINTS = new Set([
    "You have enough tool output. Stop calling tools. Reply to the user in plain text now using results you already have.",
    STOP_BY_USER_HINT,
]);

function safeChatId(chatId) {
    return String(chatId).replace(/[^0-9-]/g, "");
}

function chatTempRoot(chatId) {
    return path.join(USER_DIR, "temp", `chat-${safeChatId(chatId)}`);
}

function manifestPath(chatId) {
    return path.join(chatTempRoot(chatId), "manifest.json");
}

function activeSessionPath(chatId) {
    const manifest = loadManifest(chatId);
    if (!manifest?.activeSessionId) return null;
    const entry = manifest.sessions?.find((s) => s.id === manifest.activeSessionId);
    if (!entry?.file) return null;
    return path.join(chatTempRoot(chatId), entry.file);
}

function readJson(filePath, fallback = null) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function nextSessionId(manifest) {
    let max = 0;
    for (const entry of manifest.sessions || []) {
        const m = /^s(\d+)$/.exec(entry.id || "");
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `s${String(max + 1).padStart(6, "0")}`;
}

function sessionPayload({ sessionId, turns, compressedSummary = null, extra = {} }) {
    return {
        version: HISTORY_VERSION,
        sessionId,
        turns: turns || [],
        compressedSummary: compressedSummary || null,
        ...extra,
    };
}

function ensureManifest(chatId) {
    const mPath = manifestPath(chatId);
    let manifest = readJson(mPath, null);
    if (manifest?.activeSessionId && Array.isArray(manifest.sessions) && manifest.sessions.length) {
        return manifest;
    }

    const sessionId = "s000001";
    const relFile = `sessions/${sessionId}.json`;
    const root = chatTempRoot(chatId);
    const now = new Date().toISOString();

    writeJson(path.join(root, relFile), sessionPayload({ sessionId, turns: [], compressedSummary: null }));

    manifest = {
        version: MANIFEST_VERSION,
        activeSessionId: sessionId,
        sessions: [
            {
                id: sessionId,
                file: relFile,
                startedAt: now,
                closedAt: null,
                kind: "active",
            },
        ],
    };
    writeJson(mPath, manifest);
    return manifest;
}

function loadManifest(chatId) {
    if (!chatId) return null;
    return readJson(manifestPath(chatId), null);
}

function saveManifest(chatId, manifest) {
    writeJson(manifestPath(chatId), manifest);
}

function readActiveSessionData(chatId) {
    if (!chatId) return { turns: [], compressedSummary: null };
    ensureManifest(chatId);
    const filePath = activeSessionPath(chatId);
    if (!filePath || !fs.existsSync(filePath)) {
        return { turns: [], compressedSummary: null };
    }
    const data = readJson(filePath, {});
    return {
        turns: Array.isArray(data.turns) ? data.turns : [],
        compressedSummary: typeof data.compressedSummary === "string" ? data.compressedSummary : null,
    };
}

function writeActiveSessionData(chatId, turns, compressedSummary) {
    if (!chatId) return;
    const manifest = ensureManifest(chatId);
    const entry = manifest.sessions.find((s) => s.id === manifest.activeSessionId);
    if (!entry?.file) return;
    const filePath = path.join(chatTempRoot(chatId), entry.file);
    writeJson(
        filePath,
        sessionPayload({
            sessionId: manifest.activeSessionId,
            turns,
            compressedSummary,
        }),
    );
}

export function cloneStoredMessage(message) {
    return JSON.parse(JSON.stringify(message));
}

export function isInternalStoredMessage(message) {
    return message?.role === "user" && INTERNAL_USER_HINTS.has(message.content);
}

export function turnToMessages(turn) {
    if (Array.isArray(turn?.messages) && turn.messages.length) {
        return turn.messages;
    }
    const out = [];
    if (turn?.user?.trim()) out.push({ role: "user", content: turn.user });
    if (turn?.assistant?.trim()) out.push({ role: "assistant", content: turn.assistant });
    return out;
}

export function extractTurnMessages(messages, fromIndex) {
    return messages
        .slice(fromIndex)
        .filter((m) => !isInternalStoredMessage(m))
        .map(cloneStoredMessage);
}

export function loadChatHistory(chatId) {
    return readActiveSessionData(chatId).turns;
}

export function loadCompressedSummary(chatId) {
    return readActiveSessionData(chatId).compressedSummary;
}

export function saveCompressedSummary(chatId, summary) {
    if (!chatId) return;
    const { turns } = readActiveSessionData(chatId);
    writeActiveSessionData(chatId, turns, summary || null);
}

export function clearChatHistory(chatId) {
    if (!chatId) return;
    const manifest = ensureManifest(chatId);
    const now = new Date().toISOString();
    const activeEntry = manifest.sessions.find((s) => s.id === manifest.activeSessionId);
    if (activeEntry) {
        activeEntry.closedAt = now;
        activeEntry.kind = "archived";
    }

    const newId = nextSessionId(manifest);
    const relFile = `sessions/${newId}.json`;
    writeJson(
        path.join(chatTempRoot(chatId), relFile),
        sessionPayload({ sessionId: newId, turns: [], compressedSummary: null, extra: { startedAfterClear: true } }),
    );

    manifest.sessions.push({
        id: newId,
        file: relFile,
        startedAt: now,
        closedAt: null,
        kind: "active",
        parentSessionId: activeEntry?.id || null,
    });
    manifest.activeSessionId = newId;
    saveManifest(chatId, manifest);
}

export function replaceChatHistory(chatId, turns, compressedSummary = undefined) {
    if (!chatId) return;
    const existing = readActiveSessionData(chatId);
    const summary = compressedSummary !== undefined ? compressedSummary : existing.compressedSummary;
    writeActiveSessionData(chatId, turns, summary);
}

/**
 * After context compression: keep the full pre-compression session file on disk (archived),
 * and start a new active session file with recent turns + the new compressed summary.
 */
export function replaceChatHistoryAfterCompression(chatId, recentTurns, summary) {
    if (!chatId) return null;
    const manifest = ensureManifest(chatId);
    const oldId = manifest.activeSessionId;
    const now = new Date().toISOString();

    const oldEntry = manifest.sessions.find((s) => s.id === oldId);
    if (oldEntry) {
        oldEntry.closedAt = now;
        oldEntry.kind = "archived";
        oldEntry.archiveReason = "context_compression";
    }

    const newId = nextSessionId(manifest);
    const relFile = `sessions/${newId}.json`;
    writeJson(
        path.join(chatTempRoot(chatId), relFile),
        sessionPayload({
            sessionId: newId,
            turns: recentTurns,
            compressedSummary: summary || null,
            extra: {
                parentSessionId: oldId,
                compressedFromSessionId: oldId,
                compressedAt: now,
            },
        }),
    );

    manifest.sessions.push({
        id: newId,
        file: relFile,
        startedAt: now,
        closedAt: null,
        kind: "active",
        parentSessionId: oldId,
        compressedFromSessionId: oldId,
    });
    manifest.activeSessionId = newId;
    manifest.lastCompressedAt = now;
    saveManifest(chatId, manifest);

    console.log(
        `tabyAgent: archived session ${oldId}, active session is now ${newId} (${recentTurns.length} recent turns, compressed summary saved)`,
    );
    return { archivedSessionId: oldId, activeSessionId: newId, sessionFile: relFile };
}

export function appendChatTurn(chatId, turnMessages) {
    if (!chatId || !turnMessages?.length) return;

    const turns = loadChatHistory(chatId);
    turns.push({
        at: new Date().toISOString(),
        messages: turnMessages.map(cloneStoredMessage),
    });

    replaceChatHistory(chatId, turns);
}

export function listArchivedSessionFiles(chatId) {
    const manifest = loadManifest(chatId);
    if (!manifest?.sessions?.length) return [];
    const activeId = manifest.activeSessionId;
    const root = chatTempRoot(chatId);
    return manifest.sessions
        .filter((s) => s.id !== activeId)
        .map((s) => ({
            ...s,
            absolutePath: path.join(root, s.file),
        }))
        .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

export function formatPastSessionsForPrompt(chatId) {
    if (!chatId) return "";
    const archived = listArchivedSessionFiles(chatId);
    if (!archived.length) return "";

    const root = chatTempRoot(chatId);
    const lines = archived.map((s) => {
        const data = readJson(s.absolutePath, {});
        const turnCount = Array.isArray(data.turns) ? data.turns.length : 0;
        const hasSummary = Boolean(data.compressedSummary?.trim());
        const rel = path.relative(USER_DIR, s.absolutePath).split(path.sep).join("/");
        const parts = [`session ${s.id}`, `${turnCount} turns`];
        if (hasSummary) parts.push("has compressedSummary field");
        if (s.archiveReason === "context_compression") parts.push("archived before context compression");
        if (s.closedAt) parts.push(`closed ${s.closedAt}`);
        return `- \`${rel}\` — ${parts.join(", ")}. Read with \`file_read\` when you need older transcript details.`;
    });

    return [
        "Past Telegram thread sessions for this chat (newest archived first). The active session is loaded automatically; these files are **full on-disk history** kept when context was compressed or the user ran `/new`.",
        `Directory: \`${path.relative(USER_DIR, root).split(path.sep).join("/")}/\` (also \`manifest.json\` lists every session).`,
        ...lines,
    ].join("\n");
}
