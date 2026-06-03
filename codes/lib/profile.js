import fs from "node:fs";
import { readMemoryFile, appendMemorySection } from "./tools/memory.js";
import { USER_DIR } from "./paths.js";
import path from "node:path";

const MEMORY_PATH = path.join(USER_DIR, "memory.md");

/** Single-line marker in memory.md. Onboarding is incomplete while this line exists; remove it when done. */
export const PROFILE_ONBOARDING_LINE = "<!-- tabyagent:profile-onboarding -->";

const PROFILE_SECTION_HEADING = "## User profile";
const PROFILE_SECTION_RE = /^## User profile\s*$/m;

function hasOnboardingLine(memory) {
    return memory.split("\n").some((line) => line.trim() === PROFILE_ONBOARDING_LINE);
}

function hasProfileSection(memory) {
    return PROFILE_SECTION_RE.test(memory);
}

function stripOnboardingLine(memory) {
    const lines = memory.split("\n").filter((line) => line.trim() !== PROFILE_ONBOARDING_LINE);
    return `${lines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd()}\n`;
}

function formatProfileSection({ name, ageRange, occupation, tone, notes }) {
    const lines = [
        PROFILE_SECTION_HEADING,
        "",
        `- **Name:** ${name?.trim() || "(not set)"}`,
        `- **Age range:** ${ageRange?.trim() || "(not set)"}`,
        `- **Occupation:** ${occupation?.trim() || "(not set)"}`,
        `- **Preferred tone:** ${tone?.trim() || "(not set)"}`,
    ];
    if (notes?.trim()) lines.push(`- **Notes:** ${notes.trim()}`);
    return lines.join("\n");
}

const LEGACY_PROFILE_PATH = path.join(USER_DIR, "profile.json");

export function migrateLegacyProfileJson() {
    if (!fs.existsSync(LEGACY_PROFILE_PATH)) return;
    try {
        const legacy = JSON.parse(fs.readFileSync(LEGACY_PROFILE_PATH, "utf8"));
        if (legacy.completed === true) {
            completeProfile(legacy);
        }
    } catch {
        /* ignore corrupt legacy file */
    }
    try {
        fs.unlinkSync(LEGACY_PROFILE_PATH);
    } catch {
        /* ignore */
    }
}

/** Onboarding complete when the marker line is gone from memory.md. */
export function isProfileComplete() {
    return !hasOnboardingLine(readMemoryFile());
}

export function ensureOnboardingMarker() {
    const memory = readMemoryFile();
    if (hasOnboardingLine(memory) || hasProfileSection(memory)) return;
    const block = memory.trimEnd() ? `\n${PROFILE_ONBOARDING_LINE}\n` : `# Memory\n\n${PROFILE_ONBOARDING_LINE}\n`;
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(MEMORY_PATH, `${memory.trimEnd()}${block}`, "utf8");
}

/** Save profile to memory.md and remove the onboarding marker line. */
export function completeProfile(data) {
    const section = formatProfileSection(data);
    let memory = stripOnboardingLine(readMemoryFile());

    if (!hasProfileSection(memory)) {
        memory = `${memory.trimEnd()}\n\n${section}\n`;
    } else {
        const match = memory.match(PROFILE_SECTION_RE);
        const startIdx = match?.index ?? memory.indexOf(PROFILE_SECTION_HEADING);
        let endIdx = memory.length;
        const after = memory.slice(startIdx + PROFILE_SECTION_HEADING.length);
        const nextSection = after.search(/\n## /);
        if (nextSection >= 0) {
            endIdx = startIdx + PROFILE_SECTION_HEADING.length + nextSection;
        }
        memory = `${memory.slice(0, startIdx).trimEnd()}\n\n${section}\n${memory.slice(endIdx).replace(/^\n+/, "")}`;
    }

    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(MEMORY_PATH, memory.endsWith("\n") ? memory : `${memory}\n`, "utf8");
    return { ok: true, section, onboardingLineRemoved: true };
}

export function getProfileContextBlock(lang = "en") {
    if (isProfileComplete()) return "";

    const markerHint = `memory.md에 \`${PROFILE_ONBOARDING_LINE}\` 한 줄이 있으면 온보딩 미완료입니다. \`profile_complete\` 호출 시 프로필을 저장하고 **이 줄을 반드시 삭제**하세요.`;

    if (lang === "ko") {
        return `## Profile onboarding (required)
아직 첫 인사가 끝나지 않았습니다. 다른 작업보다 먼저, 자연스럽게 1~2턴 안에 다음을 물어보세요: 이름(불리고 싶은 호칭), 나이대, 직업/역할, 선호 말투(존댓말/반말/톤).
충분히 알게 되면 \`profile_complete\`로 memory.md에 저장하세요. ${markerHint} 비밀·정확한 생년월일은 요구하지 마세요.`;
    }
    if (lang === "ja") {
        return `## Profile onboarding (required)
初回プロフィールが未完了です。他の作業より先に、1〜2ターンで自然に聞いてください：名前、年代、職業、好みの話し方。
十分なら \`profile_complete\` で memory.md に保存し、マーカー行を削除。`;
    }
    return `## Profile onboarding (required)
First-time setup is incomplete. Before other tasks, in 1–2 natural turns ask for: name, age range, occupation/role, preferred tone.
When you have enough, call \`profile_complete\` (saves profile and **deletes** the line \`${PROFILE_ONBOARDING_LINE}\` in memory.md). Do not demand secrets or exact birthdates.`;
}
