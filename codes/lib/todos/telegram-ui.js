// 텔레그램용 todo 유저 레인: 목록/추가/완료/삭제 + 제안 승인·오퍼 수락 버튼.
// (tabyBot의 웹 UI가 담당하던 사용자 상호작용을 채팅 버튼으로 옮긴 것.)
import { InlineKeyboard } from "grammy";
import { t } from "../i18n.js";
import { sendMessageSafe, editMessageTextSafe } from "../telegram-api.js";
import { isApproved } from "../auth.js";
import { findAgentOrDefault } from "../agents-store.js";
import { loadUserConfig } from "../config-loader.js";
import { telegramThreadOpts } from "../agent-route.js";
import { acceptHandoff, addTodo, approveSuggestion, completeTodo, getTodo, listTodos, rejectSuggestion, removeTodo } from "./store.js";
import { queueTodoNow } from "./scheduler.js";

const KIND_LABEL = { add: "➕", edit: "✏️", delete: "🗑" };

function todoListPayload(lang) {
    const { items, suggestions } = listTodos();
    const userItems = items.filter((row) => row.list === "user" && row.status === "open");
    const kb = new InlineKeyboard();
    const lines = [t("todo_list_header", lang)];

    if (userItems.length) {
        for (const item of userItems) {
            let line = `• ${item.title}`;
            if (item.assignee?.name) line += ` — ${t("todo_assigned_to", lang, { name: item.assignee.name })}`;
            lines.push(line);
            kb.text(t("todo_btn_done", lang), `todo:done:${item.id}`).text(t("todo_btn_del", lang), `todo:del:${item.id}`);
            if (item.assigneeId) kb.text(t("todo_btn_run", lang), `todo:run:${item.id}`);
            kb.row();
            for (const offer of item.offers || []) {
                const name = offer.name || offer.agentId;
                const reason = offer.reason ? ` — ${offer.reason}` : "";
                lines.push(`   ${t("todo_offer_line", lang, { name, reason })}`);
                kb.text(t("todo_btn_accept", lang, { name }), `todo:offer:${item.id}:${offer.agentId}`).row();
            }
        }
    } else {
        lines.push(t("todo_list_empty", lang));
    }

    if (suggestions.length) {
        lines.push("", t("todo_suggestions_header", lang));
        for (const s of suggestions) {
            lines.push(`${KIND_LABEL[s.kind] || "•"} ${s.title}${s.reason ? ` — ${s.reason}` : ""}${s.agentName ? ` (${s.agentName})` : ""}`);
            kb.text(t("todo_btn_approve", lang), `todo:sug:${s.id}:a`).text(t("todo_btn_reject", lang), `todo:sug:${s.id}:r`).row();
        }
    }

    lines.push("", t("todo_usage", lang));
    return { text: lines.join("\n"), keyboard: kb };
}

export async function sendTodoList(bot, chatId, threadId, lang) {
    const { text, keyboard } = todoListPayload(lang);
    return sendMessageSafe(bot, chatId, text, { ...telegramThreadOpts(threadId), reply_markup: keyboard });
}

export function addUserTodo(title) {
    return addTodo({ title, list: "user", createdBy: "user" });
}

export async function postSuggestionCard(bot, chatId, threadId, suggestion, lang) {
    const kind = t(`todo_sug_kind_${suggestion.kind}`, lang);
    const kb = new InlineKeyboard()
        .text(t("todo_btn_approve", lang), `todo:sug:${suggestion.id}:a`)
        .text(t("todo_btn_reject", lang), `todo:sug:${suggestion.id}:r`);
    const text = t("todo_suggest_card", lang, {
        agent: suggestion.agentName || suggestion.agentId || "",
        kind,
        title: suggestion.title || "",
        reason: suggestion.reason ? `\n${suggestion.reason}` : "",
    });
    await sendMessageSafe(bot, chatId, text, { ...telegramThreadOpts(threadId), reply_markup: kb });
}

export async function postOfferCard(bot, chatId, threadId, item, offer, lang) {
    const name = offer.name || offer.agentId || "";
    const kb = new InlineKeyboard().text(t("todo_btn_accept", lang, { name }), `todo:offer:${item.id}:${offer.agentId}`);
    const text = t("todo_offer_card", lang, {
        agent: name,
        title: item.title || "",
        reason: offer.reason ? `\n${offer.reason}` : "",
    });
    await sendMessageSafe(bot, chatId, text, { ...telegramThreadOpts(threadId), reply_markup: kb });
}

async function settleCard(ctx, text) {
    await ctx.answerCallbackQuery({ text: String(text).slice(0, 180) }).catch(() => {});
    const msg = ctx.callbackQuery?.message;
    if (msg?.message_id && msg.chat?.id) {
        const base = String(msg.text || "").split("\n")[0];
        await editMessageTextSafe(ctx.api, msg.chat.id, msg.message_id, `${base}\n\n${text}`).catch(() => {});
    }
}

export async function handleTodoCallback(ctx) {
    const lang = loadUserConfig().language || "en";
    const chatId = String(ctx.callbackQuery?.message?.chat?.id ?? ctx.chat?.id ?? "");
    if (chatId && !isApproved(chatId)) {
        await ctx.answerCallbackQuery({ text: t("todo_expired", lang) }).catch(() => {});
        return;
    }

    const parts = String(ctx.callbackQuery?.data || "").split(":");
    const action = parts[1];

    if (action === "sug") {
        const [id, verdict] = [parts[2], parts[3]];
        const suggestion = listTodos().suggestions.find((row) => row.id === id);
        const result = verdict === "a" ? approveSuggestion(id) : rejectSuggestion(id);
        if (result.error) return settleCard(ctx, t("todo_expired", lang));
        const title = result.item?.title || suggestion?.title || "";
        const threadId = ctx.callbackQuery?.message?.message_thread_id;
        await settleCard(ctx, verdict === "a" ? t("todo_approved", lang, { title }) : t("todo_rejected", lang));
        // 승인된 항목에 제안 에이전트의 오퍼가 붙는다 — 바로 수락할 수 있게 갱신된 목록을 보여준다.
        if (verdict === "a" && chatId) await sendTodoList(ctx.api, chatId, threadId, lang);
        return;
    }

    if (action === "done" || action === "del") {
        const item = getTodo(parts[2]);
        if (!item) return settleCard(ctx, t("todo_expired", lang));
        const result = action === "done" ? completeTodo(item.id) : removeTodo(item.id);
        if (result.error) return settleCard(ctx, t("todo_expired", lang));
        return settleCard(ctx, action === "done" ? t("todo_done_ok", lang, { title: item.title }) : t("todo_deleted", lang, { title: item.title }));
    }

    if (action === "run" || action === "offer") {
        let item = getTodo(parts[2]);
        if (!item || item.status !== "open") return settleCard(ctx, t("todo_expired", lang));

        if (action === "offer") {
            const accepted = acceptHandoff(item.id, parts[3]);
            if (accepted.error) return settleCard(ctx, t("todo_expired", lang));
            item = accepted.item;
        }

        const executorId = item.assigneeId || item.executor?.id;
        const agent = executorId ? findAgentOrDefault(executorId) : null;
        if (!agent) return settleCard(ctx, t("todo_expired", lang));
        const queued = queueTodoNow(agent, item);
        if (queued.error) return settleCard(ctx, t("todo_run_failed", lang, { error: queued.error }));
        return settleCard(
            ctx,
            t(action === "offer" ? "todo_offer_accepted" : "todo_run_queued", lang, { title: item.title, name: agent.name || agent.id }),
        );
    }

    await ctx.answerCallbackQuery().catch(() => {});
}
