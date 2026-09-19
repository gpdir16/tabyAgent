import {
    clearTodoRun,
    dispatchTodoRun,
    executorIdOf,
    getTodo,
    isTodoRunCurrent,
    listDueTodos,
    markTodoNotified,
    markTodoRun,
    reconcileRuns,
    skipTodoOccurrence,
} from "./store.js";
import { sameWallClock } from "../scheduling/time.js";
import { scheduleWork } from "../agent-queue.js";
import { findAgentOrDefault } from "../agents-store.js";
import { isValidSessionKey, sessionKeyForAgent } from "../agent-route.js";

const TICK_MS = 1000;
const inFlight = new Set();

let runAgentTodo = null;
let remindUserTodo = null;
let timer = null;
let emitEvent = null;

export function setTodoHandlers({ runAgent, remindUser, emit } = {}) {
    runAgentTodo = runAgent || null;
    remindUserTodo = remindUser || null;
    emitEvent = emit || null;
}

function flightKey(todoId) {
    return `todo:${todoId}`;
}

// 실행 봇: assignee 우선, 없으면 봇 소유 리스트의 주인. 메인 에이전트는
// 스토어에 없는 가상 에이전트이므로 findAgentOrDefault가 유사 객체를 돌려준다.
function executorOf(item) {
    const id = executorIdOf(item);
    return id ? findAgentOrDefault(id) : null;
}

// 결과를 올릴 세션: conversationId가 유효한 세션 키면 거기, 아니면 실행 봇의 기본 세션.
function sessionKeyFor(item, agent) {
    const conv = String(item?.conversationId || "").trim();
    if (conv && isValidSessionKey(conv)) return conv;
    return sessionKeyForAgent(agent) || "";
}

function notifyChanged() {
    try {
        emitEvent?.({ type: "todos_changed" });
    } catch {}
}

async function tick() {
    if (!runAgentTodo && !remindUserTodo) return;
    for (const due of listDueTodos()) {
        const item = due.item;
        const key = flightKey(item.id);
        if (inFlight.has(key)) continue;
        if (item.kind === "cron" && item.consumedSlot && item.nextRunAt && sameWallClock(item.consumedSlot, item.nextRunAt, item.timezone)) {
            if (skipTodoOccurrence(item.id, item.nextRunAt)) notifyChanged();
            continue;
        }
        const dispatch = dispatchTodoRun(item.id);
        if (!dispatch?.token) continue;
        const token = dispatch.token;
        inFlight.add(key);
        notifyChanged();

        const assignee = executorOf(item);
        // 리마인더도 실제 세션 레인에서 돌아야 사용자 큐와 순서가 맞는다 —
        // 세션 키가 없으면(오너 미지정) 전용 레인으로 둔다.
        const sessionKey = assignee ? sessionKeyFor(item, assignee) : `todo-remind:${item.id}`;

        scheduleWork(
            "todo",
            async () => {
                try {
                    if (!isTodoRunCurrent(item.id, token)) return { skipped: true };
                    const fresh = getTodo(item.id);
                    if (!fresh) return { skipped: true };
                    if (assignee) {
                        if (!runAgentTodo) {
                            clearTodoRun(item.id, token);
                            return { skipped: true };
                        }
                        const result = await runAgentTodo({ agent: assignee, item: fresh, sessionKey });
                        markTodoRun(item.id, { error: result?.error || null, token, silent: Boolean(result?.silent) });
                        return result;
                    }
                    if (remindUserTodo) await remindUserTodo({ item: fresh });
                    markTodoNotified(item.id, { token });
                } finally {
                    inFlight.delete(key);
                    notifyChanged();
                }
            },
            { sessionKey, cancellable: true },
        )
            .then((res) => {
                if (res?.error === "stopped_by_user" || res?.skipped) {
                    inFlight.delete(key);
                    clearTodoRun(item.id, token);
                    notifyChanged();
                }
            })
            .catch((err) => {
                inFlight.delete(key);
                markTodoRun(item.id, { error: err?.message || String(err), token });
                notifyChanged();
                console.error(`tabyAgent: todo tick failed (${key}):`, err?.stack || err);
            });
    }
}

export function startTodoScheduler() {
    try {
        if (reconcileRuns()) emitEvent?.({ type: "todos_changed" });
    } catch (err) {
        console.error("tabyAgent: todo reconcile failed:", err?.stack || err);
    }
    if (!timer) {
        timer = setInterval(() => {
            tick().catch((err) => console.error("tabyAgent: todo tick failed:", err?.stack || err));
        }, TICK_MS);
        timer.unref?.();
    }
}

export function stopTodoScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    inFlight.clear();
}

export function queueTodoNow(agent, item) {
    if (!runAgentTodo || !agent || !item) return { error: "scheduler not ready" };
    const key = flightKey(item.id);
    if (inFlight.has(key)) return { error: "already running" };
    const sessionKey = sessionKeyFor(item, agent) || sessionKeyForAgent(agent) || "";
    // 봇 소유 잡의 수동 실행은 테스트 run: one-shot 슬롯을 소비하지 않는다.
    const manual = (item.list || "user") !== "user";
    const dispatch = dispatchTodoRun(item.id, { advance: false, manual });
    if (!dispatch?.token) return { error: "already running" };
    const token = dispatch.token;
    inFlight.add(key);
    notifyChanged();
    scheduleWork(
        "todo",
        async () => {
            try {
                if (!isTodoRunCurrent(item.id, token)) return { skipped: true };
                const fresh = getTodo(item.id);
                if (!fresh) return { skipped: true };
                const result = await runAgentTodo({ agent, item: fresh, sessionKey });
                markTodoRun(item.id, { error: result?.error || null, token, silent: Boolean(result?.silent) });
                return result;
            } finally {
                inFlight.delete(key);
                notifyChanged();
            }
        },
        { sessionKey, cancellable: true },
    )
        .then((res) => {
            if (res?.error === "stopped_by_user" || res?.skipped) {
                inFlight.delete(key);
                clearTodoRun(item.id, token);
                notifyChanged();
            }
        })
        .catch((err) => {
            inFlight.delete(key);
            markTodoRun(item.id, { error: err?.message || String(err), token });
            notifyChanged();
            console.error(`tabyAgent: todo run-now failed (${key}):`, err?.stack || err);
        });
    return { ok: true, queued: true };
}
