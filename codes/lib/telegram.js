import { Bot } from "grammy";
import { loadUserConfig, loadAgentConfig } from "./config-loader.js";
import { requireApprovedAccess, runOwnerApprove } from "./auth-access.js";
import { runAgent } from "./agent/loop.js";
import { appendChatTurn } from "./agent/chat-history.js";
import { TelegramDraftStream } from "./telegram-draft.js";
import { TelegramStatusMessage } from "./telegram-status.js";
import { isConfigReady, isWizardActive, openConfigWizard, handleConfigWizardText, handleConfigWizardCallback } from "./onboarding.js";
import { sendTelegramReply } from "./telegram-stats.js";
import { t, formatAgentError } from "./i18n.js";
import { formatReloadReport, runReload } from "./reload.js";
import { scheduleWork } from "./agent-queue.js";
import { saveIncomingTelegramFile, formatFileUserMessage } from "./telegram-downloads.js";
import { isVisionImageAttachment } from "./llm/vision.js";
import { ensureModelMeta } from "./llm/model-meta.js";
import { getMergedProvider } from "./config-loader.js";
import { setCronJobHandler, startCronScheduler } from "./cron/scheduler.js";

async function streamReplyEditFallback(bot, chatId, fullText, stats) {
    await sendTelegramReply(bot, chatId, (fullText || "").trim() || "…", stats);
}

async function replyWithStreaming(bot, ctx, chatId, userText, status, visionAttachment = null) {
    const agentConfig = loadAgentConfig();
    const mode = agentConfig.telegramStreaming ?? "draft";
    const agentOpts = {
        chatId,
        bot,
        onStatusPhase: (phase, detail) => status.setPhase(phase, detail),
    };

    if (mode === "off") {
        const result = await runAgent(userText, { ...agentOpts, visionAttachment });
        await status.completeSuccess();
        await sendTelegramReply(bot, chatId, result.text, result.stats);
        saveChatTurn(chatId, userText, result);
        return result;
    }

    if (mode === "draft") {
        const draftId = ctx.update.update_id;
        const draft = new TelegramDraftStream(bot, chatId, draftId);

        const result = await runAgent(userText, {
            ...agentOpts,
            visionAttachment,
            onTextDelta: (_delta, full) => {
                void draft.update(full);
            },
        });

        const finalText = result.text || draft.getLastText() || "…";

        if (result.error === "tool_rounds_exceeded" && !result.text?.trim()) {
            return result;
        }

        await status.completeSuccess();

        if (draft.isAvailable() && draft.getLastText()) {
            await draft.update(finalText);
            const sent = await draft.finalize(result.stats);
            if (sent) {
                saveChatTurn(chatId, userText, result);
                return result;
            }
        }

        await streamReplyEditFallback(bot, chatId, finalText, result.stats);
        saveChatTurn(chatId, userText, result);
        return result;
    }

    const result = await runAgent(userText, { ...agentOpts, visionAttachment });
    if (result.error !== "tool_rounds_exceeded" || result.text) {
        await status.completeSuccess();
        await streamReplyEditFallback(bot, chatId, result.text || "…", result.stats);
    }
    saveChatTurn(chatId, userText, result);
    return result;
}

function saveChatTurn(chatId, userText, result) {
    if (result?.text?.trim()) {
        appendChatTurn(chatId, userText, result.text);
    }
}

async function runCronJobForUser(bot, job) {
    const lang = loadUserConfig().language || "en";
    const label = lang === "ko" ? `[예약 작업 · ${job.name}]` : lang === "ja" ? `[予約 · ${job.name}]` : `[Scheduled · ${job.name}]`;
    const userText = `${label}\n\n${job.prompt}`;
    const result = await runAgent(userText, { chatId: job.chatId, bot });
    const fallback = lang === "ko" ? "(출력 없음)" : lang === "ja" ? "(出力なし)" : "(no output)";
    await sendTelegramReply(bot, job.chatId, result.text?.trim() || fallback, result.stats);
}

async function handleAgentTurn(bot, ctx, chatId, userText, { visionAttachment = null } = {}) {
    const lang = loadUserConfig().language || "en";
    const status = new TelegramStatusMessage(bot, chatId, lang);

    await status.start();
    await ctx.replyWithChatAction("typing").catch(() => {});

    const result = await replyWithStreaming(bot, ctx, chatId, userText, status, visionAttachment);

    if (result.error === "tool_rounds_exceeded" && !result.text?.trim()) {
        await status.completeError(t("tool_rounds_exceeded", lang));
    }

    return result;
}

export async function startTelegramBot() {
    const token = loadUserConfig().telegram?.botToken?.trim();
    if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN not set");
    }

    const bot = new Bot(token);
    const streamMode = loadAgentConfig().telegramStreaming ?? "draft";
    console.log(`tabyAgent: Telegram running (streaming: ${streamMode})`);

    setCronJobHandler((job) => runCronJobForUser(bot, job));
    startCronScheduler();

    bot.command("start", async (ctx) => {
        const chatId = String(ctx.chat.id);
        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }
        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }
        const lang = loadUserConfig().language || "en";
        const base =
            lang === "ko"
                ? "준비됐어요. 메시지를 보내세요.\n설정: /config · MCP 다시 불러오기: /reload"
                : lang === "ja"
                  ? "準備完了。メッセージを送ってください。\n設定: /config · MCP再読み込み: /reload"
                  : "Ready. Send a message.\nSettings: /config · Reload MCP: /reload";
        await ctx.reply(base);
    });

    bot.command("reload", async (ctx) => {
        const lang = loadUserConfig().language || "en";

        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        try {
            const report = await runReload();
            await sendTelegramReply(bot, String(ctx.chat.id), formatReloadReport(report, lang), null);
        } catch (err) {
            console.error("Reload error:", err?.stack || err);
            await ctx.reply(formatAgentError(err, lang), { parse_mode: "HTML" });
        }
    });

    bot.command("config", async (ctx) => {
        if (isConfigReady() && !(await requireApprovedAccess(ctx))) {
            return;
        }
        await openConfigWizard(ctx, bot);
    });

    bot.command("approve", async (ctx) => {
        const chatId = String(ctx.chat.id);
        const lang = loadUserConfig().language || "en";
        const code = (ctx.match || "").trim();

        if (!isConfigReady()) {
            await ctx.reply(t("auth_denied_command", lang));
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        if (!code) {
            await ctx.reply(t("auth_approve_usage", lang));
            return;
        }

        const result = await runOwnerApprove(bot, chatId, code);
        await ctx.reply(result.message);
    });

    bot.callbackQuery(/^cfg:/, async (ctx) => {
        await handleConfigWizardCallback(ctx, bot);
    });

    bot.on(["message:document", "message:photo", "message:video", "message:audio", "message:voice"], async (ctx) => {
        const chatId = String(ctx.chat.id);

        if (!isConfigReady() || isWizardActive(chatId)) {
            return;
        }

        const lang = loadUserConfig().language || "en";

        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }

        try {
            await scheduleWork("user", async () => {
                const saved = await saveIncomingTelegramFile(ctx);
                let visionAttachment = null;
                if (isVisionImageAttachment(saved)) {
                    const meta = await ensureModelMeta(getMergedProvider(loadUserConfig()));
                    if (meta.supportsVision) visionAttachment = saved;
                }
                const userText = formatFileUserMessage(saved, { visionAttached: Boolean(visionAttachment) });
                await handleAgentTurn(bot, ctx, chatId, userText, { visionAttachment });
            });
        } catch (err) {
            console.error("File message error:", err?.stack || err);
            await ctx.reply(formatAgentError(err, lang), { parse_mode: "HTML" });
        }
    });

    bot.on("message:text", async (ctx) => {
        const chatId = String(ctx.chat.id);
        const text = ctx.message.text;

        if (!isConfigReady() || isWizardActive(chatId)) {
            await handleConfigWizardText(ctx, bot);
            return;
        }

        if (text.trim() === "/reload") {
            return;
        }

        const lang = loadUserConfig().language || "en";

        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }

        try {
            await scheduleWork("user", async () => {
                await handleAgentTurn(bot, ctx, chatId, text);
            });
        } catch (err) {
            console.error("Agent error:", err?.stack || err);
            const status = new TelegramStatusMessage(bot, chatId, lang);
            await status.completeError(formatAgentError(err, lang), { parseMode: "HTML" });
        }
    });

    await bot.start();
}
