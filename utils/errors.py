from datetime import datetime

from fastapi import Request
from fastapi.responses import JSONResponse

from utils.logging import get_logger

logger = get_logger("errors")


class AppException(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    logger.error(
        "app_error",
        code=exc.code,
        message=exc.message,
        path=str(request.url.path),
        method=request.method,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "status": exc.status_code,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        },
    )
