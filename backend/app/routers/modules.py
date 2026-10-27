from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..modules import CURRENT_PHASE, MODULES

router = APIRouter(tags=["modules"])


@router.get("/modules", summary="The project's modules and their build status")
async def list_modules() -> dict[str, Any]:
    return {"phase": CURRENT_PHASE, "modules": MODULES}
