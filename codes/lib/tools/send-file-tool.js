import path from "node:path";
import { sendTelegramFile } from "../telegram-send.js";
import { USER_DIR, WORKSPACE_DIR, isWorkspaceEnabled } from "../paths.js";

export const sendFileToolDefinitions = [
    {
        type: "function",
        function: {
            name: "telegram_send_file",
            description: "Send a file to Telegram. Default /app/user; use /workspace only when sending a file from the host-mounted folder.",
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
    let filePath;
    if (path.isAbsolute(raw)) {
        filePath = raw;
    } else if (isWorkspaceEnabled() && (raw === "workspace" || raw.startsWith(`workspace${path.sep}`))) {
        const rel = raw === "workspace" ? "" : raw.slice("workspace".length + 1);
        filePath = rel ? path.join(WORKSPACE_DIR, rel) : WORKSPACE_DIR;
    } else {
        filePath = path.join(USER_DIR, raw);
    }
    return sendTelegramFile(ctx.bot, ctx.chatId, filePath, { caption: args?.caption });
}
