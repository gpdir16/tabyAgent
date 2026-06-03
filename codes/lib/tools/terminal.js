import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { loadAgentConfig } from "../config-loader.js";
import { USER_DIR } from "../paths.js";

const execAsync = promisify(exec);

function resolveCwd(cwd) {
    if (!cwd?.trim()) return USER_DIR;
    return path.resolve(cwd.trim());
}

function truncate(text, maxChars) {
    if (!text || text.length <= maxChars) return text || "";
    return `${text.slice(0, maxChars)}\n…[truncated]`;
}

export const terminalToolDefinitions = [
    {
        type: "function",
        function: {
            name: "terminal_run",
            description:
                "Run a shell command in the Docker container. Default cwd is /app/user. You may use other paths and install tools (apk, npm, pip, etc.) when needed.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "Shell command to run" },
                    cwd: {
                        type: "string",
                        description: "Working directory (default /app/user; any path in the container is allowed)",
                    },
                },
                required: ["command"],
            },
        },
    },
];

export async function executeTerminalTool(name, args) {
    if (name !== "terminal_run") return { error: `Unknown terminal tool: ${name}` };

    const agent = loadAgentConfig();
    if (agent.terminalEnabled === false) {
        return { error: "Terminal is disabled in agent config" };
    }

    const command = args?.command?.trim();
    if (!command) return { error: "command is required" };

    const timeoutMs = agent.terminalTimeoutMs ?? 120_000;
    const maxChars = agent.terminalMaxOutputChars ?? 32_000;
    const cwd = resolveCwd(args?.cwd);

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd,
            timeout: timeoutMs,
            maxBuffer: maxChars * 2,
            shell: "/bin/sh",
            env: { ...process.env, HOME: USER_DIR },
        });
        return {
            ok: true,
            cwd,
            exitCode: 0,
            stdout: truncate(stdout, maxChars),
            stderr: truncate(stderr, maxChars),
        };
    } catch (err) {
        return {
            ok: false,
            cwd,
            exitCode: err.code ?? 1,
            stdout: truncate(err.stdout?.toString() || "", maxChars),
            stderr: truncate(err.stderr?.toString() || err.message || "", maxChars),
        };
    }
}
