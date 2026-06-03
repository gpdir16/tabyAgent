#!/usr/bin/env node
import { ensureUserDir } from "./lib/bootstrap.js";
import { approveCode } from "./lib/auth.js";

ensureUserDir();

const [, , command, ...rest] = process.argv;
const arg = rest.join(" ").trim();

if (command === "approve" && arg) {
    const result = approveCode(arg);
    if (!result.ok) {
        console.error("Approval failed");
        process.exit(1);
    }
    console.log(`Approved: ${result.chatId}`);
    process.exit(0);
}

console.error("Setup and config are done in Telegram. Optional: docker compose exec tabyagent approve <code>");
process.exit(command ? 1 : 0);
