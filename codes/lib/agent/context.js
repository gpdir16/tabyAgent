import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
import { sanitizeTextForLlm } from "../llm/sanitize-messages.js";
import { CODES_DIR } from "../paths.js";
import { readMemoryFile } from "../memory-file.js";
import { loadAgentConfig } from "../config-loader.js";
import { loadUserConfig } from "../config-loader.js";
import { buildUserMessageContent, estimateContentTokens } from "../llm/vision.js";
import { formatSkillsListForPrompt } from "../skills-catalog.js";
import { buildDateTimePromptVars, renderSystemPrompt } from "./system-prompt.js";
import { cloneStoredMessage, turnToMessages } from "./chat-history.js";

const SYSTEM_PATH = path.join(CODES_DIR, "lib", "prompts", "system.txt");

let encoding;
function getTokenizer(model) {
    try {
        if (!encoding) encoding = getEncoding("o200k_base");
        return encoding;
    } catch {
        return null;
    }
}

export function countTokens(text, model = "gpt-4o-mini") {
    const enc = getTokenizer(model);
    const safe = sanitizeTextForLlm(typeof text === "string" ? text : JSON.stringify(text));
    if (enc) {
        try {
            return enc.encode(safe, undefined, []).length;
        } catch {
            return Math.ceil(safe.length / 4);
        }
    }
    return Math.ceil(safe.length / 4);
}

export function countMessagesTokens(messages, model) {
    let total = 0;
    for (const m of messages) {
        if (Array.isArray(m.content)) {
            total += estimateContentTokens(m.content);
        } else {
            total += countTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content), model);
        }
        if (m.tool_calls) total += countTokens(JSON.stringify(m.tool_calls), model);
    }
    return total;
}

function loadSystemPromptTemplate() {
    return fs.readFileSync(SYSTEM_PATH, "utf8");
}

function loadMemoryForPrompt({ truncateMemory = false, maxMemoryChars = 120000 } = {}) {
    let memory = readMemoryFile();
    if (truncateMemory && memory.length > maxMemoryChars) {
        memory = `${memory.slice(0, maxMemoryChars)}\n\n...[memory truncated]...`;
    }
    return memory;
}

/** Assemble final system message from system.txt placeholders + runtime values. */
export function buildSystemMessageContent(lang, { truncateMemory = false, maxMemoryChars = 120000 } = {}) {
    const template = loadSystemPromptTemplate();
    return renderSystemPrompt(template, {
        ...buildDateTimePromptVars(lang),
        SKILLS_LIST: formatSkillsListForPrompt(),
        MEMORY: loadMemoryForPrompt({ truncateMemory, maxMemoryChars }),
    });
}

export function buildInitialMessages(
    userMessage,
    { truncateMemory = false, maxMemoryChars = 120000, history = [], compressedSummary = null, visionAttachment = null, modelMeta = null } = {},
) {
    const lang = loadUserConfig().language || "en";
    const systemContent = buildSystemMessageContent(lang, { truncateMemory, maxMemoryChars });

    const messages = [{ role: "system", content: systemContent }];

    if (compressedSummary?.trim()) {
        messages.push({
            role: "user",
            content: `## Earlier conversation (compressed)\n\n${compressedSummary.trim()}`,
        });
    }

    for (const turn of history) {
        for (const message of turnToMessages(turn)) {
            messages.push(cloneStoredMessage(message));
        }
    }
    const userContent = buildUserMessageContent(userMessage, {
        visionEnabled: modelMeta?.supportsVision === true,
        attachment: visionAttachment,
    });
    messages.push({ role: "user", content: userContent });
    return messages;
}

export function getContextWindow(modelMeta) {
    return modelMeta?.contextWindow || 128000;
}

export function getCompressTriggerTokens(modelMeta) {
    const agent = loadAgentConfig();
    const pct = agent.contextCompressTriggerPercent ?? 75;
    return Math.floor((getContextWindow(modelMeta) * pct) / 100);
}

export function getKeepRecentTokenBudget(modelMeta) {
    const agent = loadAgentConfig();
    const pct = agent.contextKeepRecentPercent ?? 20;
    return Math.floor((getContextWindow(modelMeta) * pct) / 100);
}

/** Hard ceiling after compression (safety margin below full window). */
export function getContextLimit(modelMeta) {
    const agent = loadAgentConfig();
    const pct = agent.contextThresholdPercent ?? 90;
    return Math.floor((getContextWindow(modelMeta) * pct) / 100);
}
