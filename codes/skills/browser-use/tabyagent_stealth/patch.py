"""Monkey-patch browser-use CLI to apply anti-bot stealth on every browser start."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("tabyagent_stealth")

STEALTH_JS = (Path(__file__).parent / "stealth.js").read_text(encoding="utf-8")

# Recent desktop Chrome UA without "HeadlessChrome"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


async def _apply_stealth(session) -> None:
    from browser_use.skill_cli.browser import CLIBrowserSession

    if not isinstance(session, CLIBrowserSession):
        return
    if not session._cdp_client_root:
        return

    await session._cdp_add_init_script(STEALTH_JS)

    ua_params = {
        "userAgent": DEFAULT_USER_AGENT,
        "acceptLanguage": "en-US,en;q=0.9",
        "platform": "Linux x86_64",
    }
    try:
        await session.cdp_client.send.Network.setUserAgentOverride(params=ua_params)
        await session.cdp_client.send.Emulation.setUserAgentOverride(params=ua_params)
        await session._cdp_set_viewport(1920, 1080, device_scale_factor=1.0)
    except Exception as exc:
        logger.debug("CDP override skipped: %s", exc)

    logger.info("tabyAgent stealth patches applied")


def _patch_cli_browser_session() -> None:
    from browser_use.skill_cli.browser import CLIBrowserSession

    if getattr(CLIBrowserSession.start, "_tabyagent_stealth", False):
        return

    original_start = CLIBrowserSession.start

    async def start_with_stealth(self, *args, **kwargs):
        profile = self.browser_profile
        if profile.is_local and not profile.cdp_url and not profile.use_cloud:
            profile.user_agent = profile.user_agent or DEFAULT_USER_AGENT
        await original_start(self, *args, **kwargs)
        try:
            await _apply_stealth(self)
        except Exception as exc:
            logger.warning("Failed to apply stealth patches: %s", exc)

    start_with_stealth._tabyagent_stealth = True  # type: ignore[attr-defined]
    CLIBrowserSession.start = start_with_stealth  # type: ignore[method-assign]
    logger.info("Patched CLIBrowserSession.start for stealth")


_patch_cli_browser_session()
