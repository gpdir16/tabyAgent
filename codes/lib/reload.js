import { reloadMcpServers } from "./mcp/servers.js";
import { mcpConfigPath, skillsDirPath } from "./path-labels.js";

export function formatReloadReport(report, lang = "en") {
    const connected = report?.connected || [];
    const failed = report?.failed || [];

    const lines = [];
    if (lang === "ko") {
        lines.push("**MCP 다시 불러옴**");
        if (!connected.length && !failed.length) {
            lines.push(`등록된 MCP 서버가 없습니다 (\`${mcpConfigPath()}\`).`);
        }
        for (const s of connected) {
            lines.push(`- ✅ \`${s.name}\` — 도구 ${s.tools}개`);
        }
        for (const s of failed) {
            lines.push(`- ❌ \`${s.name}\` — ${s.error}`);
        }
        lines.push("");
        lines.push(`스킬(\`${skillsDirPath()}\`)은 다음 메시지부터 바로 반영됩니다.`);
    } else if (lang === "ja") {
        lines.push("**MCP を再読み込みしました**");
        if (!connected.length && !failed.length) {
            lines.push(`MCP サーバーは未登録です (\`${mcpConfigPath()}\`)。`);
        }
        for (const s of connected) {
            lines.push(`- ✅ \`${s.name}\` — ツール ${s.tools}件`);
        }
        for (const s of failed) {
            lines.push(`- ❌ \`${s.name}\` — ${s.error}`);
        }
        lines.push("");
        lines.push(`スキル (\`${skillsDirPath()}\`) は次のメッセージから反映されます。`);
    } else {
        lines.push("**MCP reloaded**");
        if (!connected.length && !failed.length) {
            lines.push(`No MCP servers in \`${mcpConfigPath()}\`.`);
        }
        for (const s of connected) {
            lines.push(`- ✅ \`${s.name}\` — ${s.tools} tool(s)`);
        }
        for (const s of failed) {
            lines.push(`- ❌ \`${s.name}\` — ${s.error}`);
        }
        lines.push("");
        lines.push(`Skills under \`${skillsDirPath()}\` apply on the next message (no reload needed).`);
    }

    return lines.join("\n");
}

export async function runReload() {
    const report = await reloadMcpServers();
    return report;
}
