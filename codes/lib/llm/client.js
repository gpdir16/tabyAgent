import { getMergedProvider, loadUserConfig } from "../config-loader.js";
import { chatCompletions, createOpenAIClient } from "./openai-compatible.js";
import { ensureModelMeta } from "./model-meta.js";

export async function createLlmClient() {
    const userConfig = loadUserConfig();
    const provider = getMergedProvider(userConfig);

    if (!provider.apiKey) throw new Error("provider.apiKey is not set in config.json");
    if (!provider.model) throw new Error("provider.model is not set in config.json");

    if (provider.type !== "openai-compatible") {
        throw new Error(`Unsupported provider type: ${provider.type}`);
    }

    const modelMeta = await ensureModelMeta(provider);
    const client = createOpenAIClient({
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        extraHeaders: provider.extraHeaders,
    });

    return {
        provider,
        modelMeta,
        async complete({ messages, tools, tool_choice, stream, onTextDelta, signal }) {
            return chatCompletions({
                client,
                model: provider.model,
                messages,
                tools: tools?.length ? tools : undefined,
                tool_choice,
                stream,
                onTextDelta,
                signal,
            });
        },
    };
}
