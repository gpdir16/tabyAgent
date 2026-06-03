function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

const NL = "\n";

function formatInlineMarkdown(line) {
    let s = escapeHtml(line);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/__([^_]+)__/g, "<b>$1</b>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
}

function formatProseBlock(text) {
    return String(text ?? "")
        .trim()
        .split("\n")
        .map((line) => {
            const t = line.trim();
            if (!t) return "";
            if (/^#{1,6}\s+/.test(t)) {
                return `<b>${escapeHtml(t.replace(/^#{1,6}\s+/, ""))}</b>`;
            }
            if (/^[-*_]{3,}$/.test(t)) {
                return "────────";
            }
            return formatInlineMarkdown(t);
        })
        .filter(Boolean)
        .join(NL);
}

/** Markdown → Telegram HTML (parse_mode: HTML). */
export function markdownToTelegramHtml(input) {
    const text = String(input ?? "").replace(/\r\n/g, "\n");
    if (!text.trim()) return "…";
    return formatProseBlock(text) || "…";
}
