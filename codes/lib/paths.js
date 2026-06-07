import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = process.env.APP_ROOT || path.resolve(__dirname, "../..");
export const USER_DIR = process.env.USER_DIR || path.join(APP_ROOT, "user");
export const DOWNLOAD_DIR = path.join(USER_DIR, "download");
export const CODES_DIR = process.env.CODES_DIR || path.join(APP_ROOT, "codes");
export const CONFIG_DIR = process.env.CONFIG_DIR || path.join(CODES_DIR, "config");
export const SKILLS_SYSTEM_DIR = path.join(CODES_DIR, "skills");
export const TEMPLATES_USER_DIR = path.join(CODES_DIR, "templates", "user");
const HOME_DIR = process.env.HOME || "/root";
export const AGENTS_SKILLS_LINK = path.join(HOME_DIR, ".agents", "skills");
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/workspace";

/** True when docker-compose bind-mounted a host folder at WORKSPACE_DIR. */
export function isWorkspaceEnabled() {
    if (process.env.WORKSPACE_ENABLED !== "1") return false;
    try {
        return fs.existsSync(WORKSPACE_DIR) && fs.statSync(WORKSPACE_DIR).isDirectory();
    } catch {
        return false;
    }
}

export function getReadRoots() {
    const roots = [USER_DIR, CODES_DIR, "/tmp"];
    if (isWorkspaceEnabled()) roots.push(WORKSPACE_DIR);
    return roots;
}

export function getWriteRoots() {
    const roots = [USER_DIR, "/tmp"];
    if (isWorkspaceEnabled()) roots.push(WORKSPACE_DIR);
    return roots;
}

export function isAllowedFilePath(resolved, { write = false } = {}) {
    const roots = write ? getWriteRoots() : getReadRoots();
    for (const root of roots) {
        const r = path.resolve(root);
        if (resolved === r || resolved.startsWith(`${r}${path.sep}`)) return true;
    }
    return false;
}

export function formatAllowedPaths({ write = false } = {}) {
    const parts = write ? [USER_DIR, "/tmp"] : [USER_DIR, CODES_DIR, "/tmp"];
    if (isWorkspaceEnabled()) parts.push(WORKSPACE_DIR);
    return parts.join(", ");
}

/** Default cwd for terminal_run and relative file paths — always agent home. */
export function getDefaultWorkDir() {
    return USER_DIR;
}
