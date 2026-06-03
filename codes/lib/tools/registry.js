import { memoryToolDefinitions, executeMemoryTool } from "./memory.js";
import { configToolDefinitions, executeConfigTool } from "./config-tool.js";
import { skillsToolDefinitions, executeSkillsTool } from "./skills.js";
import { terminalToolDefinitions, executeTerminalTool } from "./terminal.js";
import { cronToolDefinitions, executeCronTool } from "./cron-tool.js";
import { sendFileToolDefinitions, executeSendFileTool } from "./send-file-tool.js";
import { getMcpToolDefinitions, executeMcpTool, connectMcpServers, disconnectMcpServers } from "./mcp-bridge.js";
import { stopCronScheduler } from "../cron/scheduler.js";
import { sanitizeTextForLlm } from "../llm/sanitize-messages.js";

export async function initTools() {
    await connectMcpServers();
}

export async function shutdownTools() {
    stopCronScheduler();
    await disconnectMcpServers();
}

export function getAllToolDefinitions() {
    return [
        ...memoryToolDefinitions,
        ...configToolDefinitions,
        ...skillsToolDefinitions,
        ...cronToolDefinitions,
        ...terminalToolDefinitions,
        ...sendFileToolDefinitions,
        ...getMcpToolDefinitions(),
    ];
}

export async function executeTool(name, args, ctx = {}) {
    if (name.startsWith("memory_")) return executeMemoryTool(name, args);
    if (name === "config_set") return executeConfigTool(name, args);
    if (name.startsWith("skills_")) return executeSkillsTool(name, args);
    if (name.startsWith("cron_")) return executeCronTool(name, args);
    if (name === "terminal_run") return executeTerminalTool(name, args);
    if (name === "telegram_send_file") return executeSendFileTool(name, args, ctx);
    if (name === "mcp_reload" || name.startsWith("mcp__")) return executeMcpTool(name, args);
    return { error: `Unknown tool: ${name}` };
}

export function toolResultContent(result) {
    return sanitizeTextForLlm(JSON.stringify(result));
}
