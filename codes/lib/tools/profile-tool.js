import { completeProfile } from "../profile.js";

export const profileToolDefinitions = [
    {
        type: "function",
        function: {
            name: "profile_complete",
            description: "Save first-time user profile into memory.md and remove the onboarding marker line <!-- tabyagent:profile-onboarding -->.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "What to call the user" },
                    ageRange: { type: "string", description: "e.g. 20s, 30s, 40+" },
                    occupation: { type: "string", description: "Job or role" },
                    tone: { type: "string", description: "Preferred speaking style" },
                    notes: { type: "string", description: "Optional extra preferences" },
                },
                required: ["name", "ageRange", "occupation", "tone"],
            },
        },
    },
];

export async function executeProfileTool(name, args) {
    if (name !== "profile_complete") return { error: `Unknown profile tool: ${name}` };

    const result = completeProfile({
        name: args?.name,
        ageRange: args?.ageRange,
        occupation: args?.occupation,
        tone: args?.tone,
        notes: args?.notes || "",
    });
    return { ok: true, ...result };
}
