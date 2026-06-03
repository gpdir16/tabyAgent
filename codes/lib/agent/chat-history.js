import fs from "node:fs";
import path from "node:path";
import { USER_DIR } from "../paths.js";
import { loadAgentConfig } from "../config-loader.js";

function historyPath(chatId) {
    const safe = String(chatId).replace(/[^0-9-]/g, "");
    return path.join(USER_DIR, "temp", `chat-${safe}.json`);
}

/** 0 = unlimited on disk; only context fitting trims at request time */
function maxStoredTurns() {
    const n = loadAgentConfig().chatHistoryMaxStoredTurns;
    if (n == null || n === 0) return Infinity;
    return n;
}

function maxCharsPerMessage() {
    return loadAgentConfig().chatHistoryMaxChars ?? 8000;
}

function trimText(text) {
    const s = String(text || "").trim();
    if (s.length <= maxCharsPerMessage()) return s;
    return `${s.slice(0, maxCharsPerMessage())}\n…[truncated]`;
}

export function loadChatHistory(chatId) {
    const filePath = historyPath(chatId);
    if (!fs.existsSync(filePath)) return [];
    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(data.turns) ? data.turns : [];
    } catch {
        return [];
    }
}

export function appendChatTurn(chatId, userText, assistantText) {
    if (!chatId || !assistantText?.trim()) return;

    const turns = loadChatHistory(chatId);
    turns.push({
        user: trimText(userText),
        assistant: trimText(assistantText),
        at: new Date().toISOString(),
    });

    const limit = maxStoredTurns();
    const stored = Number.isFinite(limit) && turns.length > limit ? turns.slice(-limit) : turns;

    const filePath = historyPath(chatId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ turns: stored }, null, 2)}\n`, "utf8");
}
