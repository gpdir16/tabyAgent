// tabyAgent의 user/ 데이터를 tabyBot의 user/ 레이아웃으로 옮기는 일회성 익스포트.
// 원칙:
// - 소스(tabyAgent)는 절대 수정하지 않는다.
// - 대상(tabyBot user dir)의 기존 데이터는 병합한다. 덮어쓰거나 고치는 파일은
//   먼저 <name>.premigration-<ts>.bak으로 백업한다.
// - 심볼릭 링크는 따라가지 않는다 (docker 이미지의 .cache/camoufox 같은 링크 보호).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { USER_DIR } from "./paths.js";
import { writeFileAtomic, writeJsonAtomic } from "./atomic-file.js";
import { loadUserConfig, saveUserConfig } from "./config-loader.js";
import { t } from "./i18n.js";
import { sendMessageSafe } from "./telegram-api.js";

const MANIFEST_VERSION = 1;
const HISTORY_VERSION = 3;
const SCHEDULED_MARKER_SRC = "tabyagent-scheduled";
const SCHEDULED_MARKER_DST = "tabybot-scheduled";
const TABYBOT_MAIN_NAME = "tabyBot";

// 같은 경로·같은 형태로 그대로 복사되는 OAuth 토큰 파일들.
const AUTH_TOKEN_FILES = ["grok-auth.json", "github-copilot-auth.json", "codex-auth.json"];

// user/ 아래에서 "없으면 복사, 있으면 보존(파일 단위 병합)"하는 디렉터리.
const MERGE_COPY_DIRS = ["agents", "skills", "dreams", "download", "camofox", "memory"];

// 텔레그램/웹 각자 전용이라 이전 대상이 아닌 최상위 항목들.
const KNOWN_SKIP = new Set([
    "approved.json", // 텔레그램 승인 목록 — tabyBot은 web auth.json 사용
    "auth.json", // tabyBot 웹 계정 — 여기서 만들지 않음
    "config.json",
    "agents.json",
    "todos.json",
    "mcp.json",
    "memory.md",
    "temp",
    "session", // tabyBot 소유 — 세션은 temp/chat-* 에서 변환해 채운다
    "web-push",
    "uploads",
    ".cache",
]);

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(filePath, data) {
    writeJsonAtomic(filePath, data);
}

function isDirectory(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

// 대상 파일을 고치기 전에 한 번만 옆에 둔다.
function backupFile(filePath, backups) {
    if (!fs.existsSync(filePath)) return null;
    const dest = `${filePath}.premigration-${stamp()}.bak`;
    try {
        fs.copyFileSync(filePath, dest);
        backups.push(dest);
        return dest;
    } catch {
        return null;
    }
}

// src 디렉터리의 파일을 dst로 재귀 복사한다. 이미 있는 파일은 절대 덮지 않고,
// 심볼릭 링크는 건너뛴다. exclude(최상위 이름)는 별도 처리되므로 집계하지 않는다.
function copyMissing(srcDir, dstDir, stats, exclude = null) {
    let entries;
    try {
        entries = fs.readdirSync(srcDir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (exclude?.has(entry.name)) continue;
        if (entry.isSymbolicLink()) {
            stats.skipped += 1;
            continue;
        }
        const s = path.join(srcDir, entry.name);
        const d = path.join(dstDir, entry.name);
        if (entry.isDirectory()) {
            copyMissing(s, d, stats);
            continue;
        }
        if (!entry.isFile()) continue;
        if (fs.existsSync(d)) {
            stats.skipped += 1;
            continue;
        }
        try {
            fs.mkdirSync(dstDir, { recursive: true });
            fs.copyFileSync(s, d);
            stats.copied += 1;
        } catch {
            stats.skipped += 1;
        }
    }
}

// 존재하면 같은 내용일 때만 스킵. 다르면 날짜 섹션을 달아 이어붙인다.
function mergeMarkdownFile(srcPath, dstPath, backups) {
    if (!fs.existsSync(srcPath)) return "absent";
    const src = fs.readFileSync(srcPath, "utf8");
    if (!fs.existsSync(dstPath)) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        writeFileAtomic(dstPath, src);
        return "copied";
    }
    const dst = fs.readFileSync(dstPath, "utf8");
    if (dst.trim() === src.trim()) return "identical";
    backupFile(dstPath, backups);
    const date = new Date().toISOString().slice(0, 10);
    const merged = `${dst.replace(/\s+$/, "")}\n\n## Migrated from tabyAgent (${date})\n\n${src.trim()}\n`;
    writeFileAtomic(dstPath, merged);
    return "appended";
}

// ---------- 에이전트 ----------

function uniqueId(base, used) {
    let id = base || "agent";
    for (let i = 2; used.has(id); i += 1) id = `${base}-${i}`;
    used.add(id);
    return id;
}

// agents.json을 병합하고 세션키→tabyBot uuid / 에이전트 id 리매핑을 만든다.
function migrateAgents(srcDir, dstDir, report, backups) {
    const srcAgents = (readJson(path.join(srcDir, "agents.json"), {})?.agents || []).filter((a) => a && typeof a.id === "string");
    const dstPath = path.join(dstDir, "agents.json");
    const dst = readJson(dstPath, { agents: [] });
    const dstAgents = Array.isArray(dst?.agents) ? dst.agents.filter((a) => a && typeof a.id === "string") : [];
    const usedIds = new Set(dstAgents.map((a) => a.id));
    const usedUuids = new Set(dstAgents.map((a) => a.uuid).filter(Boolean));

    // tabyAgent의 메인은 가상 에이전트 — tabyBot에서는 실제 "main" 엔트리가 필요하다.
    let main = dstAgents.find((a) => a.id === "main") || dstAgents[0] || null;
    let addedMain = false;
    if (!main) {
        main = {
            id: "main",
            uuid: crypto.randomUUID(),
            name: TABYBOT_MAIN_NAME,
            persona: "",
            createdAt: new Date().toISOString(),
        };
        usedIds.add("main");
        usedUuids.add(main.uuid);
        dstAgents.push(main);
        addedMain = true;
    }
    const idRemap = new Map([["main", main.id]]);
    const threadToUuid = new Map();
    const pickUuid = (preferred) => (preferred && !usedUuids.has(preferred) ? preferred : crypto.randomUUID());

    let added = addedMain ? 1 : 0;
    let reused = 0;
    for (const a of srcAgents) {
        const existing = dstAgents.find((d) => d.id === a.id);
        let mapped = existing;
        if (!mapped) {
            const dstId = uniqueId(a.id, usedIds);
            mapped = {
                id: dstId,
                uuid: pickUuid(a.uuid),
                name: a.name || dstId,
                persona: a.persona || "",
                createdAt: a.createdAt || new Date().toISOString(),
            };
            dstAgents.push(mapped);
            added += 1;
        } else {
            reused += 1;
        }
        usedUuids.add(mapped.uuid);
        idRemap.set(a.id, mapped.id);
        const tid = Number(a.threadId);
        if (Number.isInteger(tid) && tid > 0) threadToUuid.set(tid, mapped.uuid);
    }

    const changed = added > 0;
    if (changed) {
        if (fs.existsSync(dstPath)) backupFile(dstPath, backups);
        writeJson(dstPath, { agents: dstAgents });
    }
    report.agents = { added, reused, total: dstAgents.length };

    // 에이전트 홈 디렉터리(memory.md, memory/, 레거시 todos.json 등)는 파일 단위 병합.
    const dirStats = { copied: 0, skipped: 0 };
    for (const a of srcAgents) {
        const dstId = idRemap.get(a.id);
        if (!dstId) continue;
        copyMissing(path.join(srcDir, "agents", a.id), path.join(dstDir, "agents", dstId), dirStats);
    }
    report.agentDirs = dirStats;

    // 세션 키 → tabyBot conversation id(=에이전트 uuid).
    const agentUuidForSessionKey = (key) => {
        const m = /^(-?\d+)(?::t(\d+))?$/.exec(String(key || "").trim());
        if (!m) return null;
        if (!m[2]) return main.uuid;
        return threadToUuid.get(Number(m[2])) || null;
    };
    return { agentUuidForSessionKey, idRemap, mainUuid: main.uuid };
}

// ---------- config ----------

function migrateConfig(srcDir, dstDir, report, backups) {
    const srcPath = path.join(srcDir, "config.json");
    const src = readJson(srcPath);
    if (!src || typeof src !== "object") {
        report.config = "absent";
        return;
    }
    // telegram.botToken 등 텔레그램 전용 설정은 옮기지 않는다.
    const { telegram: _drop, ...shared } = src;
    const dstPath = path.join(dstDir, "config.json");
    const dst = readJson(dstPath);
    if (!dst || typeof dst !== "object") {
        writeJson(dstPath, shared);
        report.config = "written";
        return;
    }
    // 소스 값을 우선하되 대상에만 있는 키(onboardingDismissed, 웹 설정 등)는 보존한다.
    const merged = { ...shared };
    for (const k of Object.keys(dst)) {
        if (!(k in merged)) merged[k] = dst[k];
    }
    if (JSON.stringify(merged) === JSON.stringify(dst)) {
        report.config = "identical";
        return;
    }
    backupFile(dstPath, backups);
    writeJson(dstPath, merged);
    report.config = "merged";
}

// ---------- todos ----------

function remapTodo(item, { agentUuidForSessionKey, idRemap }) {
    const out = { ...item };
    const conv = String(out.conversationId || "").trim();
    out.conversationId = conv ? agentUuidForSessionKey(conv) || "" : "";
    if (out.list && out.list !== "user") out.list = idRemap.get(out.list) || out.list;
    if (out.assigneeId) out.assigneeId = idRemap.get(out.assigneeId) || out.assigneeId;
    if (Array.isArray(out.offers)) {
        out.offers = out.offers.map((o) => ({ ...o, agentId: idRemap.get(o?.agentId) || o?.agentId }));
    }
    return out;
}

function migrateTodos(srcDir, dstDir, maps, report, backups) {
    const src = readJson(path.join(srcDir, "todos.json"));
    const items = Array.isArray(src?.items) ? src.items : [];
    const suggestions = Array.isArray(src?.suggestions) ? src.suggestions : [];
    if (!items.length && !suggestions.length) {
        report.todos = { added: 0, skipped: 0 };
        return;
    }
    const dstPath = path.join(dstDir, "todos.json");
    const dst = readJson(dstPath, { items: [], suggestions: [] });
    const dstItems = Array.isArray(dst.items) ? dst.items : [];
    const dstSuggestions = Array.isArray(dst.suggestions) ? dst.suggestions : [];
    const seen = new Set([...dstItems, ...dstSuggestions].map((r) => r?.id).filter(Boolean));

    let added = 0;
    let skipped = 0;
    for (const item of items) {
        if (item?.id && seen.has(item.id)) {
            skipped += 1;
            continue;
        }
        const next = remapTodo(item, maps);
        if (seen.has(next.id)) next.id = crypto.randomBytes(6).toString("hex");
        seen.add(next.id);
        dstItems.push(next);
        added += 1;
    }
    for (const row of suggestions) {
        if (row?.id && seen.has(row.id)) {
            skipped += 1;
            continue;
        }
        const next = { ...row, agentId: maps.idRemap.get(row?.agentId) || row?.agentId || "" };
        dstSuggestions.push(next);
        added += 1;
    }
    if (added) {
        if (fs.existsSync(dstPath)) backupFile(dstPath, backups);
        writeJson(dstPath, { items: dstItems, suggestions: dstSuggestions });
    }
    report.todos = { added, skipped };
}

// ---------- MCP / 메모리 ----------

function migrateMcp(srcDir, dstDir, report, backups) {
    const src = readJson(path.join(srcDir, "mcp.json"));
    const srcServers = Array.isArray(src?.servers) ? src.servers : [];
    if (!srcServers.length) {
        report.mcp = { added: 0, skipped: 0 };
        return;
    }
    const dstPath = path.join(dstDir, "mcp.json");
    const dst = readJson(dstPath, { servers: [] });
    const dstServers = Array.isArray(dst.servers) ? dst.servers : [];
    const names = new Set(dstServers.map((s) => s?.name).filter(Boolean));
    let added = 0;
    let skipped = 0;
    for (const s of srcServers) {
        if (s?.name && names.has(s.name)) {
            skipped += 1;
            continue;
        }
        dstServers.push(s);
        if (s?.name) names.add(s.name);
        added += 1;
    }
    if (added) {
        if (fs.existsSync(dstPath)) backupFile(dstPath, backups);
        writeJson(dstPath, { ...dst, servers: dstServers });
    }
    report.mcp = { added, skipped };
}

// ---------- 세션 (temp/chat-* → session/<uuid>) ----------

// 세션 파일 본문 정규화: 스케줄 마커 치환 + 첨부 절대경로를 대상 user/ 기준으로 옮긴다.
function transformSessionPayload(data, newSessionId, srcUserDir, dstUserDir) {
    const fixPath = (v) =>
        typeof v === "string" && (v === srcUserDir || v.startsWith(`${srcUserDir}${path.sep}`)) ? `${dstUserDir}${v.slice(srcUserDir.length)}` : v;
    const fixAttachments = (list) =>
        Array.isArray(list)
            ? list.map((a) => {
                  if (!a || typeof a !== "object") return a;
                  const out = { ...a };
                  for (const k of ["filePath", "path", "uploadPath"]) {
                      if (out[k]) out[k] = fixPath(out[k]);
                  }
                  return out;
              })
            : list;
    const turns = (Array.isArray(data?.turns) ? data.turns : []).map((turn) => {
        const t = { ...turn };
        if (Array.isArray(t.messages)) {
            t.messages = t.messages.map((m) => {
                if (!m || typeof m !== "object") return m;
                const out = { ...m };
                if (typeof out.content === "string" && out.content.includes(SCHEDULED_MARKER_SRC)) {
                    out.content = out.content.split(SCHEDULED_MARKER_SRC).join(SCHEDULED_MARKER_DST);
                }
                if (out.attachments) out.attachments = fixAttachments(out.attachments);
                return out;
            });
        }
        if (t.attachments) t.attachments = fixAttachments(t.attachments);
        return t;
    });
    return { ...data, version: HISTORY_VERSION, sessionId: newSessionId, turns };
}

function sessionSeq(id) {
    const m = /^s(\d+)$/.exec(id || "");
    return m ? Number(m[1]) : 0;
}

// 대화 디렉터리 하나의 세션 엔트리를 읽는다 (매니페스트 우선, 없으면 파일 나열로 복구).
// 각 엔트리에 _root(디렉터리)와 _origin(재실행 중복 방지 태그)을 단다.
function collectConvEntries(srcRoot) {
    const key = path.basename(srcRoot).replace(/^chat-/, "");
    const tag = (id) => `tabyagent:${key}:${id}`;
    const manifest = readJson(path.join(srcRoot, "manifest.json"));
    const entries = Array.isArray(manifest?.sessions) ? manifest.sessions.map((e) => ({ ...e, _root: srcRoot, _origin: tag(e.id) })) : [];
    if (!entries.length) {
        // 매니페스트 없이 세션 파일만 남은 경우도 아카이브로 살린다.
        try {
            for (const name of fs.readdirSync(path.join(srcRoot, "sessions"))) {
                const m = /^s(\d+)\.json$/.exec(name);
                if (m) {
                    const id = `s${String(Number(m[1])).padStart(6, "0")}`;
                    entries.push({ id, file: `sessions/${name}`, kind: "archived", _root: srcRoot, _origin: tag(id) });
                }
            }
        } catch {}
    }
    return { manifest, entries };
}

// 여러 텔레그램 대화 디렉터리를 한 에이전트의 tabyBot 대화로 합친다.
// 대상에 활성 세션이 이미 있으면 이전분은 모두 archived로 내린다.
// 이미 이전된 세션(migratedFrom 태그 일치)은 건너뛰어 재실행이 안전하다.
function mergeConversationDirs(srcRoots, dstRoot, srcUserDir, dstUserDir, backups) {
    const dstManifestPath = path.join(dstRoot, "manifest.json");
    const dstManifest = readJson(dstManifestPath);
    const dstEntries = Array.isArray(dstManifest?.sessions) ? [...dstManifest.sessions] : [];
    const dstHadActive = Boolean(dstManifest?.activeSessionId);
    const alreadyMigrated = new Set(dstEntries.map((e) => e?.migratedFrom).filter(Boolean));

    const srcEntries = [];
    let srcPreview = "";
    let srcCompressedAt = null;
    let dupes = 0;
    for (const srcRoot of srcRoots) {
        const { manifest, entries } = collectConvEntries(srcRoot);
        for (const e of entries) {
            if (alreadyMigrated.has(e._origin)) {
                dupes += 1;
                continue;
            }
            srcEntries.push(e);
        }
        if (!srcPreview && manifest?.preview) srcPreview = manifest.preview;
        if (manifest?.lastCompressedAt && (!srcCompressedAt || manifest.lastCompressedAt > srcCompressedAt)) {
            srcCompressedAt = manifest.lastCompressedAt;
        }
    }
    if (!srcEntries.length) return { added: 0, dupes };
    srcEntries.sort((a, b) => String(a.startedAt || "").localeCompare(String(b.startedAt || "")) || sessionSeq(a.id) - sessionSeq(b.id));

    let seq = 0;
    for (const e of dstEntries) seq = Math.max(seq, sessionSeq(e.id));
    try {
        for (const name of fs.readdirSync(path.join(dstRoot, "sessions"))) {
            const m = /^s(\d+)\.json$/.exec(name);
            if (m) seq = Math.max(seq, Number(m[1]));
        }
    } catch {}

    // 같은 소스 id가 다른 채팅 디렉터리에 반복될 수 있으므로 (root, id) 쌍으로 리매핑한다.
    // 이전 실행에서 이미 옮긴 세션은 idMap에 없으므로 migratedFrom 태그로 역조회한다.
    const keyOf = (root) => path.basename(root).replace(/^chat-/, "");
    const dstByOrigin = new Map();
    for (const e of dstEntries) {
        if (e?.migratedFrom) dstByOrigin.set(e.migratedFrom, e.id);
    }
    const idMap = new Map();
    const migrated = [];
    for (const entry of srcEntries) {
        seq += 1;
        const newId = `s${String(seq).padStart(6, "0")}`;
        idMap.set(`${entry._root}::${entry.id}`, newId);
        migrated.push({ entry, newId });
    }
    const mapRef = (entry, ref) => (ref && idMap.get(`${entry._root}::${ref}`)) || dstByOrigin.get(`tabyagent:${keyOf(entry._root)}:${ref}`) || null;
    for (const { entry, newId } of migrated) {
        const srcFile = path.join(entry._root, entry.file || `sessions/${entry.id}.json`);
        const data = readJson(srcFile);
        if (!data) continue;
        const out = transformSessionPayload(data, newId, srcUserDir, dstUserDir);
        for (const k of ["parentSessionId", "compressedFromSessionId"]) {
            const mapped = mapRef(entry, out[k]);
            if (mapped) out[k] = mapped;
            else delete out[k];
        }
        writeJson(path.join(dstRoot, "sessions", `${newId}.json`), out);
        const ref = {};
        for (const k of ["parentSessionId", "compressedFromSessionId"]) {
            const mapped = mapRef(entry, entry[k]);
            if (mapped) ref[k] = mapped;
        }
        const { _root, _origin, parentSessionId: _p, compressedFromSessionId: _c, ...rest } = entry;
        dstEntries.push({
            ...rest,
            ...ref,
            id: newId,
            file: `sessions/${newId}.json`,
            kind: dstHadActive ? "archived" : entry.kind || "archived",
            migratedFrom: _origin,
        });
    }

    // 활성 세션: 대상 것이 우선. 없으면 이전분 중 가장 최근의 active를 살린다.
    let activeId = dstManifest?.activeSessionId || null;
    if (!activeId) {
        const actives = migrated.filter((m) => m.entry.kind === "active");
        activeId = (actives.at(-1) || migrated.at(-1))?.newId || null;
    }
    // active는 하나만 — 선택되지 않은 이전분의 active 라벨을 archived로 내린다.
    for (const e of dstEntries) {
        if (e.kind === "active" && e.id !== activeId) e.kind = "archived";
    }

    const manifest = {
        version: MANIFEST_VERSION,
        ...(dstManifest || {}),
        sessions: dstEntries,
        activeSessionId: activeId,
    };
    if (!manifest.preview && srcPreview) manifest.preview = srcPreview;
    if (!manifest.lastCompressedAt && srcCompressedAt) manifest.lastCompressedAt = srcCompressedAt;
    if (fs.existsSync(dstManifestPath)) backupFile(dstManifestPath, backups);
    writeJson(dstManifestPath, manifest);
    return { added: migrated.length, dupes };
}

function migrateSessions(srcDir, dstDir, agentUuidForSessionKey, report, backups) {
    const tempDir = path.join(srcDir, "temp");
    const byAgent = new Map(); // dstUuid → [src chat dir]
    const skippedKeys = [];
    let names = [];
    try {
        names = fs.readdirSync(tempDir);
    } catch {}
    for (const name of names) {
        if (!name.startsWith("chat-")) continue;
        const dir = path.join(tempDir, name);
        if (!isDirectory(dir)) continue;
        const key = name.slice("chat-".length);
        const uuid = agentUuidForSessionKey(key);
        if (!uuid) {
            skippedKeys.push(key);
            continue;
        }
        if (!byAgent.has(uuid)) byAgent.set(uuid, []);
        byAgent.get(uuid).push(dir);
    }
    let conversations = 0;
    let sessions = 0;
    let dupes = 0;
    for (const [uuid, dirs] of byAgent) {
        const dstRoot = path.join(dstDir, "session", uuid);
        const r = mergeConversationDirs(dirs.sort(), dstRoot, srcDir, dstDir, backups);
        sessions += r.added;
        dupes += r.dupes;
        conversations += 1;
    }
    report.sessions = { conversations, sessions, dupes, skipped: skippedKeys };
}

// ---------- 엔트리 ----------

export function migrateToTabyBot(targetUserDir, sourceUserDir = USER_DIR) {
    const srcDir = path.resolve(sourceUserDir);
    const dstDir = path.resolve(targetUserDir);
    if (!isDirectory(srcDir)) throw new Error(`tabyAgent user dir not found: ${srcDir}`);
    if (dstDir === srcDir || dstDir.startsWith(`${srcDir}${path.sep}`)) {
        throw new Error("target must not be inside the tabyAgent user dir");
    }
    fs.mkdirSync(dstDir, { recursive: true });

    const report = { source: srcDir, target: dstDir, backups: [], notes: [], unhandled: [] };
    const backups = report.backups;

    migrateConfig(srcDir, dstDir, report, backups);
    const maps = migrateAgents(srcDir, dstDir, report, backups);
    migrateTodos(srcDir, dstDir, maps, report, backups);
    migrateMcp(srcDir, dstDir, report, backups);
    migrateSessions(srcDir, dstDir, maps.agentUuidForSessionKey, report, backups);

    // memory.md / DREAMS.md는 충돌 시 날짜 섹션으로 이어붙인다.
    report.memory = mergeMarkdownFile(path.join(srcDir, "memory.md"), path.join(dstDir, "memory.md"), backups);

    // 디렉터리 병합 복사 (기존 파일 보존). agents/는 위에서 이미 처리했다.
    const dirStats = {};
    for (const name of MERGE_COPY_DIRS) {
        if (name === "agents") continue;
        const src = path.join(srcDir, name);
        if (!isDirectory(src)) continue;
        const stats = { copied: 0, skipped: 0 };
        if (name === "dreams") {
            // DREAMS.md는 다이어리 — 복사 대신 내용 병합.
            const d = path.join(src, "DREAMS.md");
            if (fs.existsSync(d)) {
                report.dreamsDiary = mergeMarkdownFile(d, path.join(dstDir, "dreams", "DREAMS.md"), backups);
            }
            copyMissing(src, path.join(dstDir, name), stats, new Set(["DREAMS.md"]));
        } else {
            copyMissing(src, path.join(dstDir, name), stats);
        }
        dirStats[name] = stats;
    }
    report.dirs = dirStats;

    // OAuth 토큰 파일은 같은 파일명으로만 복사 (대상에 있으면 보존).
    const auth = { copied: [], skipped: [] };
    for (const name of AUTH_TOKEN_FILES) {
        const s = path.join(srcDir, name);
        const d = path.join(dstDir, name);
        if (!fs.existsSync(s)) continue;
        if (fs.existsSync(d)) {
            auth.skipped.push(name);
            continue;
        }
        fs.copyFileSync(s, d);
        auth.copied.push(name);
    }
    report.authTokens = auth;

    // 사용자에게 보여줄 수 있게 처리하지 않은 최상위 항목을 열거한다.
    for (const name of fs.readdirSync(srcDir)) {
        if (KNOWN_SKIP.has(name) || MERGE_COPY_DIRS.includes(name) || AUTH_TOKEN_FILES.includes(name)) continue;
        if (name === "agents") continue;
        report.unhandled.push(name);
    }
    report.notes.push("telegram bot token / approved.json were not migrated (tabyBot uses web auth)");
    report.notes.push("memory/ topic files were copied as files; tabyBot auto-loads only memory.md");
    return report;
}

// ---------- 전송 패키지 (txt) ----------
// tabyBot이 다른 머신에 있을 때 쓰는 자기완결 txt다.
// 변환은 여기서 끝낸 뒤 tar.gz로 묶고, 복원(파일 병합)은 tabyBot 에이전트가
// 자기 파일/터미널 도구로 하도록 프롬프트만 붙인다 — 스크립트는 싣지 않는다.

// Telegram 문서 한도 50MB 대비 여유.
const TRANSFER_MAX_GZ_BYTES = 35 * 1024 * 1024;

// 용량 초과 시 빼도 되는 부가 데이터 — 정체성(설정/기억/대화)이 아니라 캐시성이다.
const EXCLUDABLE_DIRS = ["camofox", "download"];

function transferPrompt(excluded = []) {
    return [
        "# tabyAgent → tabyBot migration package",
        "",
        "This file contains tabyAgent data, already converted to tabyBot's format.",
        "Upload it to tabyBot (or paste the whole content as a message) — the agent will do the rest.",
        "",
        "WARNING: this file contains API keys and auth tokens. Treat it like a password — do not share it.",
        ...(excluded.length
            ? [
                  "",
                  `Note: ${excluded.join(", ")} were excluded from this package for size — cached downloads and browser profiles only; nothing essential was dropped.`,
              ]
            : []),
        "",
        "---",
        "Instructions for tabyBot (the agent):",
        "",
        "The block below is a base64-encoded tar.gz. Extracting it yields `payload/` — a complete",
        "tabyBot user directory (config.json, agents.json, session/<uuid>/, memory.md, todos.json,",
        "mcp.json, skills/, dreams/, download/, camofox/, auth tokens) already converted from",
        "tabyAgent format.",
        "",
        "If this text arrived as an uploaded file, work on that file directly (it lives in your",
        "uploads/ dir) — do NOT paste it back into the chat.",
        "",
        "Steps:",
        "1. Save the base64 block to a temp file, decode and extract it, e.g.",
        "   `base64 -d < pkg.b64 | tar xzf - -C /tmp/tabyagent-migration`",
        "   (extract anywhere writable; /tmp is fine).",
        "2. Find your own user directory — the one holding your config.json / agents.json",
        "   (usually $USER_DIR; if this file came as an upload it sits at <user dir>/uploads/,",
        "   so your user dir is the upload's parent).",
        "3. Merge `payload/` into that directory:",
        "   - Copy every file/directory that does not already exist.",
        "   - Keep your existing files EXCEPT:",
        "     * memory.md and dreams/DREAMS.md → append the payload content under a",
        "       `## Migrated from tabyAgent (YYYY-MM-DD)` heading.",
        "     * agents.json, todos.json, mcp.json → merge: keep your entries and add the new ones;",
        "       skip entries whose id/name already exists.",
        "     * session/<uuid>/ → each dir belongs to the agent with that uuid. If that agent",
        "       already exists under a different uuid in your agents.json, move the session files",
        "       into the existing dir instead: renumber sNNNNNN ids sequentially, update",
        "       manifest.json, and keep exactly one active session.",
        "4. Reply to the user (in their language) with a short summary of what was migrated,",
        "   then delete the extracted files.",
        "",
        "---",
    ].join("\n");
}

// 변환된 user 트리를 tar.gz → base64로 싣고 지시문을 붙인 txt를 만든다.
// 반환: { path, sizeBytes, report } — report는 변환 리포트(대상은 임시 경로).
export function buildTabyBotTransferTxt(destPath, { sourceUserDir = USER_DIR } = {}) {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "tabybot-migration-"));
    try {
        const payloadDir = path.join(staging, "payload");
        const report = migrateToTabyBot(payloadDir, sourceUserDir);
        const tarPath = path.join(staging, "payload.tar.gz");
        const pack = () => {
            execFileSync("tar", ["-czf", tarPath, "-C", staging, "payload"]);
            return fs.statSync(tarPath).size;
        };
        let gzSize = pack();
        const excluded = [];
        // Telegram 한도 초과 시 캐시성 디렉터리만 빼고 다시 묶는다.
        if (gzSize > TRANSFER_MAX_GZ_BYTES) {
            for (const name of EXCLUDABLE_DIRS) {
                if (fs.existsSync(path.join(payloadDir, name))) excluded.push(`${name}/`);
                fs.rmSync(path.join(payloadDir, name), { recursive: true, force: true });
            }
            gzSize = pack();
        }
        if (gzSize > TRANSFER_MAX_GZ_BYTES) {
            throw new Error(
                `package too large (~${Math.ceil(gzSize / 1024 / 1024)}MB compressed) even after excluding ${EXCLUDABLE_DIRS.join("/")} — delete old files/sessions in the bot first, then retry /migrate`,
            );
        }
        report.excludedDirs = excluded;
        const b64 = fs.readFileSync(tarPath).toString("base64");
        const txt = `${transferPrompt(excluded)}\n=== BEGIN BASE64 PAYLOAD (tar.gz) ===\n${b64}\n=== END BASE64 PAYLOAD ===\n`;
        const resolved = path.resolve(destPath);
        writeFileAtomic(resolved, txt);
        return { path: resolved, sizeBytes: fs.statSync(resolved).size, report };
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
}

// "무엇이 다른가요?" 버튼이 여는 리드미 비교 섹션 — README.ja.md는 없어 en으로 보낸다.
function migrateReadmeUrl(lang) {
    if (lang === "ko") return "https://github.com/gpdir16/tabyAgent/blob/main/README.ko.md#차이점";
    return "https://github.com/gpdir16/tabyAgent/blob/main/README.md#differences";
}

// 첫 실행 후 한 번만 tabyBot 이전을 안내한다. 선택 사항이지만 장기적으로 권장.
// sendOpts는 호출자가 만든다(토픽 스레드 등) — 이 모듈은 텔레그램 라우팅을 모른다.
export async function maybeSendMigrateNotice(bot, chatId, { lang, sendOpts } = {}) {
    try {
        if (!chatId) return;
        const config = loadUserConfig();
        if (config.migrateNoticeShown) return;
        config.migrateNoticeShown = true;
        // 발송 실패로 재발송되는 것보다 누락이 낫다 — 플래그를 먼저 세운다.
        saveUserConfig(config);
        const language = lang || config.language || "en";
        const opts = {
            ...(sendOpts || {}),
            reply_markup: { inline_keyboard: [[{ text: t("migrate_notice_button", language), url: migrateReadmeUrl(language) }]] },
        };
        await sendMessageSafe(bot, String(chatId), t("migrate_notice", language), opts);
    } catch (err) {
        console.warn("tabyAgent: migrate notice failed:", err?.message || err);
    }
}

// /migrate를 이미 쓴 사용자에게는 안내가 필요 없다.
export function markMigrateNoticeSeen() {
    const config = loadUserConfig();
    if (config.migrateNoticeShown) return;
    config.migrateNoticeShown = true;
    saveUserConfig(config);
}
