import { loadUserConfig } from "./config-loader.js";
import {
    getThinkingLevelForUser,
    normalizeThinkingLevel as normalizeThinkingForProvider,
    thinkingLevelLabel,
    getCachedProviderThinkingMeta,
    getProviderThinkingMeta,
} from "./thinking-levels.js";

export {
    getThinkingLevelForUser as getThinkingLevel,
    normalizeThinkingForProvider as normalizeThinkingLevel,
    thinkingLevelLabel,
    getProviderThinkingMeta,
    getCachedProviderThinkingMeta,
};

export function isReplyFooterEnabled(config = loadUserConfig()) {
    if (config.showReplyFooter === false) return false;
    return true;
}

// null = follow agent.json updateCheck.enabled
export function getUserUpdateCheckEnabled(config = loadUserConfig()) {
    if (config.updateCheckEnabled === false) return false;
    if (config.updateCheckEnabled === true) return true;
    return null;
}

export function providerKeyFromId(providerId) {
    if (providerId === "openrouter") return "openrouter";
    if (providerId === "synthetic") return "synthetic";
    return "openai";
}

export function seedWizardDataFromConfig(config = loadUserConfig()) {
    const providerId = config.provider?.id || "default";
    return {
        language: config.language || "en",
        providerId,
        providerKey: providerKeyFromId(providerId),
        baseURL: config.provider?.baseURL || "",
        apiKey: config.provider?.apiKey || "",
        model: config.provider?.model || "",
        thinkingLevel: getThinkingLevelForUser(config),
        showReplyFooter: isReplyFooterEnabled(config),
        updateCheckEnabled: config.updateCheckEnabled !== false,
    };
}
