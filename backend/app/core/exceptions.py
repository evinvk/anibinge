"""
Exception handlers and custom exceptions for the Anibinge API.
"""
import logging
from typing import Any

from fastapi import Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger("anibinge.exceptions")


class AnibingeException(Exception):
    """Base exception for Anibinge API errors."""

    def __init__(self, message: str, status_code: int = 500, detail: dict[str, Any] | None = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail or {}
        super().__init__(self.message)


class UpstreamAPIError(AnibingeException):
    """Raised when upstream API (AniList, Wibu) returns an error."""

    def __init__(self, service: str, message: str):
        super().__init__(
            f"{service} API error: {message}",
            status_code=502,
            detail={"service": service, "error": message},
        )


class DataNotFoundError(AnibingeException):
    """Raised when requested data is not found."""

    def __init__(self, resource: str, identifier: str):
        super().__init__(
            f"{resource} not found: {identifier}",
            status_code=404,
            detail={"resource": resource, "identifier": identifier},
        )


class ValidationError(AnibingeException):
    """Raised when input validation fails."""

    def __init__(self, field: str, message: str):
        super().__init__(
            f"Validation error in {field}: {message}",
            status_code=400,
            detail={"field": field, "message": message},
        )


async def anibinge_exception_handler(request: Request, exc: AnibingeException) -> JSONResponse:
    """Handle Anibinge exceptions."""
    logger.error(
        f"{exc.__class__.__name__} on {request.url.path}: {exc.message}",
        extra={"detail": exc.detail},
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            "error": exc.detail,
        },
    )
