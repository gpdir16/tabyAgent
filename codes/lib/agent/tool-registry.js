import { fileToolDefinitions, executeFileRead, executeFilePatch } from "../tools/file.js";
import { configToolDefinitions, executeConfigTool } from "../tools/config-tool.js";
import { skillsToolDefinitions, executeSkillsTool } from "../tools/skills.js";
import { terminalToolDefinitions, executeTerminalTool } from "../tools/terminal.js";
import { cronToolDefinitions, executeCronTool } from "../tools/cron-tool.js";
import { sendFileToolDefinitions, executeSendFileTool } from "../tools/send-file-tool.js";
import { getMcpToolDefinitions, executeMcpTool } from "../tools/mcp.js";
import { connectMcpServers, disconnectMcpServers } from "../mcp/servers.js";
import { stopCronScheduler } from "../cron/scheduler.js";
import { stopUpdateScheduler } from "../update/scheduler.js";
import { sanitizeTextForLlm } from "../llm/sanitize-messages.js";

export async function initTools() {
    await connectMcpServers();
}

export async function shutdownTools() {
    stopCronScheduler();
    stopUpdateScheduler();
    await disconnectMcpServers();
}

export function getAllToolDefinitions() {
    return [
        ...fileToolDefinitions,
        ...configToolDefinitions,
        ...skillsToolDefinitions,
        ...cronToolDefinitions,
        ...terminalToolDefinitions,
        ...sendFileToolDefinitions,
        ...getMcpToolDefinitions(),
    ];
}

export async function executeTool(name, args, ctx = {}) {
    try {
        if (name === "file_read") return await executeFileRead(args, ctx);
        if (name === "file_patch") return await executeFilePatch(args, ctx);
        if (name === "config_set") return await executeConfigTool(name, args);
        if (name.startsWith("skills_")) return await executeSkillsTool(name, args);
        if (name.startsWith("cron_")) return await executeCronTool(name, args);
        if (name === "terminal_run") return await executeTerminalTool(name, args, ctx);
        if (name === "telegram_send_file") return await executeSendFileTool(name, args, ctx);
        if (name === "mcp_reload" || name.startsWith("mcp__")) return await executeMcpTool(name, args);
        return { error: `Unknown tool: ${name}` };
    } catch (err) {
        return { error: err?.message || String(err) };
    }
}

export function toolResultContent(result) {
    return sanitizeTextForLlm(JSON.stringify(result));
}
