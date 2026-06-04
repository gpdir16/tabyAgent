import {
    buildInitialMessages,
    countMessagesTokens,
    countTokens,
    getCompressTriggerTokens,
    getContextLimit,
    getKeepRecentTokenBudget,
} from "./context.js";
import { loadChatHistory, turnToMessages } from "./chat-history.js";

const COMPRESS_SYSTEM = `You compress chat transcripts for context storage. Rules:
- Preserve facts, numbers, command outputs, decisions, errors, filenames, and what the user wanted.
- Same language as the source (Korean stays Korean).
- Dense markdown bullets or short paragraphs. No filler, no "summary:" prefix.
- Do not invent information that is not in the transcript.`;

function buildWithHistory(userMessage, history, opts = {}) {
    return buildInitialMessages(userMessage, { history, ...opts });
}

function tokenCount(messages, model) {
    return countMessagesTokens(messages, model);
}

function contentToText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (part?.type === "text") return part.text || "";
                if (part?.type === "image_url") return "[image]";
                return `[${part?.type || "part"}]`;
            })
            .join(" ");
    }
    return content == null ? "" : String(content);
}

function messageToTranscriptLine(message) {
    if (message.role === "user") return `User: ${contentToText(message.content)}`;
    if (message.role === "assistant") {
        const parts = [`Assistant: ${contentToText(message.content)}`];
        if (message.tool_calls?.length) {
            parts.push(`Tool calls: ${JSON.stringify(message.tool_calls)}`);
        }
        return parts.join("\n");
    }
    if (message.role === "tool") {
        return `Tool (${message.tool_call_id}): ${contentToText(message.content)}`;
    }
    return "";
}

function turnToTranscript(turn) {
    return turnToMessages(turn).map(messageToTranscriptLine).filter(Boolean).join("\n\n");
}

function turnTokens(turn, model) {
    return countMessagesTokens(turnToMessages(turn), model);
}

function itemTokens(item, model) {
    if (item.kind === "user") return countTokens(item.text, model);
    return turnTokens(item.turn, model);
}

/** Split into older (to compress) vs recent (verbatim). Recent ≈ last N% of context window in tokens. */
function splitHistoryForCompression(turns, userMessage, model, recentBudget) {
    const items = turns.map((turn) => ({ kind: "turn", turn }));
    items.push({ kind: "user", text: userMessage });

    const recentItems = [];
    let used = 0;
    let splitAt = 0;

    for (let i = items.length - 1; i >= 0; i--) {
        const tok = itemTokens(items[i], model);
        if (used + tok > recentBudget && recentItems.length > 0) {
            splitAt = i + 1;
            break;
        }
        used += tok;
        recentItems.unshift(items[i]);
        if (i === 0) splitAt = 0;
    }

    return {
        oldItems: items.slice(0, splitAt),
        recentItems,
    };
}

function oldItemsToTranscript(oldItems) {
    const lines = [];
    for (const item of oldItems) {
        if (item.kind === "user") {
            lines.push(`User: ${item.text}`);
        } else {
            lines.push(turnToTranscript(item.turn));
        }
    }
    return lines.join("\n\n");
}

function recentItemsToHistory(recentItems) {
    const history = [];
    for (const item of recentItems) {
        if (item.kind === "turn") {
            history.push(item.turn);
        }
    }
    return history;
}

function recentUserMessage(recentItems, fallback) {
    const last = recentItems[recentItems.length - 1];
    if (last?.kind === "user") return last.text;
    return fallback;
}

async function compressTranscript(llm, transcript) {
    const response = await llm.complete({
        messages: [
            { role: "system", content: COMPRESS_SYSTEM },
            {
                role: "user",
                content: `Compress this transcript:\n\n${transcript}`,
            },
        ],
        tool_choice: "none",
    });
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Compression model returned empty summary");
    return text;
}

async function applyIntelligentCompression(llm, userMessage, fullHistory, model, modelMeta, visionAttachment = null) {
    const recentBudget = getKeepRecentTokenBudget(modelMeta);
    const { oldItems, recentItems } = splitHistoryForCompression(fullHistory, userMessage, model, recentBudget);

    if (!oldItems.length) {
        return null;
    }

    const transcript = oldItemsToTranscript(oldItems);
    console.log(`tabyAgent: compressing context (${oldItems.length} older block(s), keeping ~${recentBudget} recent tokens verbatim)`);

    const summary = await compressTranscript(llm, transcript);
    const recentHistory = recentItemsToHistory(recentItems);
    const latestUser = recentUserMessage(recentItems, userMessage);

    return buildWithHistory(latestUser, recentHistory, {
        compressedSummary: summary,
        modelMeta,
        visionAttachment,
    });
}

export async function ensureWithinContextLimit(llm, userMessage, modelMeta, { chatId, onStatusPhase, visionAttachment = null } = {}) {
    const fullHistory = chatId ? loadChatHistory(chatId) : [];
    const model = llm.provider.model;
    const trigger = getCompressTriggerTokens(modelMeta);
    const hardLimit = getContextLimit(modelMeta);

    const buildOpts = { visionAttachment, modelMeta };
    let messages = buildWithHistory(userMessage, fullHistory, buildOpts);
    let tokens = tokenCount(messages, model);

    if (tokens <= trigger) {
        return messages;
    }

    messages = buildWithHistory(userMessage, fullHistory, {
        truncateMemory: true,
        maxMemoryChars: 60000,
        ...buildOpts,
    });
    tokens = tokenCount(messages, model);

    if (tokens <= trigger) {
        return messages;
    }

    try {
        onStatusPhase?.("compressing");
        const compressed = await applyIntelligentCompression(llm, userMessage, fullHistory, model, modelMeta, visionAttachment);
        if (compressed) {
            messages = compressed;
            tokens = tokenCount(messages, model);
        }
    } catch (err) {
        console.warn("tabyAgent: intelligent compression failed:", err.message || err);
    }

    if (tokens <= hardLimit) {
        return messages;
    }

    return buildWithHistory(userMessage, [], {
        truncateMemory: true,
        maxMemoryChars: 40000,
        ...buildOpts,
    });
}
