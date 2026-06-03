import { statusText } from "./i18n.js";

function formatToolDisplayName(toolName) {
    if (!toolName) return "";
    if (toolName.startsWith("mcp__")) {
        const parts = toolName.split("__");
        if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
    }
    return toolName;
}

function formatElapsedSeconds(totalSeconds, lang = "en") {
    const s = Math.max(0, Math.floor(totalSeconds));

    if (s < 60) {
        if (lang === "ko") return `${s}초`;
        if (lang === "ja") return `${s}秒`;
        return `${s}s`;
    }

    const minutes = Math.floor(s / 60);
    const seconds = s % 60;

    if (s < 3600) {
        if (lang === "ko") {
            return seconds ? `${minutes}분 ${seconds}초` : `${minutes}분`;
        }
        if (lang === "ja") {
            return seconds ? `${minutes}分 ${seconds}秒` : `${minutes}分`;
        }
        return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(s / 3600);
    const remMinutes = Math.floor((s % 3600) / 60);
    const remSeconds = s % 60;

    if (lang === "ko") {
        const parts = [`${hours}시간`];
        if (remMinutes) parts.push(`${remMinutes}분`);
        if (remSeconds) parts.push(`${remSeconds}초`);
        return parts.join(" ");
    }
    if (lang === "ja") {
        const parts = [`${hours}時間`];
        if (remMinutes) parts.push(`${remMinutes}分`);
        if (remSeconds) parts.push(`${remSeconds}秒`);
        return parts.join(" ");
    }

    const parts = [`${hours}h`];
    if (remMinutes) parts.push(`${remMinutes}m`);
    if (remSeconds) parts.push(`${remSeconds}s`);
    return parts.join(" ");
}

export class TelegramStatusMessage {
    constructor(bot, chatId, lang = "en") {
        this.bot = bot;
        this.chatId = chatId;
        this.lang = lang;
        this.phase = "generating";
        this.detail = null;
        this.startedAt = Date.now();
        this.messageId = null;
        this.timer = null;
        this.finished = false;
    }

    bodyText() {
        const label = statusText(this.phase, this.lang);
        const elapsed = formatElapsedSeconds((Date.now() - this.startedAt) / 1000, this.lang);
        const parts = [label];

        if (this.detail) {
            const shown = this.phase === "tools" ? formatToolDisplayName(this.detail) : String(this.detail);
            if (shown) parts.push(shown);
        }

        parts.push(elapsed);
        return parts.join(" · ");
    }

    async start() {
        const msg = await this.bot.api.sendMessage(this.chatId, this.bodyText());
        this.messageId = msg.message_id;
        this.timer = setInterval(() => {
            void this.refresh();
        }, 1000);
    }

    setPhase(phase, detail = null) {
        if (this.finished) return;
        this.phase = phase;
        this.detail = detail;
        void this.refresh();
    }

    async refresh() {
        if (this.finished || !this.messageId) return;
        try {
            await this.bot.api.editMessageText(this.chatId, this.messageId, this.bodyText());
        } catch {
            // ignore rate limits / unchanged
        }
    }

    async completeSuccess() {
        if (this.finished) return;
        this.finished = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (!this.messageId) return;
        try {
            await this.bot.api.deleteMessage(this.chatId, this.messageId);
        } catch {
            // ignore
        }
        this.messageId = null;
    }

    async completeError(text, { parseMode } = {}) {
        if (this.finished) return;
        this.finished = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.phase = "error";
        if (!this.messageId) return;
        const elapsed = formatElapsedSeconds((Date.now() - this.startedAt) / 1000, this.lang);
        const prefix = this.lang === "ko" ? "응답이 중단되었습니다" : this.lang === "ja" ? "応答が中断されました" : "Response interrupted";
        const body = `${prefix} · ${elapsed}\n\n${text}`;
        try {
            await this.bot.api.editMessageText(this.chatId, this.messageId, body, {
                parse_mode: parseMode,
            });
        } catch {
            try {
                await this.bot.api.editMessageText(this.chatId, this.messageId, body.replace(/<[^>]+>/g, ""));
            } catch {
                // ignore
            }
        }
    }
}
