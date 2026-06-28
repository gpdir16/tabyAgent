import { loadUserConfig, saveUserConfig } from "../config-loader.js";
import { getCachedProviderThinkingMeta, normalizeThinkingLevel } from "../user-settings.js";

const ALLOWED_KEYS = new Set(["language", "thinkingLevel", "showReplyFooter", "updateCheckEnabled"]);

export const configToolDefinitions = [
    {
        type: "function",
        function: {
            name: "config_set",
            description: "Update non-secret runtime config. language, thinkingLevel (provider /models), showReplyFooter, updateCheckEnabled.",
            parameters: {
                type: "object",
                properties: {
                    language: { type: "string", enum: ["en", "ko", "ja"] },
                    thinkingLevel: { type: "string", description: "Level from provider /models metadata" },
                    showReplyFooter: { type: "boolean" },
                    updateCheckEnabled: { type: "boolean" },
                },
            },
        },
    },
];

export async function executeConfigTool(name, args) {
    if (name !== "config_set") return { error: `Unknown config tool: ${name}` };

    const config = loadUserConfig();
    let updated = false;
    const a = args || {};

    for (const key of Object.keys(a)) {
        if (!ALLOWED_KEYS.has(key)) {
            return { error: `Field not allowed via config_set: ${key}` };
        }
    }

    if (a.language !== undefined) {
        if (!["en", "ko", "ja"].includes(a.language)) {
            return { error: "language must be en, ko, or ja" };
        }
        config.language = a.language;
        updated = true;
    }
    if (a.thinkingLevel !== undefined) {
        const meta = getCachedProviderThinkingMeta(config.provider?.id || "default", config.provider?.model || "");
        config.thinkingLevel = normalizeThinkingLevel(a.thinkingLevel, meta);
        updated = true;
    }
    if (a.showReplyFooter !== undefined) {
        config.showReplyFooter = Boolean(a.showReplyFooter);
        updated = true;
    }
    if (a.updateCheckEnabled !== undefined) {
        config.updateCheckEnabled = Boolean(a.updateCheckEnabled);
        updated = true;
    }

    if (!updated) return { error: "No allowed fields provided" };
    saveUserConfig(config);
    return {
        ok: true,
        language: config.language,
        thinkingLevel: config.thinkingLevel,
        showReplyFooter: config.showReplyFooter,
        updateCheckEnabled: config.updateCheckEnabled,
    };
}
