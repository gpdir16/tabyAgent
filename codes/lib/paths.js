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
