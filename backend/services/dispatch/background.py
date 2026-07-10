"""Background Dispatch Processing — a periodic in-process asyncio task that
sweeps for expired offers and retries the next candidate, independent of any
single HTTP request. Started/stopped from main.py's lifespan."""

import asyncio

from config import get_settings
from services.dispatch.engine import run_expiry_sweep_standalone
from utils.logging import get_logger

settings = get_settings()
logger = get_logger("dispatch_background")


async def dispatch_sweep_loop() -> None:
    while True:
        try:
            result = await run_expiry_sweep_standalone()
            if result["expired"]:
                logger.info("dispatch_sweep", **result)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("dispatch_sweep_loop_error")
        await asyncio.sleep(settings.DISPATCH_SWEEP_INTERVAL_SECONDS)
