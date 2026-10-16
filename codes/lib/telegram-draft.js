import { sendTelegramReply } from "./telegram-stats.js";
import { safeTelegramApi } from "./telegram-api.js";

const MAX_DRAFT_LEN = 32_768;
const MIN_UPDATE_MS = 300;

// 초안 갱신은 기다려 재시도하지 않는다. 늦은 초안은 의미가 없고 다음 갱신이 최신 본문을 다시 보낸다.
function sendDraftOnce(fn) {
    return safeTelegramApi(fn, { maxAttempts: 1 });
}

function retryAfterMs(res) {
    if (res?.raw?.error_code !== 429) return 0;
    const sec = Number(res.raw.parameters?.retry_after);
    return Number.isFinite(sec) && sec > 0 ? sec * 1000 : 1000;
}

export class TelegramDraftStream {
    constructor(bot, chatId, draftId, extra = {}) {
        this.bot = bot;
        this.chatId = chatId;
        this.draftId = draftId;
        this.extra = extra;
        this.lastSent = "";
        this.lastSentAt = 0;
        // 429를 받으면 이 시각까지 초안 갱신을 쉰다. 끄지 않으면 최종 답변은 그대로 초안 경로로 마무리된다.
        this.pausedUntil = 0;
        // 토큰마다 기다리지 않고 호출되므로, 보내는 중에는 새 요청을 겹쳐 보내지 않는다.
        // 겹치면 쓰로틀(lastSentAt)이 응답 전까지 갱신되지 않아 요청이 한꺼번에 몰린다.
        this.inFlight = false;
        this.available = true;
        this.finalized = false;
    }

    async update(fullText) {
        if (!this.available || this.finalized) return false;

        const text = (fullText || "").trimEnd().slice(0, MAX_DRAFT_LEN);
        if (!text || text === this.lastSent) return true;

        const now = Date.now();
        if (this.inFlight || now < this.pausedUntil) return true;
        if (now - this.lastSentAt < MIN_UPDATE_MS && text.length - this.lastSent.length < 20) {
            return true;
        }

        this.inFlight = true;
        try {
            return await this.send(text, now);
        } finally {
            this.inFlight = false;
        }
    }

    async send(text, now) {
        // Prefer rich message draft (Bot API 10.1+) so markdown renders live.
        const res = await sendDraftOnce(() => this.bot.api.sendRichMessageDraft(this.chatId, this.draftId, { markdown: text }, this.extra));

        if (res.ok) {
            this.lastSent = text;
            this.lastSentAt = now;
            return true;
        }
        if (this.pauseOnRateLimit(res)) return true;

        // Fallback to plain text draft.
        const plainRes = await sendDraftOnce(() => this.bot.api.sendMessageDraft(this.chatId, this.draftId, text, this.extra));
        if (plainRes.ok) {
            this.lastSent = text;
            this.lastSentAt = now;
            return true;
        }
        if (this.pauseOnRateLimit(plainRes)) return true;

        this.available = false;
        console.warn("sendRichMessageDraft and sendMessageDraft both failed, falling back:", res.error);
        return false;
    }

    // 속도 제한은 일시적이다: 초안을 끄지 않고 retry_after 동안만 갱신을 멈춘다.
    pauseOnRateLimit(res) {
        const wait = retryAfterMs(res);
        if (!wait) return false;
        this.pausedUntil = Date.now() + wait;
        return true;
    }

    // 최종 본문은 호출자가 넘긴다. 마지막 초안 갱신이 쓰로틀·속도 제한으로 건너뛰어졌을 수 있다.
    async finalize(stats, finalText = this.lastSent) {
        if (this.finalized) return false;
        this.finalized = true;

        const text = String(finalText || "").trim();
        if (!text) return false;

        await sendTelegramReply(this.bot, this.chatId, text, stats, this.extra);
        return true;
    }

    getLastText() {
        return this.lastSent;
    }

    isAvailable() {
        return this.available;
    }
}
