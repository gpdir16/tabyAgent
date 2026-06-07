import { exec } from "node:child_process";
import path from "node:path";
import { loadAgentConfig } from "../config-loader.js";
import { USER_DIR, getDefaultWorkDir } from "../paths.js";

function resolveCwd(cwd) {
    if (!cwd?.trim()) return getDefaultWorkDir();
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
                "Run a shell command inside Docker. Default cwd is /app/user. Pass cwd: /workspace (or another path) only when the task must run in the user's host-mounted folder.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "Shell command to run" },
                    cwd: {
                        type: "string",
                        description: "Working directory (default /app/user; use /workspace only for host-mounted project work)",
                    },
                },
                required: ["command"],
            },
        },
    },
];

export async function executeTerminalTool(name, args, { signal } = {}) {
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

    if (signal?.aborted) {
        return { ok: false, cwd, aborted: true, exitCode: null, stdout: "", stderr: "Stopped by user." };
    }

    return new Promise((resolve) => {
        let stoppedByUser = false;
        const child = exec(
            command,
            {
                cwd,
                timeout: timeoutMs,
                maxBuffer: maxChars * 2,
                shell: "/bin/sh",
                env: { ...process.env, HOME: USER_DIR },
            },
            (err, stdout, stderr) => {
                signal?.removeEventListener("abort", onAbort);
                const out = truncate(stdout || "", maxChars);
                const errOut = truncate(stderr || "", maxChars);
                const exitCode = err && typeof err.code === "number" ? err.code : 0;
                if (stoppedByUser) {
                    resolve({
                        ok: false,
                        cwd,
                        aborted: true,
                        exitCode: exitCode || child.exitCode || 1,
                        stdout: out,
                        stderr: errOut || "Stopped by user.",
                    });
                    return;
                }
                resolve({
                    ok: exitCode === 0,
                    cwd,
                    exitCode,
                    stdout: out,
                    stderr: errOut,
                });
            },
        );

        const onAbort = () => {
            stoppedByUser = true;
            child.kill("SIGTERM");
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("error", (err) => {
            signal?.removeEventListener("abort", onAbort);
            resolve({
                ok: false,
                cwd,
                exitCode: err.code ?? 1,
                stdout: "",
                stderr: truncate(err.message || "", maxChars),
            });
        });
    });
}
