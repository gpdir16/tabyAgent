English | [한국어](README.ko.md)

# tabyAgent

A lighter, easier alternative to OpenClaw/Hermes.

Runs in Docker or locally (Node.js) and chats with you through Telegram.

## What it does

- **Daily chat** — Send messages and get replies right in Telegram. Supports text, images, and files.
- **Connect your inference provider** — Works with OpenAI, OpenRouter, or any custom API endpoint.
- **Skills, MCP** — Add capabilities like web browsing, scheduled tasks, and more.
- **Scheduled tasks** — Set up recurring jobs that run automatically and report back.
- **Runs anywhere** — Docker container or local Node.js on your machine.

## Quick start

### 1. Create a Telegram bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the prompts.
3. Copy the bot token you receive.

### 2. Install (Linux / macOS)

Paste this one line into your terminal and press Enter. The installer will ask you to **paste the full token from BotFather**, then choose **Docker** or **local (Node.js)** runtime. It will **(optionally)** ask whether to connect a host folder — default **no**; if yes, it warns about risk and asks for an absolute path.

If you choose Docker and Docker is missing, the installer can install it. Local install requires Node.js 22+. Non-interactive: `TABYAGENT_MODE=docker` or `TABYAGENT_MODE=local`.

```bash
curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash
```

When it finishes, open your bot in Telegram and send `/start`. To upgrade later, run the **same command again** — your settings and memory are kept.

**Switch runtime:** re-run the installer with `TABYAGENT_MODE=local` or `TABYAGENT_MODE=docker`. The previous runtime is stopped automatically.

**Local install:** runs as a **background service** — you can close the terminal.

- `~/.tabyagent/run.sh status|stop|restart|logs`
- `~/.tabyagent/run.sh foreground` — debug only (needs terminal)

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

Optional host folder (default: none):

```bash
echo 'HOST_WORKSPACE=/absolute/path/to/your/project' >> .env
docker compose -f docker-compose.yml -f docker-compose.workspace.yml up -d
```

Mounts at `/workspace` in the container. Default work stays under `/app/user`; use `/workspace` only when a task needs files on the user's PC.

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

- Telegram bot token (from BotFather)
- Inference provider API key
- **Docker mode**: Docker
- **Local mode**: Node.js 22+, npm (macOS/Linux)

## License

AGPL-3.0
