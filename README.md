English | [한국어](README.ko.md)

# tabyAgent

A more autonomous, more persistent, and easier alternative to OpenClaw/Hermes.

Give it a task and it will do it, even if it takes hours or things go wrong.

Memory, skills, self-improvement, scheduled tasks, todos, web browsing, and GUI apps work out of the box. No extra setup.

> [!IMPORTANT]
> **tabyAgent is no longer under active development.** It will receive occasional maintenance only, and no new features are planned.
>
> - **If you must use a Telegram bot:** keep using tabyAgent as it is, or choose an actively maintained Telegram agent such as Hermes.
> - **If a web UI is fine instead:** migrate to tabyBot. Send `/migrate` to the bot, then upload the generated package to tabyBot. See [Migrating to tabyBot](#migrating-to-tabybot) for details.

## What it can do

- **Everyday chat.** Get answers in Telegram. It accepts text, images, files, and almost any other format.
- **Inference providers.** Connect OpenAI, OpenRouter, Upstage, OrcaRouter, Synthetic, Ollama (local and Cloud), ZenMux, OpenCode Go, Codex OAuth, Grok OAuth, GitHub Copilot OAuth, Claude OAuth (Pro/Max), or your own API endpoint.
- **Skills, MCP.** Add the capabilities and tools you want to the agent. Even if you don't install anything yourself, the agent finds and installs what it needs.
- **Scheduled tasks.** Recurring jobs run on a schedule, report when they finish, and skip when they are not needed.
- **Todos.** Manages todo lists for both you and the agents. You manage yours with `/todo` or the buttons in chat, while agents watch the list, schedule work, and handle your tasks for you.
- **Multiple agents.** Create specialist agents for different roles — each with its own memory, persona, and Telegram topic.
- **Run it anywhere.** Run it in a Docker container or on local Node.js. It supports macOS and Linux natively. Windows can work through Docker, but that is not guaranteed.
- **Self-improvement.** tabyAgent learns from how it solved past problems and from your corrections. It also learns what you do regularly and reminds you when you forget.
- **Secret vault.** Keep passwords and API keys in an encrypted vault. Agents use them without ever seeing the values. When they need a new one, they ask in chat and delete your reply right after storing it.
- **Cost efficiency.** Keeps the prompt cache warm during short breaks only when that saves money, and shows token usage and cache hit rate by day and model.

## Differences

- Differences between tabyAgent and tabyBot: (1) tabyAgent runs on Telegram while [tabyBot](https://github.com/gpdir16/tabyBot) runs in its own web UI. (2) tabyBot is actively developed, while tabyAgent is in maintenance mode and will receive very few updates. (3) Both share the same core, but new features and improvements land in tabyBot first.

| Feature                 | tabyAgent                      | Grok Bot             | OpenClaw         | Hermes           | ChatGPT (Chat)  |
| ----------------------- | ------------------------------ | -------------------- | ---------------- | ---------------- | --------------- |
| Everyday chat           | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ✅ Yes          |
| Multiple agents         | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ❌ No           |
| Search                  | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ✅ Yes          |
| Multiple providers      | ✅ Yes                         | ❌ No                | ✅ Yes           | ✅ Yes           | ❌ No           |
| Smart todo list         | ✅ User + agents               | ❌ No                | ❌ No            | ❌ No            | ❌ No           |
| Remote computer control | ✅ Browser, files, terminal    | ✅ Browser, terminal | ❌ No            | ❌ No            | ❌ No           |
| Proactive outreach      | ✅ Yes                         | ❌ No                | ❌ No            | ❌ No            | ❌ No           |
| Skills                  | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ❌ No           |
| MCP                     | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ✅ Dev mode     |
| Scheduled tasks         | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ✅ Yes          |
| Self-improvement        | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ❌ No           |
| Terminal                | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ❌ Sandbox only |
| Browser                 | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ❌ No           |
| GUI apps                | ✅ Yes                         | ✅ Yes               | ✅ Yes           | ✅ Yes           | ❌ No           |
| Local execution         | ✅ Yes                         | ❌ No                | ✅ Yes           | ✅ Yes           | ❌ No           |
| NSFW level              | ✅ Allow, indirect only, block | ❌ Not available     | ❌ Not available | ❌ Not available | ❌ Block        |
| License                 | ✅ AGPL-3.0                    | ❌ Proprietary       | ✅ MIT           | ✅ MIT           | ❌ Proprietary  |

> Tests used the Ollama Cloud provider and the Kimi-K2.6 model.

## Example prompts

- "What's last month's DigitalOcean bill?"
- "Find every file in Documents that contains the word report and summarize them all."
- "Run gemma4 e4b and e2b on this machine yourself, then compare them."
- "Organize next week's schedule."
- "Delete the sales row in this Excel file and highlight the columns that have values."
- "Cancel my ChatGPT Plus subscription for me."
- "Is this actually real? (X/Reddit link)"
- "Summarize this (long pasted text)."
- "Remember my email account so you can use it later. The address is ()."
- "Sign up for Spotify with the email account I told you about earlier."
- "Visualize this paper so it's easy to understand. (paper link)"
- "Compare privatestater analytics and privatestater captcha with Google Analytics and reCAPTCHA."
- "What's a privacy-respecting Gmail alternative?"
- "What should I eat for lunch in a bit? I have 4,328 won in my account."
- "Every morning at 8, send me today's weather and my todos."
- "Let me know when a new one drops. (manga/channel link)"
- "If there's anything on my todo list you can handle, just do it."
- "I study Japanese around 9pm every night. Nudge me if I forget."
- "What was that thing we talked about before?"
- "Make a translation specialist bot and have it translate this whole document."
- "That thing you did earlier was wrong. Do it this way from now on."
- "Take as long as you need. Organize every photo in this folder by date."
- "Before I get off work, summarize what I did today."

## Quick start

### Option A: Installer script

#### 1. Create a Telegram bot

1. Open Telegram and chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the instructions.
3. Copy the bot token.

#### 2. Install (Linux / macOS)

Paste the line below into a terminal and press Enter. Installation can take a while, so wait for it to finish.

You can choose Docker or a local run. Docker is recommended for security and isolation.

**Requirements.** With Docker, the installer sets up everything you need. For a local run, install Node.js 22 or later first.

The installer does not support Windows. If you are on Windows, consider switching your main OS to a Linux-based distribution. In most cases it is faster and more private, and it leaves you more freedom.

```bash
curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash
```

To update tabyAgent later, run the command above again. Settings and memory are kept.

The installer adds a `tabyagent` command to manage the instance: `tabyagent start`, `stop`, `restart`, `status`, `logs`, `approve`, and `uninstall`.

#### 3. Set up in Telegram

1. Send `/start` to your new bot.
2. The setup wizard walks you through language, LLM provider, API key, and model.
3. When setup is done, you can start chatting.

You can change language, model, thinking level, provider profiles, and more with `/config` at any time. Use `/todo` for the shared todo list and `/agents` to manage additional agents.

### Option B: Docker Compose (not recommended)

```bash
git clone https://github.com/gpdir16/tabyAgent.git
cd tabyAgent
cp .env.example .env # Edit .env and set TELEGRAM_BOT_TOKEN
docker compose up -d
```

## Migrating to tabyBot

tabyBot is built on tabyAgent, is similar to Grok Bot but more capable, and is still actively developed.

If you do not specifically need a Telegram bot, migrating to tabyBot is recommended.

1. Install and set up [tabyBot](https://github.com/gpdir16/tabyBot).
2. Send `/migrate` to your existing tabyAgent bot and download the generated migration package.
3. Attach the package to the "tabyBot" agent and ask it to migrate.

Settings, agents, memories, todos, and related data are included in the package.

> Warning: the package may contain sensitive data such as provider API keys, OAuth tokens, and chat history. Delete it immediately after migration and take care not to leak it. Values in the secret vault (`secrets.json`) are not included, so register them again in tabyBot.

## Third-party licenses

| Project                        | Version | License          | Source                                                                  |
| ------------------------------ | ------- | ---------------- | ----------------------------------------------------------------------- |
| grammy                         | 1.46.0  | MIT              | [Repository](https://github.com/grammyjs/grammY)                        |
| @modelcontextprotocol/sdk      | 1.30.0  | MIT              | [Repository](https://github.com/modelcontextprotocol/typescript-sdk)    |
| node-cron                      | 3.0.3   | ISC              | [Repository](https://github.com/node-cron/node-cron)                    |
| openai                         | 4.104.0 | Apache-2.0       | [Repository](https://github.com/openai/openai-node)                     |
| prettier                       | 3.8.3   | MIT              | [Repository](https://github.com/prettier/prettier)                      |
| @biomejs/biome                 | 2.5.15  | MIT / Apache-2.0 | [Repository](https://github.com/biomejs/biome)                          |
| @anthropic-ai/claude-agent-sdk | 0.3.296 | Proprietary      | [Repository](https://github.com/anthropics/claude-agent-sdk-typescript) |
| zod                            | 4.6.7   | MIT              | [Repository](https://github.com/colinhacks/zod)                         |
| camofox-browser                | 2.4.7   | MIT              | [Repository](https://github.com/redf0x1/camofox-browser)                |
| Camoufox                       | —       | MPL-2.0          | [Repository](https://github.com/daijro/camoufox)                        |
| Playwright                     | —       | Apache-2.0       | [Repository](https://github.com/microsoft/playwright)                   |

<details>
<summary>Transitive npm dependencies</summary>

- **Apache-2.0:** `@opentelemetry/api`, `openai`
- **BSD-2-Clause:** `json-schema-typed`, `webidl-conversions`
- **BSD-3-Clause:** `fast-uri`, `qs`
- **ISC:** `inherits`, `isexe`, `node-cron`, `once`, `setprototypeof`, `which`, `wrappy`, `zod-to-json-schema`
- **MIT:** `@anthropic-ai/sdk`, `@babel/runtime`, `@grammyjs/types`, `@hono/node-server`, `@modelcontextprotocol/sdk`, `@stablelib/base64`, `@types/node`, `@types/node-fetch`, `abort-controller`, `accepts`, `agentkeepalive`, `ajv`, `ajv-formats`, `asynckit`, `base64-js`, `body-parser`, `bytes`, `call-bind-apply-helpers`, `call-bound`, `combined-stream`, `content-disposition`, `content-type`, `cookie`, `cookie-signature`, `cors`, `cross-spawn`, `debug`, `delayed-stream`, `depd`, `dunder-proto`, `ee-first`, `encodeurl`, `es-define-property`, `es-errors`, `es-object-atoms`, `es-set-tostringtag`, `escape-html`, `etag`, `event-target-shim`, `eventsource`, `eventsource-parser`, `express`, `express-rate-limit`, `fast-deep-equal`, `finalhandler`, `form-data`, `form-data-encoder`, `formdata-node`, `forwarded`, `fresh`, `function-bind`, `get-intrinsic`, `get-proto`, `gopd`, `grammy`, `has-symbols`, `has-tostringtag`, `hasown`, `hono`, `http-errors`, `humanize-ms`, `iconv-lite`, `ip-address`, `ipaddr.js`, `is-promise`, `jose`, `json-schema-to-ts`, `json-schema-traverse`, `math-intrinsics`, `media-typer`, `merge-descriptors`, `mime-db`, `mime-types`, `ms`, `negotiator`, `node-domexception`, `node-fetch`, `object-assign`, `object-inspect`, `on-finished`, `parseurl`, `path-key`, `path-to-regexp`, `pkce-challenge`, `prettier`, `proxy-addr`, `range-parser`, `raw-body`, `require-from-string`, `router`, `safer-buffer`, `send`, `serve-static`, `shebang-command`, `shebang-regex`, `side-channel`, `side-channel-list`, `side-channel-map`, `side-channel-weakmap`, `standardwebhooks`, `statuses`, `toidentifier`, `tr46`, `ts-algebra`, `type-is`, `undici-types`, `unpipe`, `uuid`, `vary`, `web-streams-polyfill`, `whatwg-url`, `zod`
- **MIT / Apache-2.0:** `@biomejs/cli-darwin-arm64`, `@biomejs/cli-darwin-x64`, `@biomejs/cli-linux-arm64`, `@biomejs/cli-linux-arm64-musl`, `@biomejs/cli-linux-x64`, `@biomejs/cli-linux-x64-musl`, `@biomejs/cli-win32-arm64`, `@biomejs/cli-win32-x64`
- **Unlicense:** `fast-sha256`
- **Proprietary (Anthropic):** `@anthropic-ai/claude-agent-sdk-darwin-arm64`, `@anthropic-ai/claude-agent-sdk-darwin-x64`, `@anthropic-ai/claude-agent-sdk-linux-arm64`, `@anthropic-ai/claude-agent-sdk-linux-arm64-musl`, `@anthropic-ai/claude-agent-sdk-linux-x64`, `@anthropic-ai/claude-agent-sdk-linux-x64-musl`, `@anthropic-ai/claude-agent-sdk-win32-arm64`, `@anthropic-ai/claude-agent-sdk-win32-x64`

</details>

## License

AGPL-3.0
