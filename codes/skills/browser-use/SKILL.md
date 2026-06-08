---
name: browser-use
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, or extract information from web pages.
---

# Browser Automation with browser-use CLI

## tabyAgent

- Run every `browser-use` command via **`terminal_run`** (one per call, or chain with `&&`).
- CLI is **preinstalled** in the image. Do not `pip install` unless `browser-use doctor` fails after an upgrade.
- Docker has **no display** — always use default **headless** mode. Do not use `--headed`, `connect`, or `--profile`.
- **Anti-bot stealth is auto-applied** at browser start. No extra step after `open`.

The daemon keeps the browser open between commands (~50ms per call).

## Core workflow

1. `browser-use open <url>`
2. `browser-use state` — clickable elements with indices
3. Interact by index (`click`, `input`, `keys`, …)
4. `browser-use state` or `browser-use screenshot` to verify
5. `browser-use close` when done (or leave open for the next command)

If a command fails: `browser-use close`, then retry.

## Commands

```bash
# Navigation
browser-use open <url>
browser-use back
browser-use scroll down          # --amount N for pixels
browser-use scroll up

# Page state — run state first
browser-use state
browser-use screenshot [path.png]   # --full for full page

# Interactions — indices from state
browser-use click <index>
browser-use click <x> <y>
browser-use type "text"
browser-use input <index> "text"
browser-use input <index> ""        # clear field
browser-use keys "Enter"            # also "Control+a", etc.
browser-use select <index> "option"
browser-use upload <index> <path>
browser-use hover <index>
browser-use dblclick <index>
browser-use rightclick <index>

# Data
browser-use eval "js code"
browser-use get title
browser-use get html [--selector "h1"]
browser-use get text <index>
browser-use get value <index>
browser-use get attributes <index>

# Wait
browser-use wait selector "css"     # --timeout ms, --state visible|hidden
browser-use wait text "text"

# Session
browser-use close
browser-use close --all
```

## Command chaining

```bash
browser-use open https://example.com && browser-use state
browser-use input 5 "user@example.com" && browser-use input 6 "password" && browser-use click 7
```

Chain when you do not need intermediate output. Run `state` separately first when you need to discover indices.

## Blocked sites

Stealth patches apply on browser start. If still blocked:

1. `browser-use close` then reopen (stale sessions may miss patches)
2. Do not fall back to `curl`/`wget` — use browser automation or URL mirrors (see system prompt for X links)
3. Captcha / login-only walls — tell the user; you cannot complete those for them

## Tips

1. Always run **`state`** before clicking — indices change after navigation
2. Browser **persists** between commands in the same session
3. Aliases: `bu`, `browser`, `browseruse`
4. On failure: **`browser-use close`** then retry

## Troubleshooting

- Browser won't start → `browser-use close` then `browser-use open <url>`
- Element not found → `browser-use scroll down` then `browser-use state`
- Install issues → `browser-use doctor`
