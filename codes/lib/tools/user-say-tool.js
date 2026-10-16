// user_say 도구: 작업 중 사용자에게 보여 줄 메시지 한 건을 명시적으로 게시한다.
import { sendRichMessageSafe } from "../telegram-api.js";
import { telegramThreadOpts } from "../agent-route.js";

const USER_SAY_DESCRIPTION = [
    "Deliver one chat message to the user mid-task, without ending your turn.",
    "Text written next to tool calls is internal and never reaches the user. This tool is the ONLY way to speak mid-task.",
    "Good reasons: a warning before an irreversible action (what will change), a blocker only the user can resolve (for questions that need an answer, use user_ask), a finding that cannot wait for the final reply, or a brief progress note at meaningful milestones during long multi-step work.",
    "Keep it sparse. Skip mechanical step narration ('clicked', 'retrying', 'page loaded') and do not post one per tool call.",
].join(" ");

export const userSayToolDefinitions = [
    {
        type: "function",
        function: {
            name: "user_say",
            description: USER_SAY_DESCRIPTION,
            parameters: {
                type: "object",
                properties: {
                    text: { type: "string", description: "The message to deliver to the user (Markdown allowed)" },
                },
                required: ["text"],
            },
        },
    },
];

export async function executeUserSayTool(args, ctx) {
    const text = String(args?.text ?? "").trim();
    if (!text) return { error: "text is required" };
    if (!ctx?.bot || !ctx?.chatId) return { error: "No active Telegram chat. user_say only works during a user message turn" };

    // 텔레그램 채팅에 바로 메시지로 보낸다. 기록에는 세션 메시지의
    // user_say 호출이 남아 지난 세션 검색·요약에서도 같은 텍스트가 보인다.
    const sent = await sendRichMessageSafe(ctx.bot, ctx.chatId, text, telegramThreadOpts(ctx.threadId));
    if (!sent.ok && !sent.messageIds.length) return { error: "Failed to deliver the message to Telegram." };
    return { ok: true, delivered: true };
}
