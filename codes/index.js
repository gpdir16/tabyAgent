import { ensureUserDir } from "./lib/bootstrap.js";
import { initTools, shutdownTools } from "./lib/agent/tool-registry.js";
import { startTelegramBot } from "./lib/telegram.js";
import { bootstrapBotTokenFromEnv, hasBotToken } from "./lib/readiness.js";
import { runLegacyMigrations } from "./lib/migrate-legacy.js";
import { isDockerRuntime } from "./lib/runtime.js";
import { ensureSession, DISPLAY } from "./lib/computer/display.js";

const RETRY_MS = 10000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown() {
    await shutdownTools();
    process.exit(0);
}

// Docker에서는 공유 Xvfb 화면을 부팅 시 미리 띄운다.
// camofox(CAMOFOX_HEADLESS=false)가 DISPLAY로 이 화면에 렌더링되고
// xvfb_gui 앱도 같은 화면 위에 뜬다.
function startSharedDisplay() {
    if (!isDockerRuntime()) return;
    if (!process.env.DISPLAY) process.env.DISPLAY = `:${DISPLAY}`;
    ensureSession()
        .then((r) => {
            if (r?.sess) process.env.DISPLAY = `:${r.sess.display}`;
            else if (r?.error) console.warn(`tabyAgent: shared display unavailable: ${r.error}`);
        })
        .catch(() => {});
}

async function main() {
    ensureUserDir();
    bootstrapBotTokenFromEnv();
    runLegacyMigrations();
    await initTools();

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    while (!hasBotToken()) {
        console.error("");
        console.error("tabyAgent: set TELEGRAM_BOT_TOKEN in .env (or config), then restart.");
        console.error("  All other setup is done in Telegram after the bot is running.");
        console.error("");
        await sleep(10000);
    }

    startSharedDisplay();

    while (true) {
        try {
            await startTelegramBot();
            return;
        } catch (err) {
            console.error("tabyAgent: bot error:", err.message || err);
            console.error(`Retrying in ${RETRY_MS / 1000}s…`);
            await sleep(RETRY_MS);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
