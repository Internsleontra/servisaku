"""Common interface every payment gateway must implement.

routes/payments.py talks to gateways only through this interface (selected via
services.gateway_registry.get_gateway(name)) so that business logic — create a
bill, poll its status, transition escrow — never branches on which gateway is
in play. Adding a new gateway means: implement PaymentGateway in a new file,
register it in gateway_registry.py, and (if it delivers async confirmations)
add a gateway-specific callback route that parses its payload then calls the
shared status-transition helpers in routes/payments.py. No existing route
needs to change.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal


@dataclass
class GatewayBill:
    """Normalized bill/transaction shape returned by any gateway."""
    gateway_transaction_id: str
    checkout_url: str
    paid: bool
    amount: Decimal


class PaymentGateway(ABC):
    name: str

    @abstractmethod
    async def create_bill(
        self, *, amount: Decimal, name: str, email: str | None, mobile: str | None,
        description: str, reference_label: str, reference: str,
    ) -> GatewayBill:
        """Creates a hosted checkout bill for the given amount."""

    @abstractmethod
    async def get_bill(self, gateway_transaction_id: str) -> GatewayBill:
        """Re-fetches a bill's current status directly from the gateway."""

    @abstractmethod
    def verify_callback_signature(self, data: dict) -> bool:
        """Verifies an inbound callback/webhook payload actually came from
        this gateway. Payload shape is gateway-specific, hence dict, not a
        normalized type."""
