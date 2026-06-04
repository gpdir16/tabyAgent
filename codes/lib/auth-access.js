import { loadUserConfig } from "./config-loader.js";
import { claimOwnerIfNone, hasOwner, isApproved, issuePendingCode, approveCode } from "./auth.js";
import { t } from "./i18n.js";

export async function replyAuthPending(ctx, chatId) {
    const lang = loadUserConfig().language || "en";
    const { code, minutes } = issuePendingCode(chatId);
    await ctx.reply(t("auth_pending", lang, { code, minutes }));
}

export async function notifyOwnerTransfer(bot, { previousOwner, newChatId, approvedByChatId }) {
    const lang = loadUserConfig().language || "en";
    if (previousOwner && previousOwner !== newChatId) {
        await bot.api.sendMessage(previousOwner, t("auth_disconnected", lang)).catch(() => {});
    }
    if (newChatId && newChatId !== approvedByChatId) {
        await bot.api.sendMessage(newChatId, t("auth_granted", lang)).catch(() => {});
    }
}

export async function runOwnerApprove(bot, ownerChatId, code) {
    const lang = loadUserConfig().language || "en";
    const result = approveCode(code);
    if (!result.ok) {
        return { ok: false, message: t("auth_approve_fail", lang) };
    }
    await notifyOwnerTransfer(bot, {
        previousOwner: result.previousOwner,
        newChatId: result.chatId,
        approvedByChatId: ownerChatId,
    });
    const message = result.chatId === ownerChatId ? t("auth_approve_self", lang) : t("auth_approve_ok", lang, { chatId: result.chatId });
    return { ok: true, message };
}

/**
 * Returns true when the chat may use bot features.
 * When claimFirst is true and no owner exists yet, this chat becomes the sole owner.
 */
export async function requireApprovedAccess(ctx, { claimFirst = false } = {}) {
    const chatId = String(ctx.chat.id);

    if (isApproved(chatId)) {
        return true;
    }

    if (claimFirst && !hasOwner()) {
        claimOwnerIfNone(chatId);
        return true;
    }

    await replyAuthPending(ctx, chatId);
    return false;
}
