import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from utils.logging import get_logger

logger = get_logger("http")


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        logger.info(
            "request",
            method=request.method,
            path=str(request.url.path),
            status=response.status_code,
            duration_ms=duration_ms,
            client=request.client.host if request.client else None,
        )
        return response
