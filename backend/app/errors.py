"""One error shape for the whole API:  {"error": {"status": 422, "message": "..."}}"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Raise this anywhere in the backend to return a clean JSON error."""

    def __init__(self, status_code: int, message: str, *, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.headers = headers or {}


def error_body(status: int, message: str) -> dict:
    return {"error": {"status": status, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.status_code, exc.message),
            status_code=exc.status_code,
            headers=exc.headers or None,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}
        where = ".".join(str(p) for p in first.get("loc", ()) if p not in ("query", "path", "body"))
        message = first.get("msg", "Invalid request")
        text = f"{where}: {message}" if where else message
        return JSONResponse(error_body(422, text), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(error_body(exc.status_code, str(exc.detail)), status_code=exc.status_code)
