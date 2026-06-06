import { Bot } from "grammy";
import { loadUserConfig, loadAgentConfig } from "./config-loader.js";
import { requireApprovedAccess, runOwnerApprove } from "./auth-access.js";
import { runAgent } from "./agent/loop.js";
import { appendChatTurn } from "./agent/chat-history.js";
import { handleNewChat } from "./agent/new-chat.js";
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

function isReplyFailure(result) {
    return (result?.error === "tool_rounds_exceeded" || result?.error === "empty_reply_exhausted") && !result.text?.trim();
}

function replyFailureMessage(result, lang) {
    if (result?.error === "empty_reply_exhausted") return t("empty_reply_exhausted", lang);
    return t("tool_rounds_exceeded", lang);
}

async function streamReplyEditFallback(bot, chatId, fullText, stats) {
    await sendTelegramReply(bot, chatId, (fullText || "").trim() || "…", stats);
}

async function replyWithStreaming(bot, ctx, chatId, userText, status, visionAttachment = null) {
    const agentConfig = loadAgentConfig();
    const rawMode = agentConfig.telegramStreaming ?? "draft";
    const mode = rawMode === "off" || rawMode === "draft" ? rawMode : "off";
    if (rawMode !== mode) {
        console.warn(`tabyAgent: unknown telegramStreaming "${rawMode}", using "off"`);
    }
    const agentOpts = {
        chatId,
        bot,
        onStatusPhase: (phase, detail) => status.setPhase(phase, detail),
    };

    if (mode === "off") {
        const result = await runAgent(userText, { ...agentOpts, visionAttachment });
        await status.completeSuccess();
        await sendTelegramReply(bot, chatId, result.text, result.stats);
        saveChatTurn(chatId, result);
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

        if (isReplyFailure(result)) {
            return result;
        }

        await status.completeSuccess();

        if (draft.isAvailable() && draft.getLastText()) {
            await draft.update(finalText);
            const sent = await draft.finalize(result.stats);
            if (sent) {
                saveChatTurn(chatId, result);
                return result;
            }
        }

        await streamReplyEditFallback(bot, chatId, finalText, result.stats);
        saveChatTurn(chatId, result);
        return result;
    }

    const result = await runAgent(userText, { ...agentOpts, visionAttachment });
    if (!isReplyFailure(result)) {
        await status.completeSuccess();
        await streamReplyEditFallback(bot, chatId, result.text || "…", result.stats);
    }
    saveChatTurn(chatId, result);
    return result;
}

function saveChatTurn(chatId, result) {
    if (result?.turnMessages?.length) {
        appendChatTurn(chatId, result.turnMessages);
    }
}

async function runCronJobForUser(bot, job) {
    const lang = loadUserConfig().language || "en";
    const header = t("cron_auto_header", lang);
    const userText = `${header}\n\n${job.prompt}`;
    const result = await runAgent(userText, { chatId: job.chatId, bot });
    const body = result.text?.trim() || t("cron_no_output", lang);
    await sendTelegramReply(bot, job.chatId, `${header}\n\n${body}`, result.stats);
    saveChatTurn(job.chatId, result);
}

async function handleAgentTurn(bot, ctx, chatId, userText, { visionAttachment = null } = {}) {
    const lang = loadUserConfig().language || "en";
    const status = new TelegramStatusMessage(bot, chatId, lang);

    await status.start();
    await ctx.replyWithChatAction("typing").catch(() => {});

    const result = await replyWithStreaming(bot, ctx, chatId, userText, status, visionAttachment);

    if (isReplyFailure(result)) {
        await status.completeError(replyFailureMessage(result, lang));
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
        await ctx.reply(t("start_ready", lang));
    });

    bot.command("new", async (ctx) => {
        const chatId = String(ctx.chat.id);
        const lang = loadUserConfig().language || "en";

        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        try {
            await scheduleWork("user", async () => {
                const message = await handleNewChat(bot, chatId);
                await ctx.reply(message);
            });
        } catch (err) {
            console.error("New chat error:", err?.stack || err);
            await ctx.reply(formatAgentError(err, lang), { parse_mode: "HTML" });
        }
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
            await scheduleWork("user", async () => {
                const report = await runReload();
                await sendTelegramReply(bot, String(ctx.chat.id), formatReloadReport(report, lang), null);
            });
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

        const trimmed = text.trim();
        if (trimmed === "/reload" || trimmed === "/new") {
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
