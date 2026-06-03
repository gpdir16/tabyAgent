/** Default launch options for tabyAgent Docker (system Chromium + headless). */
function launchOptions(overrides = {}) {
    return {
        headless: process.env.HEADLESS !== "false",
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        ...overrides,
    };
}

module.exports = { launchOptions };
