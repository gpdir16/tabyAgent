import { loadUserConfig, saveUserConfig } from "../config-loader.js";

const ALLOWED_KEYS = new Set(["language"]);

export const configToolDefinitions = [
    {
        type: "function",
        function: {
            name: "config_set",
            description: "Update non-secret runtime config. Allowed: language (en, ko, ja).",
            parameters: {
                type: "object",
                properties: {
                    language: { type: "string", enum: ["en", "ko", "ja"] },
                },
            },
        },
    },
];

export async function executeConfigTool(name, args) {
    if (name !== "config_set") return { error: `Unknown config tool: ${name}` };

    const config = loadUserConfig();
    let updated = false;

    for (const key of Object.keys(args || {})) {
        if (!ALLOWED_KEYS.has(key)) {
            return { error: `Field not allowed via config_set: ${key}` };
        }
        if (key === "language") {
            const lang = args.language;
            if (!["en", "ko", "ja"].includes(lang)) {
                return { error: "language must be en, ko, or ja" };
            }
            config.language = lang;
            updated = true;
        }
    }

    if (!updated) return { error: "No allowed fields provided" };
    saveUserConfig(config);
    return { ok: true, language: config.language };
}
