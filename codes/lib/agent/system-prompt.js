/**
 * Renders codes/lib/prompts/system.txt by replacing {{PLACEHOLDER}} tokens.
 *
 * Placeholders:
 *   {{LOCAL_DATETIME}} — current local time (container TZ)
 *   {{UTC_DATETIME}}   — current UTC time
 *   {{ISO_UTC}}        — ISO 8601 UTC timestamp
 *   {{TIMEZONE}}       — active time zone name
 *   {{MEMORY}}         — memory.md contents (may be truncated)
 */

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
