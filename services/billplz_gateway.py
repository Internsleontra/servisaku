import hashlib
import hmac
from decimal import Decimal

import httpx

from config import get_settings
from utils.errors import AppException
from services.gateway_base import PaymentGateway, GatewayBill

settings = get_settings()


class BillplzGateway(PaymentGateway):
    name = "BILLPLZ"

    def _require_configured(self) -> None:
        if not settings.BILLPLZ_API_KEY or not settings.BILLPLZ_COLLECTION_ID:
            raise AppException(
                "payment_gateway_not_configured",
                "Billplz is not configured. Sign up for a free sandbox account at "
                "https://www.billplz-sandbox.com, create a Collection, then set "
                "BILLPLZ_API_KEY / BILLPLZ_COLLECTION_ID / BILLPLZ_X_SIGNATURE_KEY "
                "in .env. See docs/BILLPLZ_SETUP.md.",
                status_code=503,
            )

    @staticmethod
    def _to_cents(amount: Decimal) -> int:
        return int((amount * 100).to_integral_value())

    @staticmethod
    def _from_bill_json(data: dict) -> GatewayBill:
        return GatewayBill(
            gateway_transaction_id=data["id"],
            checkout_url=data["url"],
            paid=bool(data.get("paid")),
            amount=Decimal(data["amount"]) / 100,
        )

    async def create_bill(
        self, *, amount: Decimal, name: str, email: str | None, mobile: str | None,
        description: str, reference_label: str, reference: str,
    ) -> GatewayBill:
        self._require_configured()
        payload = {
            "collection_id": settings.BILLPLZ_COLLECTION_ID,
            "name": name,
            "amount": self._to_cents(amount),
            "callback_url": f"{settings.APP_PUBLIC_BASE_URL}/api/v1/payments/billplz/callback",
            "description": description[:200],
            "reference_1_label": reference_label[:20],
            "reference_1": reference[:120],
        }
        if email:
            payload["email"] = email
        elif mobile:
            payload["mobile"] = mobile
        else:
            raise AppException("missing_contact", "Consumer needs an email or phone number to create a bill", status_code=422)

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{settings.BILLPLZ_BASE_URL}/bills",
                data=payload,
                auth=(settings.BILLPLZ_API_KEY, ""),
            )
        if resp.status_code >= 400:
            raise AppException("gateway_error", f"Billplz create bill failed: {resp.status_code} {resp.text}", status_code=502)
        return self._from_bill_json(resp.json())

    async def get_bill(self, gateway_transaction_id: str) -> GatewayBill:
        self._require_configured()
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{settings.BILLPLZ_BASE_URL}/bills/{gateway_transaction_id}",
                auth=(settings.BILLPLZ_API_KEY, ""),
            )
        if resp.status_code >= 400:
            raise AppException("gateway_error", f"Billplz get bill failed: {resp.status_code} {resp.text}", status_code=502)
        return self._from_bill_json(resp.json())

    def verify_callback_signature(self, data: dict) -> bool:
        """Verifies Billplz's X-Signature on a callback POST body.

        Algorithm per support.billplz.com/api: for every field except
        x_signature, build "key"+"value", sort the resulting strings ascending
        (case-insensitive), join with "|", then HMAC-SHA256 with the X
        Signature Key and compare hex digests.

        Not yet verified against a real Billplz callback (no live sandbox
        account existed at implementation time) — re-confirm against the
        dashboard docs once BILLPLZ_X_SIGNATURE_KEY is set up for real.
        """
        if not settings.BILLPLZ_X_SIGNATURE_KEY:
            return False
        received = data.get("x_signature", "")
        parts = [f"{k}{v}" for k, v in data.items() if k != "x_signature"]
        source = "|".join(sorted(parts, key=str.lower))
        computed = hmac.new(
            settings.BILLPLZ_X_SIGNATURE_KEY.encode(), source.encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(computed, received)
