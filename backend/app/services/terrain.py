"""Mars terrain segmentation service.

Accepts a Mars surface image (URL or base-64 PNG/JPEG), resizes it to 64 × 64,
and runs a pixel-wise segmentation model that labels each pixel as one of four
terrain classes: soil, bedrock, sand, or big rock.

API shape returned by ``segment``:
  {
    "width": int,          # output mask width (always 64)
    "height": int,         # output mask height (always 64)
    "class_map": [[int, …], …],   # 64×64 grid of class indices 0-3
    "class_counts": {"soil": int, "bedrock": int, "sand": int, "big_rock": int},
    "dominant_class": str,
    "safe_to_drive": bool,  # True when soil+bedrock dominate (>60 %)
    "palette": {str: [int, int, int]},  # RGB colours for overlay
  }
"""

from __future__ import annotations

import asyncio
import base64
import io
from typing import Any

import httpx
import numpy as np

from ..errors import ApiError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MODEL_SIZE = 64        # both spatial dims fed to the model
CLASS_NAMES = ["soil", "bedrock", "sand", "big_rock"]
# Palette mirrors the AI4Mars dataset colour convention
PALETTE: dict[str, list[int]] = {
    "soil":     [222, 184, 135],   # burlywood
    "bedrock":  [139, 125, 107],   # warm grey
    "sand":     [210, 180, 140],   # tan
    "big_rock": [105,  92,  78],   # dark warm brown
}


# ---------------------------------------------------------------------------
# Image helpers (pure numpy, no PIL dependency at import time)
# ---------------------------------------------------------------------------

def _decode_image(data: bytes) -> np.ndarray:
    """Decode JPEG/PNG bytes → float32 array [3, MODEL_SIZE, MODEL_SIZE]."""
    try:
        from PIL import Image  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError("Pillow is required for terrain segmentation.") from exc

    try:
        img = Image.open(io.BytesIO(data)).convert("RGB").resize(
            (MODEL_SIZE, MODEL_SIZE), Image.BILINEAR
        )
    except Exception as exc:
        raise ApiError(422, "Unable to decode image. Ensure valid image data or URL.") from exc
    arr = np.array(img, dtype=np.float32) / 255.0  # H×W×3
    return arr.transpose(2, 0, 1)[np.newaxis]      # 1×3×H×W


async def _load_image_bytes(source: str, client: httpx.AsyncClient) -> bytes:
    """Accept a URL or a data-URI / raw base-64 string."""
    if source.startswith("data:"):
        # data:image/jpeg;base64,<payload>
        _, encoded = source.split(",", 1)
        return base64.b64decode(encoded)
    if source.startswith("http://") or source.startswith("https://"):
        try:
            resp = await client.get(source, timeout=10.0)
            resp.raise_for_status()
            return resp.content
        except httpx.HTTPError as exc:
            raise ApiError(502, f"Failed to fetch image: {exc}") from exc
    # Treat as raw base-64
    try:
        return base64.b64decode(source)
    except Exception as exc:
        raise ApiError(422, "image_source must be a URL or base-64 encoded image.") from exc


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def _run_model(img_tensor: np.ndarray) -> np.ndarray:
    """Run ONNX segmentation model. Returns logits [1, 4, H, W]."""
    try:
        from ..ml.runtime import load_session, run_inference

        session = load_session("terrain_model")
        return run_inference(session, img_tensor)
    except FileNotFoundError:
        # Fallback: brightness-based heuristic segmentation
        # img_tensor: 1×3×H×W, values 0-1
        gray = img_tensor[0].mean(axis=0)  # H×W
        logits = np.zeros((1, 4, MODEL_SIZE, MODEL_SIZE), dtype=np.float32)
        # bright → sand, dark → big_rock, mid-low → bedrock, mid-high → soil
        logits[0, 0] = (gray - 0.45).clip(0)                  # soil
        logits[0, 1] = (0.55 - np.abs(gray - 0.35)).clip(0)   # bedrock
        logits[0, 2] = (gray - 0.55).clip(0)                  # sand
        logits[0, 3] = (0.4 - gray).clip(0)                   # big_rock
        return logits


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def segment(image_source: str, http: httpx.AsyncClient) -> dict[str, Any]:
    """Segment a Mars image and return per-pixel class labels."""
    if not image_source or not image_source.strip():
        raise ApiError(422, "image_source is required.")

    image_bytes = await _load_image_bytes(image_source.strip(), http)

    loop = asyncio.get_running_loop()

    # Decode + preprocess in thread pool (PIL I/O is blocking)
    img_tensor = await loop.run_in_executor(None, _decode_image, image_bytes)

    # Inference in thread pool
    logits = await loop.run_in_executor(None, _run_model, img_tensor)

    # Argmax over class axis → [H, W] class index map
    class_map = np.argmax(logits[0], axis=0).astype(int)  # 4×H×W → H×W

    counts = {name: int(np.sum(class_map == i)) for i, name in enumerate(CLASS_NAMES)}
    total_pixels = MODEL_SIZE * MODEL_SIZE
    dominant = max(counts, key=lambda k: counts[k])

    safe_pixels = counts["soil"] + counts["bedrock"]
    safe_to_drive = (safe_pixels / total_pixels) > 0.60

    return {
        "width": MODEL_SIZE,
        "height": MODEL_SIZE,
        "class_map": class_map.tolist(),
        "class_counts": counts,
        "dominant_class": dominant,
        "safe_to_drive": safe_to_drive,
        "palette": PALETTE,
    }

