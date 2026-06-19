import cron from "node-cron";
import { loadAgentConfig } from "../config-loader.js";
import { getOwnerChatId } from "../auth.js";
import { scheduleWork } from "../agent-queue.js";
import { checkForUpdate } from "./checker.js";
import { sendUpdateNotification } from "./notify.js";
import { isRunningVersionKnown, saveUpdateState, setLastNotifiedVersion } from "./store.js";

let task = null;

let initialTimer = null;

function warnIfUnknownProductionVersion() {
    if (!isRunningVersionKnown()) {
        if (process.env.NODE_ENV === "production") {
            console.warn("tabyAgent: TABYAGENT_VERSION is unknown — update checks use watch mode until a release-tagged image is deployed");
        }
        return;
    }

    saveUpdateState({ watchStartedAt: null });
}

async function runUpdateCheck(bot) {
    const ownerChatId = getOwnerChatId();
    if (!ownerChatId) return;

    const update = await checkForUpdate();
    saveUpdateState({ lastCheckedAt: new Date().toISOString() });

    if (!update) return;

    await sendUpdateNotification(bot, ownerChatId, update);
    setLastNotifiedVersion(update.tagName);
    console.log(`tabyAgent: update notification sent (${update.tagName})`);
}

function queueUpdateCheck(bot, label) {
    scheduleWork("cron", async () => {
        try {
            await runUpdateCheck(bot);
        } catch (err) {
            console.error(`tabyAgent: ${label} update check failed:`, err?.stack || err);
        }
    }).catch((err) => {
        console.error(`tabyAgent: ${label} update check queue failed:`, err?.stack || err);
    });
}

export function startUpdateScheduler(bot) {
    const cfg = loadAgentConfig().updateCheck ?? {};
    if (cfg.enabled === false) {
        console.log("tabyAgent: update checker disabled");
        return;
    }

    warnIfUnknownProductionVersion();

    const schedule = cfg.intervalCron || "0 * * * *";
    if (!cron.validate(schedule)) {
        console.warn(`tabyAgent: invalid updateCheck.intervalCron "${schedule}", using "0 * * * *"`);
    }
    const expr = cron.validate(schedule) ? schedule : "0 * * * *";

    if (task) task.stop();

    task = cron.schedule(expr, () => queueUpdateCheck(bot, "scheduled"), { scheduled: true });

    const delayMs = cfg.initialDelayMs ?? 60_000;
    if (initialTimer) clearTimeout(initialTimer);
    initialTimer = setTimeout(() => {
        initialTimer = null;
        queueUpdateCheck(bot, "initial");
    }, delayMs);

    console.log(`tabyAgent: update checker scheduled (${expr})`);
}

export function stopUpdateScheduler() {
    if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
    }
    if (task) {
        task.stop();
        task = null;
    }
}
