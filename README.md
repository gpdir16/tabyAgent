English | [한국어](README.ko.md)

# tabyAgent

A more autonomous, more persistent, and easier alternative to OpenClaw/Hermes.

Give it a task and it will do it — even if it takes hours, even if things go wrong.

Memory, skills, self-improvement, scheduled tasks, todos, web browsing, GUI apps, and multiple agents work out of the box. No extra setup.

## What it can do

- **Everyday chat**: Get answers in Telegram. Almost every format is supported — text, images, files, and more.
- **Inference providers**: Connect OpenAI, OpenRouter, Upstage, OrcaRouter, Synthetic, Ollama (local and Cloud), ZenMux, Codex OAuth, Grok OAuth, GitHub Copilot OAuth, or your own API endpoint.
- **Skills, MCP**: Add the capabilities and tools you want to the agent. Even if you don't install anything yourself, the agent finds and installs what it needs.
- **Scheduled tasks**: Recurring jobs run on a schedule, report when they finish, and skip when they are not needed.
- **Todos**: Manages todo lists for both you and the agents. You manage yours with `/todo` or the approve buttons in chat, while agents automatically watch the list, schedule work, and handle your tasks for you.
- **Multiple agents**: Create specialist agents for different roles — each with its own memory, persona, and Telegram topic — and have them work together.
- **Run it anywhere**: Docker container or local Node.js. Native support is macOS and Linux. Windows can work through Docker, but that is not guaranteed.
- **Self-improvement**: tabyAgent can improve itself. It learns from how problems were solved and from your corrections, and it gets sharper the more you use it. It also learns the things you regularly do, and can remind you when you forget.

## Differences

- Differences between tabyAgent and tabyBot: (1) tabyAgent runs on Telegram while [tabyBot](https://github.com/gpdir16/tabyBot) runs in its own web UI. (2) Both share the same core features — pick whichever interface fits you better. (3) tabyBot is ahead on the latest features, improvements, and convenience, so I recommend starting with tabyBot if you're new. If you already use tabyAgent there's no need to migrate right away, but it's worth planning one.
- To migrate to tabyBot, send `/migrate` to your bot on Telegram — you'll get a txt file with the converted data and instructions; upload it to tabyBot and the agent will handle the restore.

| Feature            | tabyAgent                      | Grok Bot         | OpenClaw         | Hermes           | ChatGPT (Chat)  |
| ------------------ | ------------------------------ | ---------------- | ---------------- | ---------------- | --------------- |
| Everyday chat      | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ✅ Yes          |
| Multiple agents    | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ❌ No           |
| Search             | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ✅ Yes          |
| Multiple providers | ✅ Yes                         | ❌ No            | ✅ Yes           | ✅ Yes           | ❌ No           |
| Smart todo list    | ✅ User + agents               | ❌ No            | ❌ No            | ❌ No            | ❌ No           |
| Proactive outreach | ✅ Yes                         | ❌ No            | ❌ No            | ❌ No            | ❌ No           |
| Skills             | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ❌ No           |
| MCP                | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ✅ Dev mode     |
| Scheduled tasks    | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ✅ Yes          |
| Self-improvement   | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ❌ No           |
| Terminal           | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ❌ Sandbox only |
| Browser            | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ❌ No           |
| GUI apps           | ✅ Yes                         | ✅ Yes           | ✅ Yes           | ✅ Yes           | ❌ No           |
| Local execution    | ✅ Yes                         | ❌ No            | ✅ Yes           | ✅ Yes           | ❌ No           |
| Persistence        | ✅ Disk                        | ❌ No            | ❌ No            | ❌ No            | ❌ No           |
| Refusal            | ✅ Never                       | ✅ Never         | ❌ Sometimes     | ❌ Sometimes     | ❌ Sometimes    |
| Memory usage       | ✅ ~800MB                      | ✅ Unknown       | ❌ ~10GB         | ❌ ~2GB          | ✅ Cloud        |
| NSFW level         | ✅ Allow, indirect only, block | ❌ Not available | ❌ Not available | ❌ Not available | ❌ Block        |
| License            | ✅ AGPL-3.0                    | ❌ Proprietary   | ✅ MIT           | ✅ MIT           | ❌ Proprietary  |

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
- "I'll give you my email account so you can use it later. Address is (), SMTP/POP3 password is ()."
- "Sign up for Spotify with the email account I told you about earlier."
- "Visualize this paper so it's easy to understand. (paper link)"
- "Compare privatestater analytics and privatestater captcha with Google Analytics and reCAPTCHA."
- "What's a privacy-respecting Gmail alternative?"
- "What should I eat for lunch in a bit? I have 4,328 won in my account."
- "Every morning at 8, send me today's weather and my todos."
- "Let me know when a new one drops. (manga/channel link)"
- "If there's anything on my todo list you can handle, just do it."
- "I study Japanese around 9pm every night — nudge me if I forget."
- "What was that thing we talked about before?"
- "Make a translation specialist bot and have it translate this whole document."
- "That thing you did earlier was wrong — do it this way from now on."
- "Take as long as you need — organize every photo in this folder by date."
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

The automated script does not support Windows. If you are on Windows, consider switching your main OS to a Linux-based distribution. In many cases it is faster, more privacy-friendly, and more freedom-preserving.
**Requirements:** If you pick Docker, everything you need is installed for you. If you pick local, Node.js 22 or later must already be installed.

```bash
curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash
```

To update tabyAgent later, run the same command again. Settings and memory are kept.

The installer also adds a `tabyagent` command to manage the instance: `tabyagent start`, `stop`, `restart`, `status`, `logs`, `approve`, and `uninstall`.

#### 3. Set up in Telegram

1. Send `/start` to your new bot.
2. The setup wizard walks you through language, LLM provider, API key, and model.
3. When setup is done, you can start chatting.

You can change language, model, thinking level, and more with `/config` at any time. Use `/todo` for the shared todo list and `/agents` to manage additional agents.

### Option B: Docker Compose (not recommended)

```bash
git clone https://github.com/gpdir16/tabyAgent.git
cd tabyAgent
cp .env.example .env # Edit .env and set TELEGRAM_BOT_TOKEN
docker compose up -d
```

## Third-party licenses

| Project                   | Version | License    | Source                                                               |
| ------------------------- | ------- | ---------- | -------------------------------------------------------------------- |
| grammy                    | 1.46.0  | MIT        | [Repository](https://github.com/grammyjs/grammY)                     |
| @modelcontextprotocol/sdk | 1.30.0  | MIT        | [Repository](https://github.com/modelcontextprotocol/typescript-sdk) |
| js-tiktoken               | 1.0.21  | MIT        | [Repository](https://github.com/dqbd/tiktoken)                       |
| node-cron                 | 3.0.3   | ISC        | [Repository](https://github.com/node-cron/node-cron)                 |
| openai                    | 4.104.0 | Apache-2.0 | [Repository](https://github.com/openai/openai-node)                  |
| prettier                  | 3.8.3   | MIT        | [Repository](https://github.com/prettier/prettier)                   |
| camofox-browser           | 2.4.7   | MIT        | [Repository](https://github.com/redf0x1/camofox-browser)             |
| Camoufox                  | —       | MPL-2.0    | [Repository](https://github.com/daijro/camoufox)                     |
| Playwright                | —       | Apache-2.0 | [Repository](https://github.com/microsoft/playwright)                |

<details>
<summary>Transitive npm dependencies</summary>

- **Apache-2.0:** `openai`
- **BSD-2-Clause:** `json-schema-typed`, `webidl-conversions`
- **BSD-3-Clause:** `fast-uri`, `qs`
- **ISC:** `inherits`, `isexe`, `node-cron`, `once`, `setprototypeof`, `which`, `wrappy`, `zod-to-json-schema`
- **MIT:** `@grammyjs/types`, `@hono/node-server`, `@modelcontextprotocol/sdk`, `@types/node`, `@types/node-fetch`, `abort-controller`, `accepts`, `agentkeepalive`, `ajv`, `ajv-formats`, `asynckit`, `base64-js`, `body-parser`, `bytes`, `call-bind-apply-helpers`, `call-bound`, `combined-stream`, `content-disposition`, `content-type`, `cookie`, `cookie-signature`, `cors`, `cross-spawn`, `debug`, `delayed-stream`, `depd`, `dunder-proto`, `ee-first`, `encodeurl`, `es-define-property`, `es-errors`, `es-object-atoms`, `es-set-tostringtag`, `escape-html`, `etag`, `event-target-shim`, `eventsource`, `eventsource-parser`, `express`, `express-rate-limit`, `fast-deep-equal`, `finalhandler`, `form-data`, `form-data-encoder`, `formdata-node`, `forwarded`, `fresh`, `function-bind`, `get-intrinsic`, `get-proto`, `gopd`, `grammy`, `has-symbols`, `has-tostringtag`, `hasown`, `hono`, `http-errors`, `humanize-ms`, `iconv-lite`, `ip-address`, `ipaddr.js`, `is-promise`, `jose`, `js-tiktoken`, `json-schema-traverse`, `math-intrinsics`, `media-typer`, `merge-descriptors`, `mime-db`, `mime-types`, `ms`, `negotiator`, `node-domexception`, `node-fetch`, `object-assign`, `object-inspect`, `on-finished`, `parseurl`, `path-key`, `path-to-regexp`, `pkce-challenge`, `prettier`, `proxy-addr`, `range-parser`, `raw-body`, `require-from-string`, `router`, `safer-buffer`, `send`, `serve-static`, `shebang-command`, `shebang-regex`, `side-channel`, `side-channel-list`, `side-channel-map`, `side-channel-weakmap`, `statuses`, `toidentifier`, `tr46`, `type-is`, `undici-types`, `unpipe`, `uuid`, `vary`, `web-streams-polyfill`, `whatwg-url`, `zod`

</details>

## License

AGPL-3.0
