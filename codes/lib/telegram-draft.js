import { sendTelegramReply } from "./telegram-stats.js";
import { safeTelegramApiFast } from "./telegram-api.js";

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

        const res = await safeTelegramApiFast(() => this.bot.api.sendMessageDraft(this.chatId, this.draftId, text));
        if (res.ok) {
            this.lastSent = text;
            this.lastSentAt = now;
            return true;
        }

        this.available = false;
        console.warn("sendMessageDraft failed, falling back:", res.error);
        return false;
    }

    async finalize(stats) {
        if (this.finalized) return false;
        this.finalized = true;

        const text = this.lastSent.trim();
        if (!text) return false;

        await sendTelegramReply(this.bot, this.chatId, text, stats);
        return true;
    }

    getLastText() {
        return this.lastSent;
    }

    isAvailable() {
        return this.available;
    }
}
