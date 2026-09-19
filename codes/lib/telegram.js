import { Bot } from "grammy";
import { loadUserConfig, loadAgentConfig } from "./config-loader.js";
import { requireApprovedAccess, runOwnerApprove } from "./auth-access.js";
import { runAgent } from "./agent/loop.js";
import {
    RECOVERY_PROMPT,
    appendChatTurn,
    appendPendingUserTurn,
    checkpointChatTurn,
    hasRecoverableChatTurn,
    lastChatTurnMessages,
    listSessionRoots,
    markChatTurnInterrupted,
    prepareChatTurnRecovery,
} from "./agent/chat-history.js";
import { handleNewChat } from "./agent/new-chat.js";
import { TelegramDraftStream } from "./telegram-draft.js";
import { TelegramStatusMessage } from "./telegram-status.js";
import { isConfigReady, isWizardActive, openConfigWizard, handleConfigWizardText, handleConfigWizardCallback } from "./onboarding.js";
import { isAgentsWizardActive, openAgentsWizard, handleAgentsWizardText, handleAgentsWizardCallback } from "./agents-wizard.js";
import { sendTelegramReply } from "./telegram-stats.js";
import { t, formatAgentError } from "./i18n.js";
import { cancelQueuedAgentWork, scheduleWork } from "./agent-queue.js";
import { hasPendingAsk, resolvePendingAskByButton, resolvePendingAskByText } from "./agent/user-ask.js";
import { beginAgentSession, endAgentSession, enqueueAgentMessage, isAgentSessionRunning, requestAgentStop } from "./agent/session.js";
import { saveIncomingTelegramFile, formatFileUserMessage } from "./telegram-downloads.js";
import { isVisionImageMime } from "./llm/vision.js";
import { ensureModelMeta } from "./llm/model-meta.js";
import { getMergedProvider } from "./config-loader.js";
import { setTodoHandlers, startTodoScheduler } from "./todos/scheduler.js";
import { addUserTodo, handleTodoCallback, sendTodoList } from "./todos/telegram-ui.js";
import { setProactiveRunner, CHECKIN_PROMPT, startProactiveScheduler } from "./proactive.js";
import { startDreamingScheduler } from "./dreaming/scheduler.js";
import { maybeScheduleSessionReview } from "./dreaming/review.js";
import { SCHEDULED_TURN_MARKER } from "./tools/todo-tool.js";
import { markUserActivity } from "./user-activity.js";
import { startUpdateScheduler } from "./update/scheduler.js";
import { sendChatActionSafe, safeTelegramApi, sendMessageSafe } from "./telegram-api.js";
import { memoryFilePath } from "./path-labels.js";
import { routeForAgent, routeForSessionKey, routeFromCtx, telegramThreadOpts } from "./agent-route.js";
import { refreshTopicsEnabled, getTopicsEnabled, ensureMainTopic } from "./telegram-topics.js";
import { getOwnerChatId } from "./auth.js";
import { mainAgentRef } from "./agents-store.js";

function isReplyFailure(result) {
    return (result?.error === "tool_rounds_exceeded" || result?.error === "empty_reply_exhausted") && !result.text?.trim();
}

function shouldRecover(result) {
    return isReplyFailure(result) || result?.error === "agent_error" || result?.error === "agent_turn_failed";
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

async function notifyUserError(status, ctx, bot, route, text) {
    const extra = telegramThreadOpts(route.threadId);
    const shown = await status.completeError(text);
    if (!shown) {
        if (ctx) {
            await sendMessageSafe(ctx.api, route.chatId, text, extra);
        } else {
            await sendTelegramReply(bot, route.chatId, text, null, extra);
        }
    }
}

async function streamReplyEditFallback(bot, route, fullText, stats) {
    await sendTelegramReply(bot, route.chatId, (fullText || "").trim() || "…", stats, telegramThreadOpts(route.threadId));
}

async function replyWithStreaming(bot, ctx, route, userText, status, { attachments = [], session = null, recoveryBase = null } = {}) {
    const agentConfig = loadAgentConfig();
    const rawMode = agentConfig.telegramStreaming ?? "draft";
    const mode = rawMode === "off" || rawMode === "draft" ? rawMode : "off";
    if (rawMode !== mode) {
        console.warn(`tabyAgent: unknown telegramStreaming "${rawMode}", using "off"`);
    }
    const extra = telegramThreadOpts(route.threadId);
    const saveExtra = { attachments, baseMessages: recoveryBase };
    const agentOpts = {
        chatId: route.chatId,
        sessionKey: route.sessionKey,
        threadId: route.threadId,
        agentId: route.agentId,
        bot,
        session,
        attachments,
        onStatusPhase: (phase, detail) => status.setPhase(phase, detail),
        onCheckpoint: (turnMessages) => checkpointTurn(route.sessionKey, turnMessages, recoveryBase),
    };

    if (mode === "off") {
        const result = await runAgent(userText, agentOpts);
        if (isStoppedByUser(result)) return result;
        if (isAgentError(result)) return result;
        await status.completeSuccess();
        if (!isSilentReply(result)) {
            await sendTelegramReply(bot, route.chatId, result.text, result.stats, extra);
        }
        saveChatTurn(route.sessionKey, result, saveExtra);
        return result;
    }

    if (mode === "draft") {
        const draftId = ctx.update.update_id;
        const draft = new TelegramDraftStream(bot, route.chatId, draftId, extra);

        const result = await runAgent(userText, {
            ...agentOpts,
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
            saveChatTurn(route.sessionKey, result, saveExtra);
            return result;
        }

        if (draft.isAvailable() && draft.getLastText()) {
            await draft.update(finalText);
            const sent = await draft.finalize(result.stats);
            if (sent) {
                saveChatTurn(route.sessionKey, result, saveExtra);
                return result;
            }
        }

        await streamReplyEditFallback(bot, route, finalText, result.stats);
        saveChatTurn(route.sessionKey, result, saveExtra);
        return result;
    }

    const result = await runAgent(userText, agentOpts);
    if (isStoppedByUser(result) || isAgentError(result)) return result;
    if (!isReplyFailure(result)) {
        await status.completeSuccess();
        if (!isSilentReply(result)) {
            await streamReplyEditFallback(bot, route, result.text || "…", result.stats);
        }
    }
    saveChatTurn(route.sessionKey, result, saveExtra);
    return result;
}

function checkpointTurn(sessionKey, turnMessages, baseMessages = null) {
    try {
        checkpointChatTurn(sessionKey, turnMessages, { baseMessages });
    } catch (err) {
        console.error("Chat checkpoint failed:", err?.stack || err);
    }
}

function saveChatTurn(sessionKey, result, { attachments = [], baseMessages = null } = {}) {
    if (!result?.turnMessages?.length) return;
    try {
        const messages = result.turnMessages.map((message) => ({ ...message }));
        const userMessage = messages.find((message) => message?.role === "user");
        if (userMessage && Array.isArray(userMessage.content)) {
            const textPart = userMessage.content.find((part) => part?.type === "text");
            userMessage.content = textPart?.text || "";
        }
        appendChatTurn(sessionKey, messages, {
            stats: result.stats,
            attachments,
            deliveredAttachments: result.deliveredAttachments,
            baseMessages,
        });
    } catch (err) {
        console.error("Chat history save failed:", err?.stack || err);
    }
}

function buildFirePrompt(item) {
    const when = item.when ? ` (${item.when})` : "";
    const body = String(item.prompt || "").trim() || `Do the task: ${item.title}`;
    const isJob = (item.list || "user") !== "user";
    const editNote =
        item.lastEdit?.by === "user"
            ? `\nNote: the user last edited this task at ${item.lastEdit.at}${item.lastEdit.fields?.length ? ` (changed: ${item.lastEdit.fields.join(", ")})` : ""}. The text below is the current version.`
            : "";
    return `${SCHEDULED_TURN_MARKER}
${isJob ? `Scheduled job` : `Agent todo`} "${item.title}"${when}. This is an automatic run${isJob ? "" : " of a subcontracted task"}, not a user message.${editNote}

Task:
${body}

Follow the task for when to speak. If it does not say to report empty results, stay silent unless there is a real finding or a failure the user must know. Do not narrate negative checks (no "I looked", "nothing new", "the list is empty"). If there is nothing to tell the user, reply with ONLY __SILENT__ — the entire message.`;
}

async function deliverAutomationReply(bot, route, text, stats = null) {
    await sendTelegramReply(bot, route.chatId, text, stats, telegramThreadOpts(route.threadId));
}

// 스케줄된 작업·능동 체크인·부팅 복구가 공유하는 자동 실행 턴.
// 사용자 메시지가 아니므로 스트리밍/상태 메시지 없이 돌고, 결과는 호출자가 보낸다.
async function runAutomatedTurn(bot, route, { userText, todoId = null, quietEmpty = true, automated = true, recoveryBase = null } = {}) {
    const session = beginAgentSession(route.sessionKey, { automated });
    try {
        const result = await runAgent(userText, {
            chatId: route.chatId,
            sessionKey: route.sessionKey,
            threadId: route.threadId,
            agentId: route.agentId,
            bot,
            session,
            quietEmpty,
            todoId,
            onCheckpoint: (turnMessages) => checkpointTurn(route.sessionKey, turnMessages, recoveryBase),
        });
        saveChatTurn(route.sessionKey, result, { baseMessages: recoveryBase });
        if (result?.error && !isStoppedByUser(result)) markChatTurnInterrupted(route.sessionKey);
        maybeScheduleSessionReview({ sessionKey: route.sessionKey, agentId: route.agentId, result });
        return result;
    } finally {
        endAgentSession(route.sessionKey);
    }
}

// 재시작 전에 끊긴 사용자 턴을 이어서 완료한다.
function recoverInterruptedTurns(bot) {
    for (const { sessionKey } of listSessionRoots()) {
        if (!hasRecoverableChatTurn(sessionKey)) continue;
        const route = routeForSessionKey(sessionKey);
        if (!route) continue;
        if (!prepareChatTurnRecovery(sessionKey)) continue;
        const recoveryBase = lastChatTurnMessages(sessionKey);
        void scheduleWork(
            "user",
            async () => {
                const result = await runAutomatedTurn(bot, route, {
                    userText: RECOVERY_PROMPT,
                    quietEmpty: false,
                    automated: false,
                    recoveryBase,
                });
                if (!result || isSilentReply(result) || result.error) return;
                const body = result.text?.trim();
                if (body) await deliverAutomationReply(bot, route, body, result.stats);
            },
            { sessionKey, cancellable: true },
        ).catch((err) => console.error("Interrupted turn recovery failed:", err?.stack || err));
    }
}

// todos/능동 체크인을 텔레그램 채팅·토픽 전달에 연결한다 (웹 SSE 대신).
function setAutomationHandlers(bot) {
    setTodoHandlers({
        async runAgent({ agent, item, sessionKey }) {
            const lang = loadUserConfig().language || "en";
            const isJob = (item.list || "user") !== "user";
            const route = routeForSessionKey(sessionKey) || routeForAgent(agent);
            if (!route) {
                console.warn(`tabyAgent: todo ${item.id} has no telegram route — skipping`);
                return { error: "no_route", silent: true };
            }
            try {
                const result = await runAutomatedTurn(bot, route, { userText: buildFirePrompt(item), todoId: item.id });
                if (!result || isSilentReply(result)) return result;
                if (result.error) {
                    if (!isStoppedByUser(result)) {
                        await deliverAutomationReply(
                            bot,
                            route,
                            `${isJob ? "⏰" : "❌"} ${item.title}: ${result.errorDetail || result.error}`,
                            result.stats,
                        );
                    }
                    return result;
                }
                const body = result.text?.trim() || t("schedule_no_output", lang);
                await deliverAutomationReply(bot, route, `${isJob ? "⏰" : "✅"} ${item.title}\n\n${body}`, result.stats);
                return result;
            } catch (err) {
                console.error("Todo job error:", err?.stack || err);
                await deliverAutomationReply(bot, route, `${isJob ? "⏰" : "❌"} ${item.title}: ${err?.message || String(err)}`).catch(() => {});
                return { error: err?.message || String(err), silent: true };
            }
        },
        async remindUser({ item }) {
            const route = routeForAgent(mainAgentRef());
            if (!route) return;
            await sendTelegramReply(
                bot,
                route.chatId,
                t("todo_reminder", loadUserConfig().language || "en", { title: item.title }),
                null,
                telegramThreadOpts(route.threadId),
            ).catch((err) => console.error("Todo reminder send failed:", err?.stack || err));
        },
    });

    setProactiveRunner(async ({ agent, sessionKey }) => {
        const route = routeForSessionKey(sessionKey) || routeForAgent(agent);
        if (!route) return { error: "no_route" };
        const result = await runAutomatedTurn(bot, route, {
            userText: `${SCHEDULED_TURN_MARKER}\nAutomatic proactive check-in — not a user message.\n\n${CHECKIN_PROMPT}`,
        });
        if (!result || isSilentReply(result) || result.error) return result;
        const body = result.text?.trim();
        if (body) await deliverAutomationReply(bot, route, body, result.stats);
        return result;
    });
}

async function handleAgentTurn(bot, ctx, route, userText, { attachments = [] } = {}) {
    const lang = loadUserConfig().language || "en";
    if (getTopicsEnabled() === true) {
        await refreshTopicsEnabled(bot);
    }
    await ensureMainTopic(bot, route.chatId);
    const extra = telegramThreadOpts(route.threadId);
    const status = new TelegramStatusMessage(bot, route.chatId, lang, extra);
    const session = beginAgentSession(route.sessionKey);

    try {
        await status.start();
        await sendChatActionSafe(bot, route.chatId, "typing", extra);

        let result = await replyWithStreaming(bot, ctx, route, userText, status, { attachments, session });
        let recoveryBase = null;

        // 첫 실행이 실패로 끝났으면(빈 응답/라운드 초과/에러) 중단된 턴을 정리하고 한 번 이어서 완료한다.
        if (shouldRecover(result)) {
            markChatTurnInterrupted(route.sessionKey);
            if (prepareChatTurnRecovery(route.sessionKey)) {
                recoveryBase = lastChatTurnMessages(route.sessionKey);
                result = await replyWithStreaming(bot, ctx, route, RECOVERY_PROMPT, status, { session, recoveryBase });
            }
        }

        // 최종 결과도 실패면 턴을 interrupted로 남겨 다음 부팅 복구가 잡는다.
        if (result?.error && !isStoppedByUser(result)) markChatTurnInterrupted(route.sessionKey);
        maybeScheduleSessionReview({ sessionKey: route.sessionKey, agentId: route.agentId, result });

        if (isAgentError(result)) {
            const msg = result.errorDetail ? formatAgentError(new Error(result.errorDetail), lang) : t("tool_rounds_exceeded", lang);
            await notifyUserError(status, ctx, bot, route, msg);
            return result;
        }

        if (isStoppedByUser(result)) {
            await status.completeSuccess();
            const body = result.text?.trim() || t("stopped_by_user", lang);
            await sendTelegramReply(bot, route.chatId, body, result.stats, extra);
            saveChatTurn(route.sessionKey, result, { baseMessages: recoveryBase });
            return result;
        }

        if (isReplyFailure(result)) {
            await notifyUserError(status, ctx, bot, route, replyFailureMessage(result, lang));
        }

        return result;
    } catch (err) {
        console.error("Agent turn error:", err?.stack || err);
        await notifyUserError(status, ctx, bot, route, formatAgentError(err, lang));
        return { error: "agent_turn_failed", text: null };
    } finally {
        status.dispose();
        endAgentSession(route.sessionKey);
    }
}

function tryEnqueueDuringRun(sessionKey, text) {
    return enqueueAgentMessage(sessionKey, text);
}

function dispatchAgentWork(ctx, route, workFn) {
    const lang = loadUserConfig().language || "en";
    void scheduleWork("user", workFn, { chatId: route.chatId, sessionKey: route.sessionKey, cancellable: true }).catch((err) => {
        console.error("Agent error:", err?.stack || err);
        void sendMessageSafe(ctx.api, route.chatId, formatAgentError(err, lang), telegramThreadOpts(route.threadId));
    });
}

function dispatchAgentTurn(bot, ctx, route, userText, { attachments = [] } = {}) {
    dispatchAgentWork(ctx, route, () => handleAgentTurn(bot, ctx, route, userText, { attachments }));
}

async function registerBotCommands(bot) {
    const lang = loadUserConfig().language || "en";

    const commandsByLang = {
        en: [
            { command: "start", description: "Begin / show help" },
            { command: "new", description: "Start a new chat (self-improves in background)" },
            { command: "stop", description: "Stop the running task" },
            { command: "config", description: "Open settings" },
            { command: "agents", description: "Manage extra agents" },
            { command: "todo", description: "Your todo list" },
            { command: "approve", description: "Approve a new device with a 6-digit code" },
            { command: "help", description: "Show help and available commands" },
        ],
        ko: [
            { command: "start", description: "시작 / 도움말" },
            { command: "new", description: "새 대화 시작 (백그라운드 자기개선)" },
            { command: "stop", description: "진행 중인 작업 중지" },
            { command: "config", description: "설정 열기" },
            { command: "agents", description: "에이전트 관리" },
            { command: "todo", description: "할 일 목록" },
            { command: "approve", description: "6자리 코드로 새 기기 승인" },
            { command: "help", description: "도움말 및 명령어 보기" },
        ],
        ja: [
            { command: "start", description: "開始 / ヘルプ" },
            { command: "new", description: "新しい会話を開始 (バックグラウンド自己改善)" },
            { command: "stop", description: "実行中の作業を停止" },
            { command: "config", description: "設定を開く" },
            { command: "agents", description: "エージェント管理" },
            { command: "todo", description: "タスクリスト" },
            { command: "approve", description: "6 桁コードで新端末を承認" },
            { command: "help", description: "ヘルプとコマンド一覧" },
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
    const memoryPath = memoryFilePath();
    if (lang === "ko") {
        return [
            "# tabyAgent 도움말",
            "",
            "## 명령어",
            "- `/new` — 새 대화 시작 (백그라운드에서 이전 대화 자기개선)",
            "- `/stop` — 진행 중인 작업 중지",
            "- `/config` — 설정 (언어, 모델, 사고 수준, 푸터, 업데이트 등)",
            "- `/agents` — 에이전트 관리",
            "- `/todo` — 할 일 목록 (추가: /todo <제목>)",
            "- `/approve <6-digit code>` — 새 기기 승인",
            "",
            "## 기능",
            "- 파일 첨부: 사진·문서·음성·영상 전송 가능",
            "- 비전: 지원 모델에서 이미지 분석",
            "- 마크다운: 굵게, 기울임, 코드, 표, 인용, 스포일러 지원",
            `- 메모리: ${memoryPath} 에 자동 저장`,
            "",
            "궁금한 점이 있으면 그냥 메시지를 보내세요.",
        ].join("\n");
    }
    if (lang === "ja") {
        return [
            "# tabyAgent ヘルプ",
            "",
            "## コマンド",
            "- `/new` — 新しい会話を開始 (バックグラウンドで前の会話を自己改善)",
            "- `/stop` — 実行中の作業を停止",
            "- `/config` — 設定 (言語, モデル, 思考レベル, フッター, 更新確認 等)",
            "- `/agents` — エージェント管理",
            "- `/todo` — タスクリスト (追加: /todo <タイトル>)",
            "- `/approve <6-digit code>` — 新端末を承認",
            "",
            "## 機能",
            "- ファイル添付: 画像・書類・音声・動画に対応",
            "- ビジョン: 対応モデルで画像分析",
            "- Markdown: 太字, 斜体, コード, 表, 引用, スポイラー対応",
            `- メモリ: ${memoryPath} に自動保存`,
            "",
            "質問があれば、そのままメッセージを送ってください。",
        ].join("\n");
    }
    return [
        "# tabyAgent help",
        "",
        "## Commands",
        "- `/new` — Start a new chat (self-improves on the previous one in the background)",
        "- `/stop` — Stop the running task",
        "- `/config` — Settings (change language, model, thinking level, footer, updates, etc.)",
        "- `/agents` — Manage extra agents",
        "- `/todo` — Todo list (add: /todo <title>)",
        "- `/approve <6-digit code>` — Approve a new device",
        "",
        "## Features",
        "- Attachments: photos, documents, voice, video supported",
        "- Vision: image analysis on supported models",
        "- Markdown: bold, italic, code, tables, blockquotes, spoilers",
        `- Memory: durable facts saved to ${memoryPath}`,
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
    await refreshTopicsEnabled(bot);
    const ownerChatId = getOwnerChatId();
    if (ownerChatId) await ensureMainTopic(bot, ownerChatId);

    setAutomationHandlers(bot);
    startTodoScheduler();
    startProactiveScheduler();
    startDreamingScheduler();
    startUpdateScheduler(bot);
    recoverInterruptedTurns(bot);

    bot.command("start", async (ctx) => {
        const route = routeFromCtx(ctx);
        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }
        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }
        const lang = loadUserConfig().language || "en";
        await sendMessageSafe(bot.api, route.chatId, `${t("start_ready", lang)}\n\n${helpMessage(lang)}`, telegramThreadOpts(route.threadId));
    });

    bot.command("help", async (ctx) => {
        const route = routeFromCtx(ctx);
        const lang = loadUserConfig().language || "en";
        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }
        if (!(await requireApprovedAccess(ctx))) {
            return;
        }
        await sendMessageSafe(bot.api, route.chatId, helpMessage(lang), telegramThreadOpts(route.threadId));
    });

    bot.command("new", async (ctx) => {
        const route = routeFromCtx(ctx);
        const lang = loadUserConfig().language || "en";

        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        try {
            await scheduleWork(
                "user",
                async () => {
                    const message = await handleNewChat(bot, route.sessionKey);
                    await sendMessageSafe(ctx.api, route.chatId, message, telegramThreadOpts(route.threadId));
                },
                { chatId: route.chatId, sessionKey: route.sessionKey },
            );
        } catch (err) {
            console.error("New chat error:", err?.stack || err);
            await sendMessageSafe(ctx.api, route.chatId, formatAgentError(err, lang), telegramThreadOpts(route.threadId));
        }
    });

    bot.command("stop", async (ctx) => {
        const route = routeFromCtx(ctx);
        const lang = loadUserConfig().language || "en";

        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        const stoppedQueued = cancelQueuedAgentWork(route.sessionKey);
        const stoppedActive = stoppedQueued ? false : requestAgentStop(route.sessionKey);
        if (stoppedActive || stoppedQueued) {
            await sendMessageSafe(ctx.api, route.chatId, t("stop_requested", lang), telegramThreadOpts(route.threadId));
            return;
        }

        await sendMessageSafe(ctx.api, route.chatId, t("stop_nothing_running", lang), telegramThreadOpts(route.threadId));
    });

    bot.command("config", async (ctx) => {
        if (isConfigReady() && !(await requireApprovedAccess(ctx))) {
            return;
        }
        await openConfigWizard(ctx, bot);
    });

    bot.command("agents", async (ctx) => {
        if (isConfigReady() && !(await requireApprovedAccess(ctx))) {
            return;
        }
        await openAgentsWizard(ctx, bot);
    });

    bot.command("todo", async (ctx) => {
        const route = routeFromCtx(ctx);
        const lang = loadUserConfig().language || "en";

        if (!isConfigReady()) {
            await openConfigWizard(ctx, bot);
            return;
        }

        if (!(await requireApprovedAccess(ctx))) {
            return;
        }

        const title = (ctx.match || "").trim();
        if (title) {
            const result = addUserTodo(title);
            if (result.error) {
                await sendMessageSafe(ctx.api, route.chatId, `⚠️ ${result.error}`, telegramThreadOpts(route.threadId));
                return;
            }
            await sendMessageSafe(ctx.api, route.chatId, t("todo_added", lang, { title: result.item.title }), telegramThreadOpts(route.threadId));
            return;
        }

        await sendTodoList(bot, route.chatId, route.threadId, lang);
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
        const route = routeFromCtx(ctx);
        await sendMessageSafe(ctx.api, chatId, result.message, telegramThreadOpts(route.threadId));
    });

    bot.callbackQuery(/^cfg:/, async (ctx) => {
        await handleConfigWizardCallback(ctx, bot);
    });

    bot.callbackQuery(/^ag:/, async (ctx) => {
        await handleAgentsWizardCallback(ctx, bot);
    });

    bot.callbackQuery(/^todo:/, async (ctx) => {
        await handleTodoCallback(ctx);
    });

    bot.callbackQuery(/^ask:/, async (ctx) => {
        const route = routeFromCtx(ctx);
        const lang = loadUserConfig().language || "en";
        const parts = String(ctx.callbackQuery?.data || "").split(":");
        const askId = parts[1];
        const idx = Number(parts[2]);
        if (!askId || !Number.isInteger(idx)) {
            await ctx.answerCallbackQuery({ text: t("user_ask_expired", lang) });
            return;
        }
        const answered = resolvePendingAskByButton(route.sessionKey, askId, idx);
        if (answered === null) {
            await ctx.answerCallbackQuery({ text: t("user_ask_expired", lang) });
            return;
        }
        await ctx.answerCallbackQuery({ text: `✅ ${answered.slice(0, 60)}` });
    });

    bot.on(["message:document", "message:photo", "message:video", "message:audio", "message:voice"], async (ctx) => {
        const route = routeFromCtx(ctx);

        if (!isConfigReady() || isWizardActive(route.chatId) || isAgentsWizardActive(route.chatId)) {
            return;
        }

        const lang = loadUserConfig().language || "en";

        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }

        try {
            if (isAgentSessionRunning(route.sessionKey)) {
                const saved = await saveIncomingTelegramFile(ctx);
                const userText = formatFileUserMessage(saved, { visionAttached: false });
                markUserActivity();
                try {
                    appendPendingUserTurn(route.sessionKey, userText, [saved]);
                } catch (err) {
                    console.error("Pending user turn save failed:", err?.stack || err);
                }
                if (tryEnqueueDuringRun(route.sessionKey, userText)) {
                    return;
                }
            }

            dispatchAgentWork(ctx, route, async () => {
                const saved = await saveIncomingTelegramFile(ctx);
                let visionAttached = false;
                if (isVisionImageMime(saved?.mimeType)) {
                    const meta = await ensureModelMeta(getMergedProvider(loadUserConfig()));
                    visionAttached = Boolean(meta.supportsVision);
                }
                const userText = formatFileUserMessage(saved, { visionAttached });
                markUserActivity();
                try {
                    appendPendingUserTurn(route.sessionKey, userText, [saved]);
                } catch (err) {
                    console.error("Pending user turn save failed:", err?.stack || err);
                }
                return handleAgentTurn(bot, ctx, route, userText, { attachments: [saved] });
            });
        } catch (err) {
            console.error("File message error:", err?.stack || err);
            await sendMessageSafe(ctx.api, route.chatId, formatAgentError(err, lang), telegramThreadOpts(route.threadId));
        }
    });

    bot.on("message:text", async (ctx) => {
        const route = routeFromCtx(ctx);
        const text = ctx.message.text;

        if (isAgentsWizardActive(route.chatId)) {
            await handleAgentsWizardText(ctx, bot);
            return;
        }

        if (!isConfigReady() || isWizardActive(route.chatId)) {
            await handleConfigWizardText(ctx, bot);
            return;
        }

        const trimmed = text.trim();
        if (trimmed === "/new" || trimmed === "/stop" || trimmed === "/agents" || trimmed.startsWith("/agents@") || trimmed.startsWith("/todo")) {
            return;
        }

        const lang = loadUserConfig().language || "en";

        if (!(await requireApprovedAccess(ctx, { claimFirst: true }))) {
            return;
        }

        // 대기 중인 user_ask가 있으면 이 텍스트를 답변으로 처리하고 에이전트 큐로 보내지 않는다.
        if (hasPendingAsk(route.sessionKey) && resolvePendingAskByText(route.sessionKey, trimmed)) {
            return;
        }

        try {
            markUserActivity();
            // 실행 전에 디스크에 기록해 두면 프로세스 크래시가 나도 부팅 복구가 이어 받는다.
            try {
                appendPendingUserTurn(route.sessionKey, text);
            } catch (err) {
                console.error("Pending user turn save failed:", err?.stack || err);
            }
            if (tryEnqueueDuringRun(route.sessionKey, text)) {
                return;
            }

            dispatchAgentTurn(bot, ctx, route, text);
        } catch (err) {
            console.error("Agent error:", err?.stack || err);
            await sendMessageSafe(ctx.api, route.chatId, formatAgentError(err, lang), telegramThreadOpts(route.threadId));
        }
    });

    await bot.start();
}
