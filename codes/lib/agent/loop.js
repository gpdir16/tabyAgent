import { loadAgentConfig } from "../config-loader.js";
import { createLlmClient } from "../llm/client.js";
import { assistantMessageToPlain } from "../llm/messages.js";
import { executeTool, getAllToolDefinitions, toolResultContent } from "./tool-registry.js";
import { extractTurnMessages } from "./chat-history.js";
import { ensureWithinContextLimit } from "./summarize.js";
import { countMessagesTokens } from "./context.js";

function parseToolArgs(raw) {
    try {
        return JSON.parse(raw || "{}");
    } catch {
        return {};
    }
}

function buildStats(llm, messages, contextBaseLength, toolCallCount, modelCallCount) {
    const model = llm.provider.model;
    const contextWindow = llm.modelMeta?.contextWindow ?? 128000;
    const loadedContext = countMessagesTokens(messages.slice(0, contextBaseLength), model);
    const peakContext = countMessagesTokens(messages, model);
    return {
        toolCallCount,
        modelCallCount,
        tokensUsed: Math.max(loadedContext, peakContext),
        contextWindow,
    };
}

function buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCount, extra = {}) {
    return {
        ...extra,
        stats: buildStats(llm, messages, contextBaseLength, toolCallCount, modelCallCount),
        turnMessages: extractTurnMessages(messages, contextBaseLength),
    };
}

function toolSignature(name, args) {
    return `${name}:${JSON.stringify(args)}`;
}

const FORCE_REPLY_HINT = "You have enough tool output. Stop calling tools. Reply to the user in plain text now using results you already have.";
const EMPTY_REPLY_HINT =
    "Your previous assistant reply was empty. Reply to the user in plain text now. Summarize what you accomplished and answer their request.";

async function completeTextReply(llm, messages, { onTextDelta, setStatus, maxRetries, modelCallCount }) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
            messages.push({ role: "user", content: EMPTY_REPLY_HINT });
        }

        setStatus("thinking");
        const streamDelta = onTextDelta
            ? (_delta, full) => {
                  setStatus("streaming");
                  onTextDelta(_delta, full);
              }
            : undefined;

        modelCallCount.value += 1;
        const response = await llm.complete({
            messages,
            tool_choice: "none",
            stream: Boolean(onTextDelta),
            onTextDelta: streamDelta,
        });

        const raw = response.choices?.[0]?.message;
        if (!raw) continue;

        const msg = assistantMessageToPlain(raw);
        if (msg.content?.trim()) {
            messages.push(msg);
            return { text: msg.content, usage: response.usage };
        }
    }

    return null;
}

export async function runAgent(userMessage, { chatId, bot, onTextDelta, onStatusPhase, visionAttachment = null } = {}) {
    const llm = await createLlmClient();
    const agentConfig = loadAgentConfig();
    const setStatus = (phase, detail = null) => onStatusPhase?.(phase, detail);
    const maxRounds = agentConfig.maxToolRoundsPerTurn ?? agentConfig.maxToolRounds ?? 16;
    const maxToolCalls = agentConfig.maxToolCallsPerTurn ?? 20;
    const maxSameToolRepeat = agentConfig.maxSameToolRepeat ?? 2;
    const maxEmptyReplyRetries = agentConfig.maxEmptyReplyRetries ?? 8;
    const modelCallCountRef = { value: 0 };

    setStatus("generating");
    let messages = await ensureWithinContextLimit(llm, userMessage, llm.modelMeta, {
        chatId,
        onStatusPhase: setStatus,
        visionAttachment,
    });
    const tools = getAllToolDefinitions();
    const contextBaseLength = messages.length;

    let toolCallCount = 0;
    const toolSigCounts = new Map();
    const fileSnapshots = new Map();
    let forceReplyNext = false;

    for (let round = 0; round < maxRounds; round++) {
        const toolsEnabled = !forceReplyNext;
        const useStream = Boolean(onTextDelta) && !toolsEnabled;

        setStatus("thinking");

        const streamDelta =
            useStream && onTextDelta
                ? (_delta, full) => {
                      setStatus("streaming");
                      onTextDelta(_delta, full);
                  }
                : undefined;

        modelCallCountRef.value += 1;
        const response = await llm.complete({
            messages,
            tools: toolsEnabled ? tools : undefined,
            tool_choice: toolsEnabled ? "auto" : "none",
            stream: useStream,
            onTextDelta: streamDelta,
        });

        forceReplyNext = false;

        const raw = response.choices?.[0]?.message;
        if (!raw) throw new Error("Empty LLM response");

        const choice = assistantMessageToPlain(raw);
        const toolCalls = choice.tool_calls;
        if (!toolCalls?.length) {
            if (choice.content?.trim()) {
                messages.push(choice);
                return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                    text: choice.content,
                    usage: response.usage,
                });
            }

            const recovered = await completeTextReply(llm, messages, {
                onTextDelta,
                setStatus,
                maxRetries: maxEmptyReplyRetries,
                modelCallCount: modelCallCountRef,
            });
            if (recovered) {
                return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                    text: recovered.text,
                    usage: recovered.usage,
                });
            }

            return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                text: null,
                error: "empty_reply_exhausted",
            });
        }

        messages.push(choice);

        if (toolCallCount >= maxToolCalls) {
            messages.push({ role: "user", content: FORCE_REPLY_HINT });
            forceReplyNext = true;
            continue;
        }

        for (const tc of toolCalls) {
            if (toolCallCount >= maxToolCalls) break;

            setStatus("tools", tc.function.name);

            const args = parseToolArgs(tc.function.arguments);
            const sig = toolSignature(tc.function.name, args);
            const seen = (toolSigCounts.get(sig) || 0) + 1;
            toolSigCounts.set(sig, seen);
            toolCallCount += 1;

            if (seen > maxSameToolRepeat) {
                messages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: toolResultContent({
                        error: "Duplicate tool call skipped. Use the previous result and answer the user without calling this again.",
                    }),
                });
                forceReplyNext = true;
                continue;
            }

            const result = await executeTool(tc.function.name, args, {
                chatId,
                bot,
                messages,
                model: llm.provider.model,
                modelMeta: llm.modelMeta,
                fileSnapshots,
            });
            messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: toolResultContent(result),
            });
        }

        if (forceReplyNext || toolCallCount >= maxToolCalls) {
            messages.push({ role: "user", content: FORCE_REPLY_HINT });
            forceReplyNext = true;
        }
    }

    messages.push({ role: "user", content: FORCE_REPLY_HINT });

    const recovered = await completeTextReply(llm, messages, {
        onTextDelta,
        setStatus,
        maxRetries: maxEmptyReplyRetries,
        modelCallCount: modelCallCountRef,
    });
    if (recovered) {
        return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
            text: recovered.text,
            usage: recovered.usage,
        });
    }

    return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
        text: null,
        error: "tool_rounds_exceeded",
    });
}
