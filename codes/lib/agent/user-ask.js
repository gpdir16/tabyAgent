import { InlineKeyboard } from "grammy";
import { loadUserConfig } from "../config-loader.js";
import { deleteMessageSafe, sendMessageSafe, editMessageTextSafe } from "../telegram-api.js";
import { t } from "../i18n.js";
import { telegramThreadOpts } from "../agent-route.js";
import { clearTodoWaiting, markTodoWaiting } from "../todos/store.js";
import { createSecret, findSecretIdByName, updateSecret } from "../secrets/store.js";
import { placeholderFor } from "../secrets/vault.js";

// sessionKey -> { key, id, bot, lang, question, options, messageId, resolve, timer, settled, todoId, secret }
const pendingAsks = new Map();

function trimLabel(label, max = 60) {
    const s = String(label);
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function hintFor(lang, hasOptions, secret) {
    if (secret) return t("secret_ask_hint", lang);
    return hasOptions ? t("user_ask_hint_button", lang) : t("user_ask_hint_text", lang);
}

export function hasPendingAsk(sessionKey) {
    return pendingAsks.has(String(sessionKey));
}

// 테스트 및 핸들러에서 사용하는 대기 중 ask의 id 조회
export function pendingAskIdFor(sessionKey) {
    return pendingAsks.get(String(sessionKey))?.id ?? null;
}

function settle(entry, result) {
    if (entry.settled) return false;
    entry.settled = true;
    clearTimeout(entry.timer);
    pendingAsks.delete(entry.key);
    if (entry.todoId) clearTodoWaiting(entry.todoId, entry.id);
    entry.resolve(result);
    return true;
}

async function finishAskMessage(entry, text) {
    try {
        await editMessageTextSafe(entry.bot, entry.chatId || entry.key, entry.messageId, trimLabel(text, 3500));
    } catch {
        // 편집 실패는 무시 (메시지 삭제, 봇 재시작 등)
    }
}

export function resolvePendingAskByButton(sessionKey, askId, optionIndex) {
    const entry = pendingAsks.get(String(sessionKey));
    if (!entry || entry.id !== askId) return null;
    const option = entry.options[optionIndex];
    if (option === undefined) return null;
    settle(entry, { answer: option, option: optionIndex, custom: false });
    void finishAskMessage(entry, `✅ ${option}`);
    return option;
}

// 시크릿 질문: 입력값을 금고에 저장만 하고 모델에는 저장 사실과 자리표시자만 알린다.
// 값이 담긴 사용자 메시지는 채팅에 남지 않게 바로 지운다. 값이 잘못되면 SecretError를 던진다.
function settleSecretAsk(entry, value, userMessageId) {
    if (userMessageId) void deleteMessageSafe(entry.bot, entry.chatId || entry.key, userMessageId);
    const existing = findSecretIdByName(entry.secret.name);
    if (existing) updateSecret(existing, { value });
    const id = existing || createSecret({ name: entry.secret.name, value });
    settle(entry, { ok: true, saved: true, name: entry.secret.name, placeholder: placeholderFor(id) });
    void finishAskMessage(entry, `🔐 ${t("secret_ask_saved", entry.lang, { name: entry.secret.name })}`);
    return true;
}

export function resolvePendingAskByText(sessionKey, text, { messageId = null } = {}) {
    const entry = pendingAsks.get(String(sessionKey));
    if (!entry) return false;
    if (entry.secret) {
        const value = String(text ?? "");
        if (!value.trim()) return false;
        try {
            return settleSecretAsk(entry, value, messageId);
        } catch (err) {
            // 저장에 실패해도 값이 담긴 메시지는 지웠으니 대화로 흘려보내지 않는다.
            settle(entry, { error: "secret_save_failed", detail: err?.message || String(err) });
            void finishAskMessage(entry, `${entry.question}\n\n✖️ ${t("secret_ask_failed", entry.lang)}`);
            return true;
        }
    }
    const answer = String(text || "")
        .trim()
        .slice(0, 1000);
    if (!answer) return false;
    settle(entry, { answer, option: null, custom: true });
    void finishAskMessage(entry, `✍️ ${answer}`);
    return true;
}

export function cancelPendingAsk(sessionKey, reason = "aborted") {
    const entry = pendingAsks.get(String(sessionKey));
    if (!entry) return false;
    settle(entry, { error: reason });
    void finishAskMessage(entry, `${entry.question}\n\n✖️ ${t("user_ask_cancelled", entry.lang)}`);
    return true;
}

export async function askUser({ bot, chatId, sessionKey, threadId, question, options = [], timeoutMs = 120_000, todoId = null, secret = null }) {
    const key = String(sessionKey || chatId);
    if (pendingAsks.has(key)) {
        return { error: "Another user_ask is already pending for this chat." };
    }

    let lang = "en";
    try {
        lang = loadUserConfig().language || "en";
    } catch {
        // 설정을 읽지 못하면 영어 사용
    }

    const id = Math.random().toString(36).slice(2, 8);
    const hasOptions = !secret && options.length > 0;
    const body = secret
        ? `🔐 ${t("secret_ask_title", lang, { name: secret.name })}\n\n${hintFor(lang, false, true)}`
        : `${question}\n\n${hintFor(lang, hasOptions)}`;

    const kb = hasOptions ? new InlineKeyboard() : null;
    if (kb) {
        for (let i = 0; i < options.length; i += 1) {
            kb.text(trimLabel(options[i]).replace(/\s+/g, " "), `ask:${id}:${i}`).row();
        }
    }

    const extra = {
        ...telegramThreadOpts(threadId),
        ...(kb ? { reply_markup: kb } : {}),
    };
    const sent = await sendMessageSafe(bot, chatId, trimLabel(body, 4000), extra);
    const messageId = sent.messageIds?.[0];
    if (!messageId) return { error: "Failed to send the question message." };

    return new Promise((resolve) => {
        const entry = {
            key,
            chatId: String(chatId),
            id,
            bot,
            lang,
            question: trimLabel(question, 1500),
            options,
            messageId,
            resolve,
            timer: null,
            settled: false,
            todoId: todoId || null,
            secret: secret ? { name: secret.name } : null,
        };
        entry.timer = setTimeout(() => {
            settle(entry, { error: "timeout" });
            void finishAskMessage(entry, `${entry.question}\n\n⏱️ ${t("user_ask_timeout", lang)}`);
        }, timeoutMs);
        pendingAsks.set(key, entry);
        // 스케줄된 실행이 물어보고 멈춰 있으면 /todos에 '답변 필요'로 표시한다.
        if (entry.todoId) markTodoWaiting(entry.todoId, { askId: entry.id, question: entry.question, convId: key });
    });
}
