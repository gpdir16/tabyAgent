import { sendTelegramReply, formatStatsFooterPlain } from "./telegram-stats.js";

const MAX_DRAFT_LEN = 4096;
const MIN_UPDATE_MS = 300;

export class TelegramDraftStream {
    constructor(bot, chatId, draftId) {
        this.bot = bot;
        this.chatId = chatId;
        this.draftId = draftId;
        this.lastSent = "";
        this.lastSentAt = 0;
        this.available = true;
        this.finalized = false;
    }

    async update(fullText) {
        if (!this.available || this.finalized) return false;

        const text = (fullText || "").trimEnd().slice(0, MAX_DRAFT_LEN);
        if (!text || text === this.lastSent) return true;

        const now = Date.now();
        if (now - this.lastSentAt < MIN_UPDATE_MS && text.length - this.lastSent.length < 20) {
            return true;
        }

        try {
            await this.bot.api.sendMessageDraft(this.chatId, this.draftId, text);
            this.lastSent = text;
            this.lastSentAt = now;
            return true;
        } catch (err) {
            this.available = false;
            console.warn("sendMessageDraft failed, falling back:", err.message || err);
            return false;
        }
    }

    async finalize(stats) {
        if (this.finalized) return;
        this.finalized = true;

        const text = this.lastSent.trim();
        if (!text) return null;

        try {
            await sendTelegramReply(this.bot, this.chatId, text, stats);
            return true;
        } catch (err) {
            console.warn("finalize send failed:", err.message || err);
            try {
                const plain = stats ? `${text}${formatStatsFooterPlain(stats)}` : text;
                return await this.bot.api.sendMessage(this.chatId, plain);
            } catch (err2) {
                console.warn("finalize plain send failed:", err2.message || err2);
                return null;
            }
        }
    }

    getLastText() {
        return this.lastSent;
    }

    isAvailable() {
        return this.available;
    }
}
