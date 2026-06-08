/** Serializes user turns and cron jobs — cron runs only when no user/cron work is active. */

const queue = [];
let running = false;

/**
 * @param {'user'|'cron'} priority
 * @param {() => Promise<unknown>} fn
 * @param {{ chatId?: string, cancellable?: boolean }} [opts]
 */
export function scheduleWork(priority, fn, opts = {}) {
    const chatId = opts.chatId ? String(opts.chatId) : null;
    const cancellable = Boolean(opts.cancellable && chatId);

    return new Promise((resolve, reject) => {
        queue.push({ priority, fn, resolve, reject, chatId, cancellable });
        pump();
    });
}

/** Remove a queued agent turn for this chat. Returns true if something was cancelled. */
export function cancelQueuedAgentWork(chatId) {
    const key = String(chatId);
    let cancelled = false;

    for (let i = queue.length - 1; i >= 0; i -= 1) {
        const item = queue[i];
        if (!item.cancellable || item.chatId !== key) continue;
        queue.splice(i, 1);
        item.resolve({ error: "stopped_by_user", queued: true });
        cancelled = true;
    }

    return cancelled;
}

function pickNextIndex() {
    const userIdx = queue.findIndex((q) => q.priority === "user");
    if (userIdx >= 0) return userIdx;
    return queue.findIndex((q) => q.priority === "cron");
}

async function pump() {
    if (running) return;
    const idx = pickNextIndex();
    if (idx < 0) return;

    const item = queue.splice(idx, 1)[0];
    running = true;
    try {
        item.resolve(await item.fn());
    } catch (err) {
        console.error("Queue work failed:", err?.stack || err);
        item.reject(err);
    } finally {
        running = false;
        pump();
    }
}
