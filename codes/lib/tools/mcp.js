import { getDynamicMcpToolDefinitions, invokeMcpTool, reloadMcpServers } from "../mcp/servers.js";
import { mcpReloadDescription } from "../path-labels.js";

const mcpReloadToolDefinition = [
    {
        type: "function",
        function: {
            name: "mcp_reload",
            description: mcpReloadDescription(),
            parameters: { type: "object", properties: {} },
        },
    },
];

export function getMcpToolDefinitions() {
    return [...mcpReloadToolDefinition, ...getDynamicMcpToolDefinitions()];
}

export async function executeMcpTool(name, args) {
    if (name === "mcp_reload") return reloadMcpServers();
    return invokeMcpTool(name, args);
}
