import { loadUserConfig } from "../config-loader.js";
import { appendChatTurn } from "../agent/chat-history.js";
import { t } from "../i18n.js";
import { getRunningVersion } from "./store.js";

function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatUpdateMessage(update, lang) {
    const running = getRunningVersion() || update.currentVersion || "—";
    const lines = [
        t("update_notify_title", lang, { version: update.tagName }),
        "",
        t("update_notify_script_label", lang),
        "",
        `<pre><code>${escapeHtml(update.installScript)}</code></pre>`,
        "",
        t("update_notify_current", lang, { version: running }),
    ];
    return lines.join("\n");
}

export async function sendUpdateNotification(bot, chatId, update) {
    const lang = loadUserConfig().language || "en";
    const html = formatUpdateMessage(update, lang);
    const buttonLabel = t("update_notify_button", lang);

    await bot.api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [[{ text: buttonLabel, url: update.releaseUrl }]],
        },
    });

    const sessionBody = [t("update_notify_session_assistant", lang, { version: update.tagName }), "", update.installScript, update.releaseUrl].join(
        "\n",
    );

    try {
        appendChatTurn(chatId, [
            { role: "user", content: t("update_notify_session_user", lang) },
            { role: "assistant", content: sessionBody },
        ]);
    } catch (err) {
        console.error("tabyAgent: update session append failed:", err?.stack || err);
    }

    return true;
}
