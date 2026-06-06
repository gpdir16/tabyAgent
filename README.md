English | [한국어](README.ko.md)

# tabyAgent

A lighter, easier alternative to OpenClaw/Hermes.

Runs autonomously inside Docker and chats with you through Telegram.

## What it does

- **Daily chat** — Send messages and get replies right in Telegram. Supports text, images, and files.
- **Connect your inference provider** — Works with OpenAI, OpenRouter, or any custom API endpoint.
- **Skills, MCP** — Add capabilities like web browsing, scheduled tasks, and more.
- **Scheduled tasks** — Set up recurring jobs that run automatically and report back.
- **Runs anywhere** — Lightweight single Docker container, works on any device.

## Quick start

### 1. Create a Telegram bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the prompts.
3. Copy the bot token you receive.

### 2. Install (Linux / macOS)

Paste this one line into your terminal and press Enter. The installer will ask you to **paste the full token from BotFather**.

When the installer asks you to install Docker, press y to install it. tabyAgent requires Docker to run. Automatic installation is supported on macOS and Linux only.

```bash
curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash
```

When it finishes, open your bot in Telegram and send `/start`. To upgrade later, run the **same command again** — your settings and memory are kept.

### 3. Configure in Telegram

1. Open your bot in Telegram and send `/start`. The first person to send a message is automatically approved.
2. The setup wizard will guide you through language, LLM provider, API key, and model.
3. Once done, you can start chatting.

Send `/config` anytime to change your settings.

## Run from source (Docker Compose)

```bash
git clone https://github.com/gpdir16/tabyAgent.git
cd tabyAgent
cp .env.example .env   # set TELEGRAM_BOT_TOKEN
docker compose up -d
```

Rebuild the image after pulling code changes:

```bash
docker compose up -d --build
```

## Bot commands

| Command           | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `/start`          | Start the bot or open the setup wizard on first run                 |
| `/config`         | Open the configuration wizard                                       |
| `/new`            | Start a new chat (5+ turns: save summary to memory.md first)        |
| `/stop`           | Stop the current task (messages sent while running are added to it) |
| `/reload`         | Reload MCP tools (skills do not need reload)                        |
| `/approve <code>` | Approved user grants access (disconnects the previous user)         |

## Requirements

- Docker
- Telegram bot token (from BotFather)
- Inference provider API key

## License

AGPL-3.0
