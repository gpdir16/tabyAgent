import OpenAI from "openai";
import { sanitizeMessagesForApi } from "./sanitize-messages.js";

export function createOpenAIClient({ baseURL, apiKey, extraHeaders = {} }) {
    return new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders: extraHeaders,
    });
}

/** Chat Completions response shape used by the agent loop. */
function completionPayload(completion) {
    const choice = completion.choices?.[0];
    if (!choice) throw new Error("Empty LLM response");
    return {
        choices: [
            {
                message: choice.message,
                finish_reason: choice.finish_reason,
            },
        ],
        usage: completion.usage ?? null,
    };
}

/**
 * OpenAI Chat Completions API via the official SDK (native tools / tool_calls).
 * Tool rounds are always non-streaming; streaming is text-only final replies.
 */
export async function chatCompletions({ client, model, messages, tools, tool_choice, stream = false, onTextDelta }) {
    const includeTools = Boolean(tools?.length) && tool_choice !== "none";
    const params = { model, messages: sanitizeMessagesForApi(messages) };

    if (includeTools) {
        params.tools = tools;
        params.tool_choice = tool_choice ?? "auto";
    }

    const useStream = Boolean(stream && onTextDelta && !includeTools);

    if (useStream) {
        const streamResp = await client.chat.completions.create({
            ...params,
            stream: true,
            stream_options: { include_usage: true },
        });

        let content = "";
        let usage = null;
        for await (const chunk of streamResp) {
            if (chunk.usage) usage = chunk.usage;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (!delta) continue;
            content += delta;
            onTextDelta(delta, content);
        }

        return {
            choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
            usage,
        };
    }

    const completion = await client.chat.completions.create({
        ...params,
        stream: false,
    });
    return completionPayload(completion);
}
