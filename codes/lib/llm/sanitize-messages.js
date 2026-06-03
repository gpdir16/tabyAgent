/**
 * Providers (OpenRouter, Moonshot/Kimi, OpenAI tiktoken) reject literal special-token
 * strings inside chat message text — e.g. files containing "<|endoftext|>".
 * Escape them so they encode as normal text while staying readable.
 */

/** Tiktoken / GPT / Kimi style: <|name|> */
const ANGLE_SPECIAL_TOKEN = /<\|[^|\n]{1,128}\|>/g;

/** Llama chat template markers */
const LLAMA_CHAT_MARKERS = /\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/g;

export function sanitizeTextForLlm(text) {
    if (typeof text !== "string" || text.length === 0) return text;

    let out = text.replace(ANGLE_SPECIAL_TOKEN, (match) => {
        const inner = match.slice(2, -2);
        return `⟨${inner}⟩`;
    });

    out = out.replace(LLAMA_CHAT_MARKERS, (m) => `[${m}]`);
    return out;
}

export function sanitizeMessagesForApi(messages) {
    if (!Array.isArray(messages)) return messages;

    return messages.map((m) => {
        const out = { ...m };

        if (typeof out.content === "string") {
            out.content = sanitizeTextForLlm(out.content);
        } else if (Array.isArray(out.content)) {
            out.content = out.content.map((part) => {
                if (part?.type === "text" && typeof part.text === "string") {
                    return { ...part, text: sanitizeTextForLlm(part.text) };
                }
                return part;
            });
        }

        if (out.tool_calls?.length) {
            out.tool_calls = out.tool_calls.map((tc) => ({
                ...tc,
                function: tc.function
                    ? {
                          ...tc.function,
                          arguments: typeof tc.function.arguments === "string" ? sanitizeTextForLlm(tc.function.arguments) : tc.function.arguments,
                      }
                    : tc.function,
            }));
        }

        return out;
    });
}
