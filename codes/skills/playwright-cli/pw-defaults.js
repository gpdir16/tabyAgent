const DEFAULT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " + "Chrome/131.0.0.0 Safari/537.36";

const STEALTH_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--window-size=1920,1080",
];

function launchOptions(overrides = {}) {
    return {
        headless: process.env.HEADLESS !== "false",
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        ignoreDefaultArgs: ["--enable-automation"],
        args: STEALTH_ARGS,
        ...overrides,
    };
}

function contextOptions(overrides = {}) {
    return {
        viewport: { width: 1920, height: 1080 },
        userAgent: DEFAULT_USER_AGENT,
        locale: "en-US",
        timezoneId: "America/New_York",
        extraHTTPHeaders: {
            "Accept-Language": "en-US,en;q=0.9",
        },
        ...overrides,
    };
}

async function applyStealth(page) {
    await page.addInitScript(() => {
        if (!window.chrome) {
            window.chrome = { runtime: {} };
        }
    });
}

module.exports = { launchOptions, contextOptions, applyStealth, DEFAULT_USER_AGENT };
