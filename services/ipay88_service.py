"""iPay88 integration stub.

iPay88 has no self-serve sandbox signup — credentials (merchant code + merchant
key) are only issued after a manual merchant application is approved by iPay88
(contact support@ipay88.com.my). Until real credentials exist, every call here
raises a clear 503 rather than guessing at request/signature formats that
can't be verified without an account. Use BILLPLZ instead in the meantime.
"""

from decimal import Decimal

from utils.errors import AppException


def _not_available() -> None:
    raise AppException(
        "gateway_not_available",
        "iPay88 requires a manually-approved merchant account (no self-serve "
        "sandbox exists). Contact support@ipay88.com.my for test credentials, "
        "then set IPAY88_MERCHANT_CODE / IPAY88_MERCHANT_KEY in .env. "
        "Use the BILLPLZ gateway in the meantime.",
        status_code=503,
    )


async def create_transaction(*, amount: Decimal, **kwargs) -> dict:
    _not_available()


async def verify_transaction(transaction_id: str) -> dict:
    _not_available()
