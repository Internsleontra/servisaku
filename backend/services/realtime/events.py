"""Lightweight in-process pub/sub so business-logic modules (the dispatch
engine, payments, bookings) can emit real-time events without importing the
Socket.IO layer directly. services/realtime/socket_server.py subscribes here
on startup — this module is the decoupling point so neither side imports the
other, avoiding a circular import between dispatch and sockets."""

from typing import Awaitable, Callable

from utils.logging import get_logger

logger = get_logger("realtime_events")

_Handler = Callable[[str, dict], Awaitable[None]]
_subscribers: list[_Handler] = []


def subscribe(handler: _Handler) -> None:
    _subscribers.append(handler)
    logger.info("event_subscriber_registered", count=len(_subscribers))


async def emit(event: str, payload: dict) -> None:
    """Best-effort fan-out — a broken subscriber (e.g. Socket.IO not yet
    initialized, or a bad room lookup) must never break the business action
    that triggered the event.

    Note: this only reaches subscribers registered in the *same process*.
    Anything that emits from outside the running server (a one-off script,
    a management command run via `python -c ...`) will silently have zero
    subscribers — discovered live while testing the dispatch/Socket.IO
    bridge. In normal operation this is a non-issue since every business
    action runs inside the single running app process, but it's worth
    remembering if a future admin/CLI script needs to emit real-time events."""
    for handler in _subscribers:
        try:
            await handler(event, payload)
        except Exception as e:
            # NOTE: never pass a kwarg literally named `event=` to a structlog
            # call — structlog's positional event-name argument collides with
            # it and raises "got multiple values for argument 'event'",
            # discovered live when this exact line crashed emit() itself.
            logger.warning("event_handler_error", event_name=event, error=str(e))
