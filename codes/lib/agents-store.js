import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { USER_DIR } from "./paths.js";
import { writeFileAtomic, writeJsonAtomic } from "./atomic-file.js";

export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_AGENT_NAME = "tabyAgent";

const AGENTS_PATH = path.join(USER_DIR, "agents.json");
const AGENTS_ROOT = path.join(USER_DIR, "agents");
const DELETED_ROOT = path.join(USER_DIR, "temp", "deleted-agents");

const MAX_AGENTS = 20;
const MAX_NAME = 32;
const MAX_PERSONA = 500;
const MAX_ID = 24;

const TOPIC_COLORS = [7322096, 16766590, 13338331, 9367192, 16749490, 16478047];

function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.error("tabyAgent: invalid agents.json:", err.message);
        return fallback;
    }
}

function writeJson(filePath, data) {
    writeJsonAtomic(filePath, data);
}

function newUuid() {
    return crypto.randomUUID();
}

function normalizeThreadId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

let agentsCache = null;

function statMtime() {
    try {
        return fs.statSync(AGENTS_PATH).mtimeMs;
    } catch {
        return -1;
    }
}

export function loadAgentsStore() {
    const mtime = statMtime();
    if (agentsCache && mtime !== -1 && agentsCache.mtime === mtime) return agentsCache.store;
    const raw = readJson(AGENTS_PATH, { agents: [] });
    const agents = Array.isArray(raw?.agents) ? raw.agents.filter((a) => a && typeof a.id === "string") : [];
    let mutated = false;
    for (const a of agents) {
        if (!a.uuid) {
            a.uuid = newUuid();
            mutated = true;
        }
    }
    const store = { agents, mainThreadId: normalizeThreadId(raw?.mainThreadId) };
    if (mutated) writeJson(AGENTS_PATH, { agents, ...(store.mainThreadId ? { mainThreadId: store.mainThreadId } : {}) });
    agentsCache = { mtime: mutated ? statMtime() : mtime, store };
    return agentsCache.store;
}

export function saveAgentsStore(store) {
    const mainThreadId = normalizeThreadId(store.mainThreadId);
    const payload = { agents: store.agents || [] };
    if (mainThreadId) payload.mainThreadId = mainThreadId;
    writeJson(AGENTS_PATH, payload);
    agentsCache = { mtime: statMtime(), store: { agents: payload.agents, mainThreadId } };
}

export function getMainThreadId() {
    return loadAgentsStore().mainThreadId;
}

export function setMainThreadId(threadId) {
    const store = loadAgentsStore();
    store.mainThreadId = normalizeThreadId(threadId);
    saveAgentsStore(store);
    return store.mainThreadId;
}

export function listAgents() {
    return loadAgentsStore().agents;
}

export function firstAgent() {
    return listAgents()[0] || null;
}

export function firstAgentId() {
    return firstAgent()?.id || DEFAULT_AGENT_ID;
}

export function getAgent(id) {
    if (!id || id === DEFAULT_AGENT_ID) return null;
    return listAgents().find((a) => a.id === id) || null;
}

export function getAgentByUuid(uuid) {
    if (!uuid) return null;
    return listAgents().find((a) => a.uuid === uuid) || null;
}

export function findAgentByThread(threadId) {
    const n = Number(threadId);
    if (!Number.isInteger(n) || n <= 0) return null;
    return listAgents().find((a) => Number(a.threadId) === n) || null;
}

export function findAgentByNameOrId(query) {
    const q = String(query || "")
        .trim()
        .toLowerCase();
    if (!q) return null;
    return listAgents().find((a) => a.id.toLowerCase() === q || String(a.name || "").toLowerCase() === q) || null;
}

// 메인 에이전트는 스토어에 없는 가상 에이전트다. "main"/"tabyagent"를 받으면
// 실행용 유사 객체를 돌려주고, 그 외에는 실제 토픽 에이전트를 찾는다.
export function findAgentOrDefault(query) {
    const q = String(query || "")
        .trim()
        .toLowerCase();
    if (!q) return null;
    if (q === DEFAULT_AGENT_ID || q === DEFAULT_AGENT_NAME.toLowerCase() || q === "default") {
        return { id: DEFAULT_AGENT_ID, name: DEFAULT_AGENT_NAME };
    }
    return getAgent(q) || findAgentByNameOrId(q);
}

export function mainAgentRef() {
    return { id: DEFAULT_AGENT_ID, name: DEFAULT_AGENT_NAME };
}

export function slugifyAgentId(name, existingIds = []) {
    const ascii = String(name || "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_ID);

    let base = ascii || "agent";

    const used = new Set(existingIds);
    if (!used.has(base)) return base;
    for (let i = 2; i < 100; i += 1) {
        const next = `${base.slice(0, MAX_ID - 3)}-${i}`.slice(0, MAX_ID);
        if (!used.has(next)) return next;
    }
    return `${base.slice(0, 16)}-${Date.now().toString(36).slice(-6)}`;
}

export function normalizeAgentName(name) {
    const trimmed = String(name || "")
        .trim()
        .replace(/\s+/g, " ");
    if (!trimmed) return { error: "name_required" };
    if (trimmed.length > MAX_NAME) return { error: "name_too_long", max: MAX_NAME };
    return { name: trimmed };
}

export function normalizeAgentPersona(persona) {
    const trimmed = String(persona || "").trim();
    if (!trimmed || trimmed === "-" || trimmed === "—") return { error: "persona_required" };
    if (trimmed.length > MAX_PERSONA) return { error: "persona_too_long", max: MAX_PERSONA };
    return { persona: trimmed };
}

export function topicIconColor(id) {
    let hash = 0;
    for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return TOPIC_COLORS[hash % TOPIC_COLORS.length];
}

const AVATAR_COLORS = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#32d74b", "#64d2ff"];
export function agentColor(id) {
    let hash = 0;
    for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function agentHomeDir(id) {
    return path.join(AGENTS_ROOT, id);
}

export function agentMemoryPath(id) {
    return path.join(agentHomeDir(id), "memory.md");
}

export function agentMemoryDir(id) {
    return path.join(agentHomeDir(id), "memory");
}

export function ensureAgentMemory(id) {
    const file = agentMemoryPath(id);
    if (!fs.existsSync(file)) {
        writeFileAtomic(file, `# ${id} memory\n\n`);
    }
    return file;
}

export function canAddAgent() {
    return listAgents().length < MAX_AGENTS;
}

export function addAgent({ name, persona, threadId }) {
    const named = normalizeAgentName(name);
    if (named.error) return named;
    const person = normalizeAgentPersona(persona);
    if (person.error) return person;
    if (!canAddAgent()) return { error: "too_many", max: MAX_AGENTS };

    const store = loadAgentsStore();
    const id = slugifyAgentId(
        named.name,
        store.agents.map((a) => a.id),
    );
    const agent = {
        id,
        uuid: newUuid(),
        name: named.name,
        persona: person.persona,
        threadId: Number(threadId),
        createdAt: new Date().toISOString(),
    };
    store.agents.push(agent);
    saveAgentsStore(store);
    ensureAgentMemory(id);
    return { agent };
}

export function updateAgent(id, patch) {
    const store = loadAgentsStore();
    const idx = store.agents.findIndex((a) => a.id === id);
    if (idx < 0) return { error: "not_found" };
    const current = store.agents[idx];
    if (patch.name !== undefined) {
        const named = normalizeAgentName(patch.name);
        if (named.error) return named;
        current.name = named.name;
    }
    if (patch.persona !== undefined) {
        const person = normalizeAgentPersona(patch.persona);
        if (person.error) return person;
        current.persona = person.persona;
    }
    if (patch.threadId !== undefined) current.threadId = Number(patch.threadId);
    store.agents[idx] = current;
    saveAgentsStore(store);
    return { agent: current };
}

function moveDirAside(src) {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(DELETED_ROOT, { recursive: true });
    const dest = path.join(DELETED_ROOT, `${path.basename(src)}-${Date.now()}`);
    fs.renameSync(src, dest);
    return true;
}

export function removeAgent(id) {
    const store = loadAgentsStore();
    const idx = store.agents.findIndex((a) => a.id === id);
    if (idx < 0) return { error: "not_found" };
    const [removed] = store.agents.splice(idx, 1);
    saveAgentsStore(store);
    moveDirAside(agentHomeDir(id));
    // 에이전트의 자동화/인계 항목도 같이 정리한다 (순환 import 회피를 위해 지연 로드).
    import("./todos/store.js").then((m) => m.purgeAgentTodos(id)).catch(() => {});
    return { agent: removed };
}

export function formatPeerAgentsForPrompt(currentId = DEFAULT_AGENT_ID) {
    const lines = [];
    if (currentId !== DEFAULT_AGENT_ID) {
        lines.push(`- **${DEFAULT_AGENT_NAME}** (\`${DEFAULT_AGENT_ID}\`) — default assistant`);
    }
    for (const a of listAgents().filter((agent) => agent.id !== currentId)) {
        const role = a.persona ? ` — ${a.persona}` : "";
        lines.push(`- **${a.name}** (\`${a.id}\`)${role}`);
    }
    return lines.join("\n");
}
