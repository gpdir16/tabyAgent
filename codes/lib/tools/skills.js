import fs from "node:fs";
import path from "node:path";
import { SKILLS_SYSTEM_DIR, USER_DIR, AGENTS_SKILLS_LINK } from "../paths.js";

function listSkillDirs(root) {
    if (!fs.existsSync(root)) return [];
    return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
}

function readSkillSummary(skillPath) {
    const skillFile = path.join(skillPath, "SKILL.md");
    if (!fs.existsSync(skillFile)) return null;
    const text = fs.readFileSync(skillFile, "utf8");
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
        const desc = fm[1].match(/^description:\s*(.+)$/m);
        if (desc) {
            const summary = desc[1].trim().replace(/^["']|["']$/g, "");
            return { name: path.basename(skillPath), summary };
        }
    }
    const firstLine =
        text.split("\n").find((l) => {
            const t = l.trim();
            return t && !t.startsWith("---");
        }) || skillPath;
    return { name: path.basename(skillPath), summary: firstLine.replace(/^#\s*/, "").trim() };
}

function resolveSkillPath(name, source) {
    const roots = [];
    if (source === "system" || !source) roots.push({ root: SKILLS_SYSTEM_DIR, label: "system" });
    if (source === "user" || !source) {
        roots.push({ root: path.join(USER_DIR, "skills"), label: "user" });
        if (fs.existsSync(AGENTS_SKILLS_LINK)) {
            roots.push({ root: AGENTS_SKILLS_LINK, label: "user" });
        }
    }

    for (const { root, label } of roots) {
        const skillPath = path.join(root, name);
        const skillFile = path.join(skillPath, "SKILL.md");
        if (fs.existsSync(skillFile)) return { skillFile, source: label };
    }
    return null;
}

export const skillsToolDefinitions = [
    {
        type: "function",
        function: {
            name: "skills_list",
            description:
                "List built-in skills (/app/codes/skills) and user skills (/app/user/skills). Add or remove user skills under /app/user/skills.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function",
        function: {
            name: "skills_read",
            description:
                "Read SKILL.md by skill name. Built-in (codes) wins over user copy with the same name. Use after installing under /app/user/skills.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Skill directory name" },
                },
                required: ["name"],
            },
        },
    },
];

export async function executeSkillsTool(name, args) {
    if (name === "skills_list") {
        const skills = [];
        const seen = new Set();
        for (const root of [SKILLS_SYSTEM_DIR, path.join(USER_DIR, "skills"), AGENTS_SKILLS_LINK]) {
            for (const dirName of listSkillDirs(root)) {
                const key = `${root}:${dirName}`;
                if (seen.has(dirName)) continue;
                const summary = readSkillSummary(path.join(root, dirName));
                if (summary) {
                    seen.add(dirName);
                    skills.push({
                        name: summary.name,
                        summary: summary.summary,
                        source: root === SKILLS_SYSTEM_DIR ? "system" : "user",
                    });
                }
            }
        }
        return { skills };
    }

    if (name === "skills_read") {
        const skillName = args?.name?.trim();
        if (!skillName) return { error: "name is required" };
        const system = resolveSkillPath(skillName, "system");
        const resolved = system || resolveSkillPath(skillName, "user");
        if (!resolved) return { error: `Skill not found: ${skillName}` };
        const content = fs.readFileSync(resolved.skillFile, "utf8");
        return { name: skillName, source: resolved.source, content };
    }

    return { error: `Unknown skills tool: ${name}` };
}
