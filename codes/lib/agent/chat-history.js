import fs from "node:fs";
import path from "node:path";
import { USER_DIR } from "../paths.js";

const INTERNAL_USER_HINTS = new Set([
    "You have enough tool output. Stop calling tools. Reply to the user in plain text now using results you already have.",
]);

function historyPath(chatId) {
    const safe = String(chatId).replace(/[^0-9-]/g, "");
    return path.join(USER_DIR, "temp", `chat-${safe}.json`);
}

export function cloneStoredMessage(message) {
    return JSON.parse(JSON.stringify(message));
}

export function isInternalStoredMessage(message) {
    return message?.role === "user" && INTERNAL_USER_HINTS.has(message.content);
}

/** Messages for one turn — supports legacy { user, assistant } and full { messages }. */
export function turnToMessages(turn) {
    if (Array.isArray(turn?.messages) && turn.messages.length) {
        return turn.messages;
    }
    const out = [];
    if (turn?.user?.trim()) out.push({ role: "user", content: turn.user });
    if (turn?.assistant?.trim()) out.push({ role: "assistant", content: turn.assistant });
    return out;
}

/** Slice agent messages for this turn; drop internal force-reply hints. */
export function extractTurnMessages(messages, fromIndex) {
    return messages
        .slice(fromIndex)
        .filter((m) => !isInternalStoredMessage(m))
        .map(cloneStoredMessage);
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

export function clearChatHistory(chatId) {
    if (!chatId) return;
    const filePath = historyPath(chatId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function appendChatTurn(chatId, turnMessages) {
    if (!chatId || !turnMessages?.length) return;

    const turns = loadChatHistory(chatId);
    turns.push({
        at: new Date().toISOString(),
        messages: turnMessages.map(cloneStoredMessage),
    });

    const filePath = historyPath(chatId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ version: 2, turns }, null, 2)}\n`, "utf8");
}
