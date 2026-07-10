from services.gateway_base import PaymentGateway
from services.billplz_gateway import BillplzGateway
from services.ipay88_gateway import IPay88Gateway
from utils.errors import AppException

DEFAULT_GATEWAY = "BILLPLZ"

_GATEWAYS: dict[str, PaymentGateway] = {
    "BILLPLZ": BillplzGateway(),
    "IPAY88": IPay88Gateway(),
}


def get_gateway(name: str) -> PaymentGateway:
    gateway = _GATEWAYS.get(name)
    if gateway is None:
        raise AppException("unknown_gateway", f"Unknown payment gateway: {name}", status_code=400)
    return gateway
