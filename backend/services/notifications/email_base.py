from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EmailResult:
    success: bool
    provider_message_id: str | None = None
    error: str | None = None


class EmailProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    async def send(self, to: str, subject: str, html: str, text: str | None = None) -> EmailResult: ...
