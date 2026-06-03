/** Serializes user turns and cron jobs — cron runs only when no user/cron work is active. */

const queue = [];
let running = false;

/**
 * @param {'user'|'cron'} priority
 * @param {() => Promise<unknown>} fn
 */
export function scheduleWork(priority, fn) {
    return new Promise((resolve, reject) => {
        queue.push({ priority, fn, resolve, reject });
        pump();
    });
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
        item.reject(err);
    } finally {
        running = false;
        pump();
    }
}
