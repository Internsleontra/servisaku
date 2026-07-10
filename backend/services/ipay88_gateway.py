"""iPay88 integration stub.

iPay88 has no self-serve sandbox signup — credentials (merchant code + merchant
key) are only issued after a manual merchant application is approved by iPay88
(contact support@ipay88.com.my). Until real credentials exist, every method
raises a clear 503 rather than guessing at request/signature formats that
can't be verified without an account. Use BILLPLZ instead in the meantime.

Implements the same PaymentGateway interface as BillplzGateway so it's a
drop-in once real credentials and API details are confirmed.
"""

from decimal import Decimal

from utils.errors import AppException
from services.gateway_base import PaymentGateway, GatewayBill


class IPay88Gateway(PaymentGateway):
    name = "IPAY88"

    def _not_available(self) -> None:
        raise AppException(
            "gateway_not_available",
            "iPay88 requires a manually-approved merchant account (no self-serve "
            "sandbox exists). Contact support@ipay88.com.my for test credentials, "
            "then set IPAY88_MERCHANT_CODE / IPAY88_MERCHANT_KEY in .env. "
            "Use the BILLPLZ gateway in the meantime.",
            status_code=503,
        )

    async def create_bill(
        self, *, amount: Decimal, name: str, email: str | None, mobile: str | None,
        description: str, reference_label: str, reference: str,
    ) -> GatewayBill:
        self._not_available()

    async def get_bill(self, gateway_transaction_id: str) -> GatewayBill:
        self._not_available()

    def verify_callback_signature(self, data: dict) -> bool:
        self._not_available()
