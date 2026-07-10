"""Common interface every push provider must implement, mirroring
services/gateway_base.py's approach for payment gateways: the dispatcher
never branches on provider name, so swapping Firebase for another push
service later is a matter of implementing this interface and updating the
registry — no route or dispatcher logic changes."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class PushResult:
    success: bool
    provider_message_id: str | None = None
    error: str | None = None


class PushProvider(ABC):
    name: str

    @abstractmethod
    async def send_to_token(
        self, token: str, title: str, body: str, data: dict[str, str] | None = None,
    ) -> PushResult: ...

    @abstractmethod
    async def send_to_topic(
        self, topic: str, title: str, body: str, data: dict[str, str] | None = None,
    ) -> PushResult: ...

    @abstractmethod
    async def subscribe_to_topic(self, tokens: list[str], topic: str) -> None: ...

    @abstractmethod
    async def unsubscribe_from_topic(self, tokens: list[str], topic: str) -> None: ...
