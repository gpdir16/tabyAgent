/**
 * Renders codes/lib/prompts/system.txt by replacing {{PLACEHOLDER}} tokens.
 *
 * Placeholders:
 *   {{LOCAL_DATETIME}} — current local time (container TZ)
 *   {{UTC_DATETIME}}   — current UTC time
 *   {{ISO_UTC}}        — ISO 8601 UTC timestamp
 *   {{TIMEZONE}}       — active time zone name
 *   {{SKILLS_LIST}}    — built-in + user skill names and summaries
 *   {{MEMORY}}         — memory.md contents (may be truncated)
 *   {{FILESYSTEM_BLOCK}} — /app/user vs /workspace map (always present)
 */

import { USER_DIR, WORKSPACE_DIR, isWorkspaceEnabled } from "../paths.js";

const PLACEHOLDER_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export function renderSystemPrompt(template, vars) {
    return template.replace(PLACEHOLDER_RE, (match, key) => {
        if (!Object.prototype.hasOwnProperty.call(vars, key)) {
            console.warn(`tabyAgent: unknown system prompt placeholder ${match}`);
            return match;
        }
        const value = vars[key];
        return value == null ? "" : String(value);
    });
}

function localeForLanguage(lang) {
    if (lang === "ko") return "ko-KR";
    if (lang === "ja") return "ja-JP";
    return "en-US";
}

/** Always-on explanation so the model does not confuse container paths with the user's PC. */
export function buildFilesystemPromptBlock() {
    const hostPath = typeof process.env.HOST_WORKSPACE === "string" ? process.env.HOST_WORKSPACE.trim() : "";
    const lines = [
        "### Filesystem map (container vs host — read before file/shell work)",
        "",
        "You run **inside a Docker container**. Container paths are **not** the same as the user's Windows/macOS/Linux paths unless listed below.",
        "",
        `| Path | Role |`,
        `|------|------|`,
        `| \`${USER_DIR}\` | **Main home (default).** Docker volume: \`config.json\`, \`memory.md\`, \`skills/\`, \`mcp.json\`, \`cron.json\`, \`download/\`, chat temp, and **most work**. Default \`terminal_run\` cwd. Relative \`file_*\` paths resolve here. Exists **inside the container** — not a path on the user's PC. |`,
        `| \`/app/codes\` | Shipped agent source and built-in skills (image; avoid editing). |`,
        `| \`/tmp\` | Ephemeral scratch inside the container. |`,
    ];

    if (isWorkspaceEnabled()) {
        const hostNote = hostPath ? ` Host path: \`${hostPath}\`.` : "";
        lines.push(
            `| \`${WORKSPACE_DIR}\` | **Optional host bind mount** — a folder on the user's PC, visible outside Docker.${hostNote} Use **only** when the task must read/write files the user edits on their machine (their repo, local project, synced documents). **Do not** use for bot config, memory, skills, or general work — keep that in \`${USER_DIR}\`. Paths: \`workspace/...\` or \`${WORKSPACE_DIR}/...\`. |`,
        );
        lines.push(
            "",
            "**Routing:**",
            `- **Default:** everything → \`${USER_DIR}\` (same as when no mount exists).`,
            `- **\`${WORKSPACE_DIR}\` only when:** user explicitly asks to work on their **local/PC/mounted** project or files that must appear on their computer.`,
            `- Bot settings, memory, skills, MCP, cron, uploads → always \`${USER_DIR}\`.`,
            `- Do **not** tell the user to open \`${USER_DIR}\` on their PC — container-only. For PC-visible files, use \`${WORKSPACE_DIR}\`.`,
        );
    } else {
        lines.push(
            "",
            `**No host folder is mounted** (no \`/workspace\`). All durable user files live under \`${USER_DIR}\` inside the container only — the user cannot see that path on their PC.`,
        );
    }

    return lines.join("\n");
}

/** @deprecated Use buildFilesystemPromptBlock */
export function buildWorkspacePromptBlock() {
    return buildFilesystemPromptBlock();
}

export function buildDateTimePromptVars(lang = "en") {
    const now = new Date();
    const timeZone = (typeof process.env.TZ === "string" && process.env.TZ.trim()) || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const locale = localeForLanguage(lang);
    const localFormatted = new Intl.DateTimeFormat(locale, {
        dateStyle: "full",
        timeStyle: "long",
        timeZone,
    }).format(now);
    const utcFormatted = new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "UTC",
    }).format(now);

    return {
        LOCAL_DATETIME: localFormatted,
        UTC_DATETIME: utcFormatted,
        ISO_UTC: now.toISOString(),
        TIMEZONE: timeZone,
    };
}
