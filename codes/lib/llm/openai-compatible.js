import OpenAI from "openai";
import { sanitizeMessagesForApi } from "./sanitize-messages.js";

export function createOpenAIClient({ baseURL, apiKey, extraHeaders = {} }) {
    return new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders: extraHeaders,
    });
}

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

function isAbortError(err) {
    return err?.name === "AbortError" || err?.code === "ABORT_ERR";
}

export async function chatCompletions({ client, model, messages, tools, tool_choice, stream = false, onTextDelta, signal }) {
    const includeTools = Boolean(tools?.length) && tool_choice !== "none";
    const params = { model, messages: sanitizeMessagesForApi(messages) };

    if (includeTools) {
        params.tools = tools;
        params.tool_choice = tool_choice ?? "auto";
    }

    const useStream = Boolean(stream && onTextDelta && !includeTools);

    if (signal?.aborted) {
        const err = new Error("Stopped by user.");
        err.name = "AbortError";
        throw err;
    }

    const requestOptions = signal ? { signal } : undefined;

    if (useStream) {
        const streamResp = await client.chat.completions.create(
            {
                ...params,
                stream: true,
                stream_options: { include_usage: true },
            },
            requestOptions,
        );

        let content = "";
        let usage = null;
        try {
            for await (const chunk of streamResp) {
                if (signal?.aborted) {
                    const err = new Error("Stopped by user.");
                    err.name = "AbortError";
                    throw err;
                }
                if (chunk.usage) usage = chunk.usage;
                const delta = chunk.choices?.[0]?.delta?.content;
                if (!delta) continue;
                content += delta;
                onTextDelta(delta, content);
            }
        } catch (err) {
            if (signal?.aborted || isAbortError(err)) {
                const abortErr = new Error("Stopped by user.");
                abortErr.name = "AbortError";
                abortErr.partialText = content;
                throw abortErr;
            }
            throw err;
        }

        return {
            choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
            usage,
        };
    }

    try {
        const completion = await client.chat.completions.create(
            {
                ...params,
                stream: false,
            },
            requestOptions,
        );
        return completionPayload(completion);
    } catch (err) {
        if (signal?.aborted || isAbortError(err)) {
            const abortErr = new Error("Stopped by user.");
            abortErr.name = "AbortError";
            throw abortErr;
        }
        throw err;
    }
}
