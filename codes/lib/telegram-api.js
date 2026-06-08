function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_MAX_WAIT_MS = 30_000;
const DEFAULT_MAX_TOTAL_WAIT_MS = 120_000;

function telegramErrorMessage(err) {
    return err?.description || err?.message || String(err);
}

function isRateLimit(err) {
    return err?.error_code === 429;
}

function getRetryAfterMs(err, capMs = DEFAULT_MAX_WAIT_MS) {
    const sec = err?.parameters?.retry_after;
    if (typeof sec === "number" && sec > 0) return Math.min(sec * 1000, capMs);
    const m = String(err?.description || err?.message || "").match(/retry after (\d+)/i);
    if (m) return Math.min(Number(m[1]) * 1000, capMs);
    return Math.min(1000, capMs);
}

/** Retry Telegram Bot API calls on 429 (rate limit). */
export async function callTelegramApi(
    fn,
    { maxAttempts = DEFAULT_MAX_ATTEMPTS, maxWaitMs = DEFAULT_MAX_WAIT_MS, maxTotalWaitMs = DEFAULT_MAX_TOTAL_WAIT_MS } = {},
) {
    let totalWaited = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            if (!isRateLimit(err) || attempt >= maxAttempts - 1) throw err;
            const wait = getRetryAfterMs(err, maxWaitMs);
            if (totalWaited + wait > maxTotalWaitMs) throw err;
            totalWaited += wait;
            await sleep(wait);
        }
    }
}

/** Never throws — returns { ok, result? } or { ok: false, error }. */
export async function safeTelegramApi(fn, opts = {}) {
    try {
        return { ok: true, result: await callTelegramApi(fn, opts) };
    } catch (err) {
        const error = telegramErrorMessage(err);
        console.warn("Telegram API:", error);
        return { ok: false, error, raw: err };
    }
}

/** Fast-fail for non-critical UI updates (status edits). */
export function safeTelegramApiFast(fn) {
    return safeTelegramApi(fn, { maxAttempts: 2, maxWaitMs: 3_000, maxTotalWaitMs: 5_000 });
}

export function splitTextChunks(text, maxLen = 4096) {
    const body = String(text ?? "");
    if (!body) return ["…"];
    const parts = [];
    for (let i = 0; i < body.length; i += maxLen) {
        parts.push(body.slice(i, i + maxLen));
    }
    return parts.length ? parts : ["…"];
}

export async function deleteMessageSafe(bot, chatId, messageId) {
    if (!bot?.api || !chatId || !messageId) return false;
    const res = await safeTelegramApiFast(() => bot.api.deleteMessage(chatId, messageId));
    return res.ok;
}

export async function sendChatActionSafe(bot, chatId, action = "typing") {
    if (!bot?.api || !chatId) return false;
    const res = await safeTelegramApiFast(() => bot.api.sendChatAction(chatId, action));
    return res.ok;
}

export async function editMessageTextSafe(bot, chatId, messageId, text, { parseMode } = {}) {
    if (!bot?.api || !chatId || !messageId) return false;

    const body = String(text ?? "").trim() || "…";
    const opts = parseMode ? { parse_mode: parseMode } : {};
    let res = await safeTelegramApi(() => bot.api.editMessageText(chatId, messageId, body, opts));

    if (!res.ok && parseMode) {
        res = await safeTelegramApi(() => bot.api.editMessageText(chatId, messageId, body.replace(/<[^>]+>/g, "")));
    }

    return res.ok;
}

/**
 * Send text to a chat. HTML with plain fallback, chunked. Never throws.
 * @returns {Promise<{ ok: boolean, messageIds: number[] }>}
 */
export async function sendMessageSafe(bot, chatId, text, opts = {}) {
    if (!bot?.api || !chatId) return { ok: false, messageIds: [] };

    const parseMode = opts.parse_mode || opts.parseMode;
    const extra = { ...opts };
    delete extra.parse_mode;
    delete extra.parseMode;

    const messageIds = [];
    let allOk = true;

    for (const chunk of splitTextChunks(text)) {
        if (!chunk.trim()) continue;

        let res;
        if (parseMode) {
            res = await safeTelegramApi(() => bot.api.sendMessage(chatId, chunk, { ...extra, parse_mode: parseMode }));
            if (!res.ok) {
                res = await safeTelegramApi(() => bot.api.sendMessage(chatId, chunk.replace(/<[^>]+>/g, ""), extra));
            }
        } else {
            res = await safeTelegramApi(() => bot.api.sendMessage(chatId, chunk, extra));
        }

        if (res.ok) {
            if (res.result?.message_id) messageIds.push(res.result.message_id);
        } else {
            allOk = false;
        }
    }

    return { ok: allOk, messageIds };
}

/** Photo → document fallback. Never throws. */
export async function sendPhotoSafe(bot, chatId, input, opts = {}) {
    if (!bot?.api || !chatId) return { ok: false, kind: null };

    let res = await safeTelegramApi(() => bot.api.sendPhoto(chatId, input, opts));
    if (res.ok) return { ok: true, kind: "photo", result: res.result };

    const desc = String(res.error || "");
    if (desc.includes("PHOTO_INVALID")) {
        res = await safeTelegramApi(() => bot.api.sendDocument(chatId, input, opts));
        if (res.ok) return { ok: true, kind: "document", fallback: true, result: res.result };
    }

    return { ok: false, kind: null, error: res.error };
}

/** ctx.reply with retry + HTML plain fallback. Never throws. */
export async function replySafe(ctx, text, opts = {}) {
    if (!ctx?.reply) return { ok: false };

    const parseMode = opts.parse_mode || opts.parseMode;
    const extra = { ...opts };
    delete extra.parse_mode;
    delete extra.parseMode;

    if (parseMode) {
        let res = await safeTelegramApi(() => ctx.reply(text, { ...extra, parse_mode: parseMode }));
        if (res.ok) return res;
        return safeTelegramApi(() => ctx.reply(String(text).replace(/<[^>]+>/g, ""), extra));
    }

    return safeTelegramApi(() => ctx.reply(text, extra));
}
