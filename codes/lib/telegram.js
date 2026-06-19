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
import { cancelQueuedAgentWork, scheduleWork } from "./agent-queue.js";
import { beginAgentSession, endAgentSession, enqueueAgentMessage, isAgentSessionRunning, requestAgentStop } from "./agent/session.js";
import { saveIncomingTelegramFile, formatFileUserMessage } from "./telegram-downloads.js";
import { isVisionImageAttachment } from "./llm/vision.js";
import { ensureModelMeta } from "./llm/model-meta.js";
import { getMergedProvider } from "./config-loader.js";
import { setCronJobHandler, startCronScheduler } from "./cron/scheduler.js";
import { startUpdateScheduler } from "./update/scheduler.js";
import { sendChatActionSafe, safeTelegramApi, sendMessageSafe } from "./telegram-api.js";

function isReplyFailure(result) {
    return (result?.error === "tool_rounds_exceeded" || result?.error === "empty_reply_exhausted") && !result.text?.trim();
}

function isStoppedByUser(result) {
    return result?.error === "stopped_by_user";
}

function isAgentError(result) {
    return result?.error === "agent_error" || result?.error === "agent_turn_failed";
}

function isSilentReply(result) {
    return Boolean(result?.silent) && !result?.text?.trim();
}

function replyFailureMessage(result, lang) {
    if (result?.error === "empty_reply_exhausted") return t("empty_reply_exhausted", lang);
    return t("tool_rounds_exceeded", lang);
}

async function notifyUserError(status, ctx, bot, chatId, text) {
    const shown = await status.completeError(text);
    if (!shown) {
        if (ctx) {
            await sendMessageSafe(ctx.api, String(ctx.chat.id), text);
        } else {
            await sendTelegramReply(bot, chatId, text, null);
        }
    }
}

async function streamReplyEditFallback(bot, chatId, fullText, stats) {
    await sendTelegramReply(bot, chatId, (fullText || "").trim() || "…", stats);
}

async function replyWithStreaming(bot, ctx, chatId, userText, status, { visionAttachment = null, session = null } = {}) {
    const agentConfig = loadAgentConfig();
    const rawMode = agentConfig.telegramStreaming ?? "draft";
    const mode = rawMode === "off" || rawMode === "draft" ? rawMode : "off";
    if (rawMode !== mode) {
        console.warn(`tabyAgent: unknown telegramStreaming "${rawMode}", using "off"`);
    }
    const agentOpts = {
        chatId,
        bot,
        session,
        onStatusPhase: (phase, detail) => status.setPhase(phase, detail),
    };

    if (mode === "off") {
        const result = await runAgent(userText, { ...agentOpts, visionAttachment });
        if (isStoppedByUser(result)) return result;
        if (isAgentError(result)) return result;
        await status.completeSuccess();
        if (!isSilentReply(result)) {
            await sendTelegramReply(bot, chatId, result.text, result.stats);
        }
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

        if (isStoppedByUser(result)) {
            if (!result.text?.trim() && draft.getLastText()) {
                result.text = draft.getLastText();
            }
            return result;
        }

        if (isReplyFailure(result) || isAgentError(result)) {
            return result;
        }

        await status.completeSuccess();

        if (isSilentReply(result)) {
            saveChatTurn(chatId, result);
            return result;
        }

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
    if (isStoppedByUser(result) || isAgentError(result)) return result;
    if (!isReplyFailure(result)) {
        await status.completeSuccess();
        if (!isSilentReply(result)) {
            await streamReplyEditFallback(bot, chatId, result.text || "…", result.stats);
        }
    }
    saveChatTurn(chatId, result);
    return result;
}

function saveChatTurn(chatId, result) {
    if (result?.turnMessages?.length) {
        try {
            appendChatTurn(chatId, result.turnMessages);
        } catch (err) {
            console.error("Chat history save failed:", err?.stack || err);
        }
    }
}

async function runCronJobForUser(bot, job) {
    try {
        const lang = loadUserConfig().language || "en";
        const header = t("cron_auto_header", lang);
        const userText = `${header}\n\n${job.prompt}`;
        const result = await runAgent(userText, { chatId: job.chatId, bot });
        const body = result.text?.trim() || t("cron_no_output", lang);
        await sendTelegramReply(bot, job.chatId, `${header}\n\n${body}`, result.stats);
        saveChatTurn(job.chatId, result);
    } catch (err) {
        console.error("Cron job error:", err?.stack || err);
    }
}

async function handleAgentTurn(bot, ctx, chatId, userText, { visionAttachment = null } = {}) {
    const lang = loadUserConfig().language || "en";
    const status = new TelegramStatusMessage(bot, chatId, lang);
    const session = beginAgentSession(chatId);

    try {
        await status.start();
        await sendChatActionSafe(bot, chatId, "typing");

        const result = await replyWithStreaming(bot, ctx, chatId, userText, status, { visionAttachment, session });

        if (isAgentError(result)) {
            const msg = result.errorDetail ? formatAgentError(new Error(result.errorDetail), lang) : t("tool_rounds_exceeded", lang);
            await notifyUserError(status, ctx, bot, chatId, msg);
            return result;
        }

        if (isStoppedByUser(result)) {
            await status.completeSuccess();
            const body = result.text?.trim() || t("stopped_by_user", lang);
            await sendTelegramReply(bot, chatId, body, result.stats);
            saveChatTurn(chatId, result);
            return result;
        }

        if (isReplyFailure(result)) {
            await notifyUserError(status, ctx, bot, chatId, replyFailureMessage(result, lang));
        }

        return result;
    } catch (err) {
        console.error("Agent turn error:", err?.stack || err);
        await notifyUserError(status, ctx, bot, chatId, formatAgentError(err, lang));
        return { error: "agent_turn_failed", text: null };
    } finally {
        status.dispose();
        endAgentSession(chatId);
    }
}

async function tryEnqueueDuringRun(ctx, chatId, text) {
    if (!enqueueAgentMessage(chatId, text)) return false;
    const lang = loadUserConfig().language || "en";
    await sendMessageSafe(ctx.api, String(ctx.chat.id), t("message_added_during_run", lang));
    return true;
}

/** Register bot commands with Telegram so users see them in the / menu and profile. */
async function registerBotCommands(bot) {
    const lang = loadUserConfig().language || "en";

    const commandsByLang = {
        en: [
            { command: "start", description: "Begin / show help" },
            { command: "new", description: "Start a new chat (saves memory first)" },
            { command: "stop", description: "Stop the running task" },
            { command: "reload", description: "Reload MCP servers" },
            { command: "config", description: "Open settings wizard" },
            { command: "approve", description: "Approve a new device with a 6-digit code" },
            { command: "help", description: "Show help and available commands" },
            { command: "settings", description: "Open settings (/config)" },
        ],
        ko: [
            { command: "start", description: "시작 / 도움말" },
            { command: "new", description: "새 대화 시작 (먼저 기억 저장)" },
            { command: "stop", description: "진행 중인 작업 중지" },
            { command: "reload", description: "MCP 서버 다시 불러오기" },
            { command: "config", description: "설정 마법사 열기" },
            { command: "approve", description: "6자리 코드로 새 기기 승인" },
            { command: "help", description: "도움말 및 명령어 보기" },
            { command: "settings", description: "설정 열기 (/config)" },
        ],
        ja: [
            { command: "start", description: "開始 / ヘルプ" },
            { command: "new", description: "新しい会話を開始 (先に記憶を保存)" },
            { command: "stop", description: "実行中の作業を停止" },
            { command: "reload", description: "MCP サーバを再読み込み" },
            { command: "config", description: "設定ウィザードを開く" },
            { command: "approve", description: "6 桁コードで新端末を承認" },
            { command: "help", description: "ヘルプとコマンド一覧" },
            { command: "settings", description: "設定を開く (/config)" },
        ],
    };

    const list = commandsByLang[lang] || commandsByLang.en;
    const res = await safeTelegramApi(() => bot.api.setMyCommands(list));
    if (!res.ok) {
        console.warn("setMyCommands failed:", res.error);
    }
    return res.ok;
}

function helpMessage(lang) {
    if (lang === "ko") {
        return [
            "# tabyAgent 도움말",
            "",
            "## 명령어",
            "- `/new` — 새 대화 시작 (이전 대화 요약을 memory.md에 저장)",
            "- `/stop` — 진행 중인 작업 중지",
            "- `/reload` — MCP 서버 다시 불러오기",
            "- `/config` — 설정 마법사 (언어, 모델, 토큰 등)",
            "- `/approve <6-digit code>` — 새 기기 승인",
            "",
            "## 기능",
            "- 파일 첨부: 사진·문서·음성·영상 전송 가능",
            "- 비전: 지원 모델에서 이미지 분석",
            "- 마크다운: 굵게, 기울임, 코드, 표, 인용, 스포일러 지원",
            "- 메모리: /app/user/memory.md 에 자동 저장",
            "",
            "궁금한 점이 있으면 그냥 메시지를 보내세요.",
        ].join("\n");
    }
    if (lang === "ja") {
        return [
            "# tabyAgent ヘルプ",
            "",
            "## コマンド",
            "- `/new` — 新しい会話を開始 (以前の会話の要約を memory.md に保存)",
            "- `/stop` — 実行中の作業を停止",
            "- `/reload` — MCP サーバを再読み込み",
            "- `/config` — 設定ウィザード (言語, モデル, トークン等)",
            "- `/approve <6-digit code>` — 新端末を承認",
            "",
            "## 機能",
            "- ファイル添付: 画像・書類・音声・動画に対応",
            "- ビジョン: 対応モデルで画像分析",
            "- Markdown: 太字, 斜体, コード, 表, 引用, スポイラー対応",
            "- メモリ: /app/user/memory.md に自動保存",
            "",
            "質問があれば、そのままメッセージを送ってください。",
        ].join("\n");
    }
    return [
        "# tabyAgent help",
        "",
        "## Commands",
        "- `/new` — Start a new chat (saves a summary of the previous one to memory.md)",
        "- `/stop` — Stop the running task",
        "- `/reload` — Reload MCP servers",
        "- `/config` — Settings wizard (language, model, token, etc.)",
        "- `/approve <6-digit code>` — Approve a new device",
        "",
        "## Features",
        "- Attachments: photos, documents, voice, video supported",
        "- Vision: image analysis on supported models",
        "- Markdown: bold, italic, code, tables, blockquotes, spoilers",
        "- Memory: durable facts saved to /app/user/memory.md",
        "",
        "If you have a question, just send a message.",
    ].join("\n");
}

export async function startTelegramBot() {
    const token = loadUserConfig().telegram?.botToken?.trim();
    if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN not set");
    }

    const bot = new Bot(token);
    bot.catch((err) => {
        console.error("Telegram bot error:", err?.stack || err);
    });
    const streamMode = loadAgentConfig().telegramStreaming ?? "draft";
    console.log(`tabyAgent: Telegram running (streaming: ${streamMode})`);

    await registerBotCommands(bot);

    setCronJobHandler((job) => runCronJobForUser(bot, job));
    startCronScheduler();
    startUpdateScheduler(bot);

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
        await sendMessageSafe(bot.api, String(ctx.chat.id), `${t("start_ready", lang)}\n\n${helpMessage(lang)}`);
    });

    bot.command("help", async (ctx) => {
        const lang = loadUserConfig().language || "en";
        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }
        if (!(await requireApprovedAccess(ctx))) {
            return;
        }
        await sendMessageSafe(bot.api, String(ctx.chat.id), helpMessage(lang));
    });

    bot.command("settings", async (ctx) => {
        if (isConfigReady() && !(await requireApprovedAccess(ctx))) {
            return;
        }
        await openConfigWizard(ctx, bot);
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
                await sendMessageSafe(ctx.api, String(ctx.chat.id), message);
            });
        } catch (err) {
            console.error("New chat error:", err?.stack || err);
            await sendMessageSafe(ctx.api, String(ctx.chat.id), formatAgentError(err, lang));
        }
    });

    bot.command("stop", async (ctx) => {
        const chatId = String(ctx.chat.id);
        const lang = loadUserConfig().language || "en";

        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        const stoppedQueued = cancelQueuedAgentWork(chatId);
        const stoppedActive = stoppedQueued ? false : requestAgentStop(chatId);
        if (stoppedActive || stoppedQueued) {
            await sendMessageSafe(ctx.api, String(ctx.chat.id), t("stop_requested", lang));
            return;
        }

        await sendMessageSafe(ctx.api, String(ctx.chat.id), t("stop_nothing_running", lang));
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
            await sendMessageSafe(ctx.api, String(ctx.chat.id), formatAgentError(err, lang));
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
            await sendMessageSafe(ctx.api, String(ctx.chat.id), t("auth_denied_command", lang));
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        if (!code) {
            await sendMessageSafe(ctx.api, String(ctx.chat.id), t("auth_approve_usage", lang));
            return;
        }

        const result = await runOwnerApprove(bot, chatId, code);
        await sendMessageSafe(ctx.api, String(ctx.chat.id), result.message);
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
            if (isAgentSessionRunning(chatId)) {
                const saved = await saveIncomingTelegramFile(ctx);
                const userText = formatFileUserMessage(saved, { visionAttached: false });
                if (await tryEnqueueDuringRun(ctx, chatId, userText)) {
                    return;
                }
            }

            const result = await scheduleWork(
                "user",
                async () => {
                    const saved = await saveIncomingTelegramFile(ctx);
                    let visionAttachment = null;
                    if (isVisionImageAttachment(saved)) {
                        const meta = await ensureModelMeta(getMergedProvider(loadUserConfig()));
                        if (meta.supportsVision) visionAttachment = saved;
                    }
                    const userText = formatFileUserMessage(saved, { visionAttached: Boolean(visionAttachment) });
                    return handleAgentTurn(bot, ctx, chatId, userText, { visionAttachment });
                },
                { chatId, cancellable: true },
            );
            if (result?.queued && isStoppedByUser(result)) return;
        } catch (err) {
            console.error("File message error:", err?.stack || err);
            await sendMessageSafe(ctx.api, String(ctx.chat.id), formatAgentError(err, lang));
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
        if (trimmed === "/reload" || trimmed === "/new" || trimmed === "/stop") {
            return;
        }

        const lang = loadUserConfig().language || "en";

        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }

        try {
            if (await tryEnqueueDuringRun(ctx, chatId, text)) {
                return;
            }

            const result = await scheduleWork("user", async () => handleAgentTurn(bot, ctx, chatId, text), { chatId, cancellable: true });
            if (result?.queued && isStoppedByUser(result)) return;
        } catch (err) {
            console.error("Agent error:", err?.stack || err);
            await sendMessageSafe(ctx.api, String(ctx.chat.id), formatAgentError(err, lang));
        }
    });

    await bot.start();
}
