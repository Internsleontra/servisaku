from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SMSResult:
    success: bool
    provider_message_id: str | None = None
    error: str | None = None


class SMSProvider(ABC):
    name: str

    @abstractmethod
    async def send(self, phone: str, message: str) -> SMSResult: ...
