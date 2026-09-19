// 기존 사용자 데이터의 일회성 이전. 모든 단계는 멱등이다:
// - cron.json → todos.json 변환 후 cron.json은 .bak으로 옮겨 재실행을 막는다.
// - 같은 항목이 이미 todos에 있으면(제목+크론+프롬프트+세션 일치) 건너뛴다.
// - 원본은 변환이 모두 성공한 뒤에만 옆으로 옮긴다 (삭제하지 않는다).
import fs from "node:fs";
import path from "node:path";
import { USER_DIR } from "./paths.js";
import { agentIdForSessionKey, isValidSessionKey } from "./agent/chat-history.js";
import { cronConfigPath } from "./path-labels.js";
import { addTodo } from "./todos/store.js";

const MIGRATED_SUFFIX = ".migrated.bak";

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return fallback;
    }
}

// 레거시 cron 잡 한 개를 todos 항목으로 변환한다. 스토어에 이미 있으면 null.
function cronJobToTodo(job, existing) {
    const title = String(job?.name || "").trim();
    const prompt = String(job?.prompt || "").trim();
    const schedule = String(job?.schedule || "").trim();
    if (!title || !prompt || !schedule) return null;
    const conversationId = isValidSessionKey(job?.chatId) ? String(job.chatId).trim() : "";
    const list = agentIdForSessionKey(conversationId) || "main";
    const dupe = existing.some(
        (item) =>
            item.title === title &&
            (item.cron || "") === schedule &&
            (item.prompt || "") === prompt &&
            (item.conversationId || "") === conversationId,
    );
    if (dupe) return null;
    return {
        title,
        prompt,
        cron: schedule,
        list,
        conversationId,
        enabled: job.enabled !== false,
        createdBy: "agent",
    };
}

// user/cron.json의 잡을 todos 스토어로 옮긴다. 반환값: 이전 개수.
export function migrateCronToTodos() {
    const cronPath = cronConfigPath();
    if (!fs.existsSync(cronPath)) return { migrated: 0, skipped: 0 };

    const raw = readJson(cronPath, {});
    const jobs = Array.isArray(raw?.jobs) ? raw.jobs : [];
    if (!jobs.length) {
        fs.renameSync(cronPath, cronPath + MIGRATED_SUFFIX);
        return { migrated: 0, skipped: 0 };
    }

    const existing = listExistingTodos();
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    for (const job of jobs) {
        const todo = cronJobToTodo(job, existing);
        if (!todo) {
            skipped += 1;
            continue;
        }
        const created = addTodo(todo);
        if (created?.item) {
            existing.push(created.item);
            migrated += 1;
        } else {
            failed += 1;
            console.warn(`tabyAgent: cron job "${job?.name || "?"}" migration failed: ${created?.error || "unknown"}`);
        }
    }

    // 변환에 실패한 잡이 남아 있으면 원본을 유지해 다음 부팅에 재시도한다.
    if (!failed) {
        fs.renameSync(cronPath, cronPath + MIGRATED_SUFFIX);
    }
    return { migrated, skipped, failed };
}

function listExistingTodos() {
    try {
        const todosPath = path.join(USER_DIR, "todos.json");
        const data = readJson(todosPath, {});
        return Array.isArray(data?.items) ? data.items : [];
    } catch {
        return [];
    }
}

export function runLegacyMigrations() {
    const report = { cron: { migrated: 0, skipped: 0 } };
    try {
        report.cron = migrateCronToTodos();
        if (report.cron.migrated) {
            console.log(`tabyAgent: migrated ${report.cron.migrated} cron job(s) into todos.json`);
        }
    } catch (err) {
        console.error("tabyAgent: legacy migration failed:", err?.stack || err);
    }
    return report;
}
