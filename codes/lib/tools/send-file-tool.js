import path from "node:path";
import { sendTelegramFile } from "../telegram-send.js";
import { USER_DIR } from "../paths.js";

export const sendFileToolDefinitions = [
    {
        type: "function",
        function: {
            name: "telegram_send_file",
            description:
                "Send a file from disk to the user in this Telegram chat (image → photo, else document). Path must be under /app/user or /tmp (e.g. screenshot, export, download).",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Absolute or relative path to the file" },
                    caption: { type: "string", description: "Optional short caption (max 1024 chars)" },
                },
                required: ["path"],
            },
        },
    },
];

export async function executeSendFileTool(_name, args, ctx) {
    const raw = args?.path?.trim();
    if (!raw) return { error: "path is required" };
    if (!ctx?.bot || !ctx?.chatId) {
        return { error: "No active Telegram chat — file send only works during a user message turn" };
    }
    const filePath = path.isAbsolute(raw) ? raw : path.join(USER_DIR, raw);
    return sendTelegramFile(ctx.bot, ctx.chatId, filePath, { caption: args?.caption });
}
