// 대화 폴더 배치(manifest, 세션 파일) 읽기/쓰기.
import fs from "node:fs";
import path from "node:path";
import { USER_DIR } from "../../paths.js";
import { DEFAULT_AGENT_ID, findAgentByThread } from "../../agents-store.js";
import { readJsonFile, writeJsonAtomic } from "../../atomic-file.js";

const HISTORY_VERSION = 3;

const MANIFEST_VERSION = 1;

// 텔레그램 세션 루트: user/temp/chat-<sessionKey>/
// sessionKey는 "<chatId>" 또는 "<chatId>:t<threadId>" (토픽 에이전트).
const TEMP_ROOT = () => path.join(USER_DIR, "temp");

export function sessionRoot(sessionKey) {
    if (!sessionKey) return null;
    const safe = String(sessionKey).replace(/[^0-9A-Za-z:_-]/g, "_");
    return path.join(TEMP_ROOT(), `chat-${safe}`);
}

export function conversationDir(chatId) {
    return sessionRoot(chatId);
}

// 세션 키 소유 에이전트: ":t" 접미사가 있으면 토픽 에이전트, 아니면 기본 에이전트.
export function agentIdForSessionKey(sessionKey) {
    const m = /^(-?\d+):t(\d+)$/.exec(String(sessionKey || ""));
    if (m) return findAgentByThread(Number(m[2]))?.id || null;
    return DEFAULT_AGENT_ID;
}

export function isValidSessionKey(value) {
    return /^-?\d+(:t\d+)?$/.test(String(value || "").trim());
}

// 디스크에 존재하는 모든 세션 루트를 나열한다 (dreaming/session-search가 사용).
export function listSessionRoots() {
    const out = [];
    let names;
    try {
        names = fs.readdirSync(TEMP_ROOT());
    } catch {
        return out;
    }
    for (const name of names) {
        if (!name.startsWith("chat-")) continue;
        const dir = path.join(TEMP_ROOT(), name);
        try {
            if (!fs.statSync(dir).isDirectory()) continue;
        } catch {
            continue;
        }
        out.push({ sessionKey: name.slice("chat-".length), dir });
    }
    return out;
}

export function activeSessionFilePath(sessionKey) {
    return activeSessionPath(sessionKey);
}

function manifestPath(chatId) {
    const root = conversationDir(chatId);
    return root ? path.join(root, "manifest.json") : null;
}

function activeSessionPath(chatId) {
    const root = conversationDir(chatId);
    const manifest = loadManifest(chatId);
    if (!root || !manifest?.activeSessionId) return null;
    const entry = manifest.sessions?.find((s) => s.id === manifest.activeSessionId);
    if (!entry?.file) return null;
    return path.join(root, entry.file);
}

export function nextSessionId(manifest) {
    let max = 0;
    for (const entry of manifest.sessions || []) {
        const m = /^s(\d+)$/.exec(entry.id || "");
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `s${String(max + 1).padStart(6, "0")}`;
}

export function sessionPayload({ sessionId, turns, extra = {} }) {
    return {
        version: HISTORY_VERSION,
        sessionId,
        turns: turns || [],
        ...extra,
    };
}

export function ensureManifest(chatId) {
    const root = conversationDir(chatId);
    const mPath = manifestPath(chatId);
    if (!root || !mPath) return null;
    let manifest = readJsonFile(mPath, null);
    if (manifest?.activeSessionId && Array.isArray(manifest.sessions) && manifest.sessions.length) {
        return manifest;
    }

    // 매니페스트가 깨졌을 때 기존 세션 파일을 덮어쓰지 않는다. 디스크에 남은
    // sNNNNNN.json 중 가장 큰 번호 다음으로 새 세션을 잡는다.
    let maxSeq = 0;
    try {
        for (const name of fs.readdirSync(path.join(root, "sessions"))) {
            const m = /^s(\d+)\.json$/.exec(name);
            if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
        }
    } catch {
        // sessions 디렉터리가 아직 없으면 첫 세션부터 시작한다.
    }
    const sessionId = `s${String(maxSeq + 1).padStart(6, "0")}`;
    const relFile = `sessions/${sessionId}.json`;
    const now = new Date().toISOString();

    writeJsonAtomic(path.join(root, relFile), sessionPayload({ sessionId, turns: [] }));
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
    writeJsonAtomic(mPath, manifest);
    return manifest;
}

export function loadManifest(chatId) {
    const mPath = manifestPath(chatId);
    if (!chatId || !mPath) return null;
    return readJsonFile(mPath, null);
}

export function saveManifest(chatId, manifest) {
    const mPath = manifestPath(chatId);
    if (!mPath) return;
    writeJsonAtomic(mPath, manifest);
}

export function readActiveSessionData(chatId) {
    if (!chatId) return { turns: [] };
    ensureManifest(chatId);
    const filePath = activeSessionPath(chatId);
    if (!filePath || !fs.existsSync(filePath)) {
        return { turns: [] };
    }
    const data = readJsonFile(filePath, {});
    return { turns: Array.isArray(data.turns) ? data.turns : [] };
}

export function writeActiveSessionData(chatId, turns) {
    if (!chatId) return;
    const root = conversationDir(chatId);
    const manifest = ensureManifest(chatId);
    const entry = manifest?.sessions.find((s) => s.id === manifest.activeSessionId);
    if (!root || !entry?.file) return;
    const filePath = path.join(root, entry.file);
    writeJsonAtomic(
        filePath,
        sessionPayload({
            sessionId: manifest.activeSessionId,
            turns,
        }),
    );
}
