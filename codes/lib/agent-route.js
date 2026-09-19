import { DEFAULT_AGENT_ID, findAgentByThread, getMainThreadId } from "./agents-store.js";
import { getTopicsEnabled } from "./telegram-topics.js";
import { agentIdForSessionKey, isValidSessionKey } from "./agent/chat-history.js";
import { getOwnerChatId } from "./auth.js";

export { isValidSessionKey };

export function extractThreadId(source) {
    const raw = source?.message_thread_id ?? source?.message?.message_thread_id ?? source?.callbackQuery?.message?.message_thread_id;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 1) return null;
    return n;
}

export function telegramThreadOpts(threadId) {
    if (getTopicsEnabled() !== true) return {};
    const n = Number(threadId);
    if (Number.isFinite(n) && n > 1) return { message_thread_id: n };
    const main = getMainThreadId();
    if (main) return { message_thread_id: main };
    return {};
}

export function routeFromCtx(ctx) {
    const chatId = String(ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id ?? "");
    const inbound = extractThreadId(ctx);
    const extra = findAgentByThread(inbound);
    if (extra) {
        return {
            chatId,
            threadId: inbound,
            sessionKey: `${chatId}:t${inbound}`,
            agentId: extra.id,
            agent: extra,
        };
    }
    const main = getTopicsEnabled() === true ? getMainThreadId() : null;
    return {
        chatId,
        threadId: inbound || main,
        sessionKey: chatId,
        agentId: DEFAULT_AGENT_ID,
        agent: null,
    };
}

// 세션 키("chatId" 또는 "chatId:tThreadId")를 라우트 객체로 되돌린다.
// 스케줄된 작업처럼 ctx 없이 세션 키만 알 때 사용한다.
export function routeForSessionKey(sessionKey) {
    const key = String(sessionKey || "").trim();
    if (!isValidSessionKey(key)) return null;
    const m = /^(-?\d+)(?::t(\d+))?$/.exec(key);
    const chatId = m[1];
    const threadId = m[2] ? Number(m[2]) : null;
    const agent = threadId ? findAgentByThread(threadId) : null;
    return {
        chatId,
        threadId: threadId || (getTopicsEnabled() === true ? getMainThreadId() : null),
        sessionKey: key,
        agentId: agentIdForSessionKey(key) || DEFAULT_AGENT_ID,
        agent,
    };
}

// 에이전트의 기본 대상 세션: 토픽 에이전트는 자기 스레드 세션,
// 메인 에이전트는 오너 채팅 세션.
export function sessionKeyForAgent(agentOrId) {
    const id = typeof agentOrId === "object" ? agentOrId?.id : agentOrId;
    const threadId = typeof agentOrId === "object" ? Number(agentOrId?.threadId) : NaN;
    const ownerChatId = getOwnerChatId();
    if (!ownerChatId) return null;
    if (id && id !== DEFAULT_AGENT_ID && Number.isInteger(threadId) && threadId > 0) {
        return `${ownerChatId}:t${threadId}`;
    }
    return String(ownerChatId);
}

// 에이전트가 답장을 보낼 채팅/스레드 라우트.
export function routeForAgent(agentOrId) {
    const sessionKey = sessionKeyForAgent(agentOrId);
    return sessionKey ? routeForSessionKey(sessionKey) : null;
}
