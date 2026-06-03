import { loadUserConfig } from "./config-loader.js";
import { markdownToTelegramHtml } from "./telegram-markdown.js";

function formatNumber(n) {
    return Number(n).toLocaleString("en-US");
}

export function formatStatsFooterPlain(stats) {
    const lang = loadUserConfig().language || "en";
    const used = formatNumber(stats?.tokensUsed ?? 0);
    const window = formatNumber(stats?.contextWindow ?? 128000);
    const tools = formatNumber(stats?.toolCallCount ?? 0);
    const models = formatNumber(stats?.modelCallCount ?? 0);

    if (lang === "ko") {
        return `\n\n모델 ${models}회 · 툴 ${tools}회 · ${used}/${window}`;
    }
    if (lang === "ja") {
        return `\n\nモデル ${models}回 · ツール ${tools}回 · ${used}/${window}`;
    }
    return `\n\n${models} model calls · ${tools} tool calls · ${used}/${window}`;
}

export function formatStatsFooter({ toolCallCount = 0, modelCallCount = 0, tokensUsed = 0, contextWindow = 128000 }) {
    const plain = formatStatsFooterPlain({ toolCallCount, modelCallCount, tokensUsed, contextWindow });
    return plain.replace(/^\n\n/, "\n\n<i>").replace(/$/, "</i>");
}

function splitHtmlChunks(html, maxLen) {
    const parts = [];
    for (let i = 0; i < html.length; i += maxLen) {
        parts.push(html.slice(i, i + maxLen));
    }
    return parts.length ? parts : [html];
}

async function sendHtmlChunks(bot, chatId, html, parseMode = "HTML") {
    const chunks = splitHtmlChunks(html, 4096);
    for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        await bot.api.sendMessage(chatId, chunk, { parse_mode: parseMode });
    }
}

export async function sendTelegramReply(bot, chatId, bodyText, stats) {
    const body = (bodyText || "").trim() || "…";
    const footerHtml = stats ? formatStatsFooter(stats) : "";
    const footerPlain = stats ? formatStatsFooterPlain(stats) : "";

    try {
        let html = markdownToTelegramHtml(body);
        if (footerHtml) html += footerHtml;
        await sendHtmlChunks(bot, chatId, html);
    } catch (err) {
        console.warn("Telegram reply failed:", err.message || err);
        const plain = `${body}${footerPlain}`;
        for (const part of splitHtmlChunks(plain, 4096)) {
            await bot.api.sendMessage(chatId, part);
        }
    }
}
