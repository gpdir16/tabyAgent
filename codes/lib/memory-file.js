import fs from "node:fs";
import path from "node:path";
import { TEMPLATES_USER_DIR, USER_DIR } from "./paths.js";

const MEMORY_PATH = path.join(USER_DIR, "memory.md");
const MEMORY_TEMPLATE_PATH = path.join(TEMPLATES_USER_DIR, "memory.md");

function defaultMemoryContent() {
    if (fs.existsSync(MEMORY_TEMPLATE_PATH)) {
        return fs.readFileSync(MEMORY_TEMPLATE_PATH, "utf8");
    }
    return "# Memory\n\n";
}

function ensureMemoryFile() {
    if (!fs.existsSync(MEMORY_PATH)) {
        fs.mkdirSync(USER_DIR, { recursive: true });
        fs.writeFileSync(MEMORY_PATH, defaultMemoryContent(), "utf8");
    }
}

export function readMemoryFile() {
    ensureMemoryFile();
    return fs.readFileSync(MEMORY_PATH, "utf8");
}
