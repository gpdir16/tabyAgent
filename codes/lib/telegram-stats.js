import fs from "node:fs";
import { InputFile } from "grammy";
import { loadUserConfig } from "./config-loader.js";
import { buildTelegramParts } from "./telegram-markdown.js";
import { renderTablePng } from "./telegram-table-image.js";
import { sendMessageSafe, sendPhotoSafe } from "./telegram-api.js";

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

function tableToPlain(rows) {
    if (!rows?.length) return "";
    return rows.map((row) => row.map((c) => String(c ?? "")).join(" | ")).join("\n");
}

async function sendHtmlChunks(bot, chatId, html) {
    await sendMessageSafe(bot, chatId, html, { parse_mode: "HTML" });
}

async function sendTablePhoto(bot, chatId, rows) {
    let pngPath;
    try {
        pngPath = await renderTablePng(rows);
    } catch (err) {
        console.warn("Table render failed:", err.message || err);
        await sendMessageSafe(bot, chatId, tableToPlain(rows));
        return;
    }

    try {
        const input = new InputFile(pngPath);
        const sent = await sendPhotoSafe(bot, chatId, input);
        if (!sent.ok) {
            await sendMessageSafe(bot, chatId, tableToPlain(rows));
        }
    } finally {
        fs.unlink(pngPath, () => {});
    }
}

/** Text and table photos in document order (text before each table). Never throws. */
export async function sendTelegramReply(bot, chatId, bodyText, stats) {
    const body = (bodyText || "").trim() || "…";
    const footerHtml = stats ? formatStatsFooter(stats) : "";
    const footerPlain = stats ? formatStatsFooterPlain(stats) : "";

    try {
        const parts = buildTelegramParts(body);
        const pendingHtml = [];

        for (const part of parts) {
            if (part.type === "table" && part.rows?.length) {
                if (pendingHtml.length) {
                    await sendHtmlChunks(bot, chatId, pendingHtml.join("\n"));
                    pendingHtml.length = 0;
                }
                await sendTablePhoto(bot, chatId, part.rows);
            } else if (part.type === "html" && part.content?.trim()) {
                pendingHtml.push(part.content);
            }
        }

        if (pendingHtml.length) {
            let html = pendingHtml.join("\n");
            if (footerHtml) html += footerHtml;
            await sendHtmlChunks(bot, chatId, html);
        } else if (footerHtml) {
            await sendHtmlChunks(bot, chatId, footerHtml);
        }
    } catch (err) {
        console.warn("Telegram reply failed:", err.message || err);
        const plain = `${body}${footerPlain}`;
        await sendMessageSafe(bot, chatId, plain);
    }
}
