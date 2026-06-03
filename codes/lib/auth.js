import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { USER_DIR } from "./paths.js";
import { loadAgentConfig } from "./config-loader.js";

const APPROVED_PATH = path.join(USER_DIR, "approved.json");

function readApprovedFile() {
    if (!fs.existsSync(APPROVED_PATH)) {
        return { approved: { chatIds: [] }, pending: {} };
    }
    return JSON.parse(fs.readFileSync(APPROVED_PATH, "utf8"));
}

function writeApprovedFile(data) {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(APPROVED_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function pruneExpired(data) {
    const now = Date.now();
    for (const [code, entry] of Object.entries(data.pending || {})) {
        if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
            delete data.pending[code];
        }
    }
    return data;
}

export function isApproved(chatId) {
    const data = pruneExpired(readApprovedFile());
    writeApprovedFile(data);
    return data.approved?.chatIds?.includes(String(chatId)) ?? false;
}

export function issuePendingCode(chatId) {
    const data = pruneExpired(readApprovedFile());
    const agent = loadAgentConfig();
    const ttlMin = agent.authCodeTtlMinutes ?? 15;

    for (const [code, entry] of Object.entries(data.pending || {})) {
        if (String(entry.chatId) === String(chatId)) {
            return { code, expiresAt: entry.expiresAt, minutes: ttlMin };
        }
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000).toISOString();
    data.pending = data.pending || {};
    data.pending[code] = { chatId: String(chatId), expiresAt };
    writeApprovedFile(data);
    return { code, expiresAt, minutes: ttlMin };
}

export function approveChatId(chatId) {
    const data = pruneExpired(readApprovedFile());
    data.approved = data.approved || { chatIds: [] };
    const id = String(chatId);
    if (!data.approved.chatIds.includes(id)) {
        data.approved.chatIds.push(id);
    }
    writeApprovedFile(data);
    return { ok: true, chatId: id };
}

export function approveCode(code) {
    const data = pruneExpired(readApprovedFile());
    const entry = data.pending?.[code];
    if (!entry) return { ok: false, reason: "invalid_or_expired" };
    if (new Date(entry.expiresAt).getTime() < Date.now()) {
        delete data.pending[code];
        writeApprovedFile(data);
        return { ok: false, reason: "invalid_or_expired" };
    }

    data.approved = data.approved || { chatIds: [] };
    const chatId = String(entry.chatId);
    if (!data.approved.chatIds.includes(chatId)) {
        data.approved.chatIds.push(chatId);
    }
    delete data.pending[code];
    writeApprovedFile(data);
    return { ok: true, chatId };
}
