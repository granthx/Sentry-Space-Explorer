"""Lightweight ONNX model loader shared across all ML modules.

Each module calls ``load_session`` once at startup (or on first request) and
caches the result.  Inference is synchronous inside a thread-pool so it never
blocks the async event loop.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import numpy as np

_SESSION_CACHE: dict[str, Any] = {}
_LOCK = threading.Lock()

# Resolve the directory that holds .onnx files relative to this file.
MODELS_DIR = Path(__file__).parent


def load_session(model_name: str) -> Any:
    """Return a cached ONNX InferenceSession for *model_name*.onnx.

    Raises ``FileNotFoundError`` if the model file is absent.
    Raises ``RuntimeError`` if ``onnxruntime`` is not installed.
    """
    with _LOCK:
        if model_name in _SESSION_CACHE:
            return _SESSION_CACHE[model_name]

        model_path = MODELS_DIR / f"{model_name}.onnx"
        if not model_path.exists():
            raise FileNotFoundError(
                f"ONNX model not found: {model_path}. "
                "Run the training script to generate it first."
            )

        try:
            import onnxruntime as ort  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                "onnxruntime is not installed. Add it to requirements.txt."
            ) from exc

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        session = ort.InferenceSession(str(model_path), opts)
        _SESSION_CACHE[model_name] = session
        return session


def run_inference(session: Any, input_array: np.ndarray) -> np.ndarray:
    """Run a single forward pass and return the first output as a numpy array."""
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_array.astype(np.float32)})
    return np.array(outputs[0])

