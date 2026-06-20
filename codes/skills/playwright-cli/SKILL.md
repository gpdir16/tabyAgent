---
name: playwright-cli
description: Playwright automation via bundled run.js. Write scripts in /tmp, execute with terminal_run from {{PLAYWRIGHT_CLI_DIR}}.
---

# Playwright CLI (fallback)

Use only when **`browser-use` cannot do the job** (rare). Prefer `browser-use` for normal browsing.

## tabyAgent

- Run via **`terminal_run`**. Skill path: **`{{PLAYWRIGHT_CLI_DIR}}`**.
- Chromium is **preinstalled**. Do not run `npx playwright install` unless the user asks.
- Always run **headless** (`pwDefaults.launchOptions()`).
- Write scripts to **`/tmp/playwright-test-*.js`** only — never the skill dir or user project.

## Workflow

1. Put the target URL in a `TARGET_URL` constant at the top of the script.
2. For **localhost**, detect dev servers first:

```bash
cd {{PLAYWRIGHT_CLI_DIR}} && node -e "require('./lib/helpers').detectDevServers().then(s => console.log(JSON.stringify(s)))"
```

3. Write the script to `/tmp/playwright-test-*.js`.
4. Run:

```bash
cd {{PLAYWRIGHT_CLI_DIR}} && node run.js /tmp/playwright-test-*.js
```

## Script template

`run.js` injects `chromium`, `helpers`, `pwDefaults`, and `getContextOptionsWithHeaders`.

```javascript
// /tmp/playwright-test-example.js
const { chromium } = require("playwright");
const pwDefaults = require("./pw-defaults");

const TARGET_URL = "https://example.com";

(async () => {
    const browser = await chromium.launch(pwDefaults.launchOptions());
    const context = await browser.newContext(pwDefaults.contextOptions());
    const page = await context.newPage();
    await pwDefaults.applyStealth(page);

    await page.goto(TARGET_URL, { waitUntil: "networkidle", timeout: 30000 });
    console.log("Title:", await page.title());
    await page.screenshot({ path: "/tmp/screenshot.png", fullPage: true });

    await browser.close();
})();
```

## Helpers (optional)

`lib/helpers.js` — `detectDevServers()`, `safeClick()`, `safeType()`, `takeScreenshot()`, `handleCookieBanner()`.

```javascript
const helpers = require("./lib/helpers");
const servers = await helpers.detectDevServers();
```

## Tips

- Always use **`pwDefaults`** — disables automation flags, sets UA/viewport, patches `navigator.webdriver`.
- Prefer `waitForSelector` / `waitForURL` over fixed `waitForTimeout`.
- Use `try/catch/finally` and always `browser.close()` in `finally`.
- Screenshots and output paths: **`/tmp/`** only.

## Troubleshooting

- Module not found → run from skill dir: `cd {{PLAYWRIGHT_CLI_DIR}} && node run.js …`
- Element not found → `await page.waitForSelector('.el', { timeout: 10000 })`
- Install issues (rare) → `cd {{PLAYWRIGHT_CLI_DIR}} && npm run setup`
