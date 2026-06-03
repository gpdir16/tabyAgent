import fs from "node:fs";
import path from "node:path";
import { USER_DIR } from "../paths.js";

const MEMORY_PATH = path.join(USER_DIR, "memory.md");

function ensureMemoryFile() {
    if (!fs.existsSync(MEMORY_PATH)) {
        fs.mkdirSync(USER_DIR, { recursive: true });
        fs.writeFileSync(MEMORY_PATH, "# User Profile\n\n## Notes\n\n", "utf8");
    }
}

export const memoryToolDefinitions = [
    {
        type: "function",
        function: {
            name: "memory_read",
            description:
                "Search memory.md by keyword when the full file is not in context or you need a section. Usually unnecessary—memory.md is already injected in the system prompt each turn.",
            parameters: {
                type: "object",
                properties: {
                    keyword: { type: "string", description: "Optional keyword to read a section around" },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "memory_append",
            description:
                "Add a new dated block to memory.md for durable facts (preferences, projects, corrections). Use when the information is new—not to revise existing notes (use memory_replace instead).",
            parameters: {
                type: "object",
                properties: {
                    content: { type: "string", description: "Markdown content to append" },
                },
                required: ["content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "memory_replace",
            description:
                "Update memory.md by replacing exact oldText with newText. Preferred for corrections, refreshed facts, or consolidating duplicates.",
            parameters: {
                type: "object",
                properties: {
                    oldText: { type: "string" },
                    newText: { type: "string" },
                },
                required: ["oldText", "newText"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "memory_delete",
            description:
                "Remove obsolete or wrong content from memory.md (finished projects, outdated preferences, noise). Pass text that uniquely identifies the section to remove.",
            parameters: {
                type: "object",
                properties: {
                    text: { type: "string", description: "Text that identifies what to remove" },
                },
                required: ["text"],
            },
        },
    },
];

export async function executeMemoryTool(name, args) {
    ensureMemoryFile();
    const content = fs.readFileSync(MEMORY_PATH, "utf8");

    switch (name) {
        case "memory_read": {
            const keyword = args?.keyword?.trim();
            if (!keyword) return { content };
            const lines = content.split("\n");
            const lower = keyword.toLowerCase();
            let start = lines.findIndex((l) => l.toLowerCase().includes(lower));
            if (start < 0) return { content: "", note: "No match for keyword" };
            start = Math.max(0, start - 3);
            const excerpt = lines.slice(start, start + 40).join("\n");
            return { content: excerpt };
        }
        case "memory_append": {
            const block = args?.content;
            if (!block) return { error: "content is required" };
            const stamp = new Date().toISOString();
            const addition = `\n\n## ${stamp}\n\n${block}\n`;
            fs.appendFileSync(MEMORY_PATH, addition, "utf8");
            return { ok: true };
        }
        case "memory_replace": {
            const { oldText, newText } = args || {};
            if (!oldText) return { error: "oldText is required" };
            if (!content.includes(oldText)) return { error: "oldText not found in memory.md" };
            fs.writeFileSync(MEMORY_PATH, content.replace(oldText, newText ?? ""), "utf8");
            return { ok: true };
        }
        case "memory_delete": {
            const text = args?.text;
            if (!text) return { error: "text is required" };
            if (!content.includes(text)) return { error: "text not found in memory.md" };
            const parts = content.split(text);
            fs.writeFileSync(MEMORY_PATH, parts.join(""), "utf8");
            return { ok: true };
        }
        default:
            return { error: `Unknown memory tool: ${name}` };
    }
}

export function readMemoryFile() {
    ensureMemoryFile();
    return fs.readFileSync(MEMORY_PATH, "utf8");
}

/** Append a markdown block (no timestamp header). Used by profile onboarding. */
export function appendMemorySection(markdown) {
    ensureMemoryFile();
    const block = String(markdown || "").trim();
    if (!block) return;
    fs.appendFileSync(MEMORY_PATH, `\n\n${block}\n`, "utf8");
}
