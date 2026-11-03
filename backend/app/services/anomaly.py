"""Spacecraft anomaly detection service.

Loads a named sensor channel (CSV from backend/app/ml/anomaly_data/),
normalises the values into sliding windows, reconstructs each window using an
LSTM-style autoencoder (via ONNX), and flags timesteps whose reconstruction
error exceeds a trained threshold as anomalies.

API shape returned by ``detect``:
  {
    "dataset": str,
    "channel": str,
    "n_samples": int,
    "anomaly_count": int,
    "anomaly_rate": float,
    "threshold": float,
    "errors": [float, …],       # per-window reconstruction error
    "anomaly_flags": [bool, …], # True = anomaly
    "timestamps": [str, …],     # ISO-formatted or index strings
    "severity": "none" | "low" | "medium" | "high",
  }
"""

from __future__ import annotations

import asyncio
import csv
import io
from pathlib import Path
from typing import Any

import numpy as np

from ..errors import ApiError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DATA_DIR = Path(__file__).parent.parent / "ml" / "anomaly_data"
WINDOW = 25   # time-steps per LSTM window
STEP   = 5    # stride between windows

# Known channels per dataset (what we've bundled)
KNOWN_CHANNELS: dict[str, list[str]] = {
    "smap":  ["T-1", "T-2", "T-3", "D-14", "F-4"],
    "msl":   ["M-1", "M-2", "M-6", "S-2",  "P-15"],
}

ALL_DATASETS = list(KNOWN_CHANNELS.keys())


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_channel_csv(dataset: str, channel: str) -> tuple[list[float], list[str]]:
    """Read a bundled CSV and return (values, timestamps)."""
    safe_channel = channel.replace("/", "_").replace("\\", "_")
    path = DATA_DIR / dataset / f"{safe_channel}.csv"
    if not path.exists():
        raise ApiError(
            404,
            f"Channel '{channel}' not found for dataset '{dataset}'. "
            f"Available: {', '.join(KNOWN_CHANNELS.get(dataset, []))}",
        )

    values: list[float] = []
    timestamps: list[str] = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                values.append(float(row.get("value", row.get("val", 0.0))))
                timestamps.append(str(row.get("timestamp", row.get("time", len(values)))))
            except (ValueError, KeyError):
                continue

    if not values:
        raise ApiError(422, f"CSV for channel '{channel}' is empty or unreadable.")
    return values, timestamps


# ---------------------------------------------------------------------------
# Windowed inference
# ---------------------------------------------------------------------------

def _build_windows(values: np.ndarray) -> np.ndarray:
    """Slide a window over the 1-D signal. Returns shape [N_windows, WINDOW]."""
    windows = []
    for start in range(0, len(values) - WINDOW + 1, STEP):
        windows.append(values[start: start + WINDOW])
    if not windows:
        windows.append(np.zeros(WINDOW, dtype=np.float32))
    return np.stack(windows).astype(np.float32)


def _compute_errors(windows: np.ndarray) -> np.ndarray:
    """Run reconstruction via ONNX autoencoder. Returns per-window MSE."""
    try:
        from ..ml.runtime import load_session, run_inference

        session = load_session("anomaly_model")
        reconstructed = run_inference(session, windows)          # [N, WINDOW]
        errors = np.mean((windows - reconstructed) ** 2, axis=1)
        return errors.astype(np.float32)
    except FileNotFoundError:
        # Fallback heuristic: local variance as proxy anomaly score
        local_var = np.var(windows, axis=1)
        return local_var.astype(np.float32)


def _expand_flags(flags: np.ndarray, n_samples: int) -> list[bool]:
    """Expand per-window flags back to per-sample resolution."""
    sample_flags = [False] * n_samples
    for i, flag in enumerate(flags):
        start = i * STEP
        for j in range(start, min(start + WINDOW, n_samples)):
            if flag:
                sample_flags[j] = True
    return sample_flags


def _severity(rate: float) -> str:
    if rate == 0.0:
        return "none"
    if rate < 0.05:
        return "low"
    if rate < 0.20:
        return "medium"
    return "high"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def detect(dataset: str, channel: str) -> dict[str, Any]:
    """Detect anomalies in a named SMAP / MSL sensor channel."""
    dataset = dataset.lower().strip()
    if dataset not in KNOWN_CHANNELS:
        raise ApiError(422, f"Unknown dataset '{dataset}'. Choose from: {', '.join(ALL_DATASETS)}.")

    # Validate channel name is in known list for that dataset
    known = KNOWN_CHANNELS[dataset]
    if channel not in known:
        raise ApiError(
            422,
            f"Channel '{channel}' not available for dataset '{dataset}'. "
            f"Available channels: {', '.join(known)}",
        )

    loop = asyncio.get_running_loop()

    # Load CSV in thread pool (blocking I/O)
    raw_values, timestamps = await loop.run_in_executor(None, _load_channel_csv, dataset, channel)
    n_samples = len(raw_values)

    values = np.array(raw_values, dtype=np.float32)

    # Normalise to zero-mean unit-variance
    mu, sigma = float(values.mean()), float(values.std())
    if sigma < 1e-8:
        sigma = 1.0
    values_norm = (values - mu) / sigma

    # Build windows and run inference in thread pool
    windows = _build_windows(values_norm)
    errors = await loop.run_in_executor(None, _compute_errors, windows)

    # Threshold at 95th percentile of reconstruction errors
    threshold = float(np.percentile(errors, 95))
    anomaly_window_flags = errors > threshold

    # Expand back to sample-level
    sample_flags = _expand_flags(anomaly_window_flags, n_samples)
    anomaly_count = sum(sample_flags)
    anomaly_rate = round(anomaly_count / n_samples, 4) if n_samples else 0.0

    # Per-window errors aligned to their window start timestamps
    window_timestamps = []
    for i in range(len(errors)):
        start_idx = min(i * STEP, n_samples - 1)
        window_timestamps.append(timestamps[start_idx])

    return {
        "dataset": dataset,
        "channel": channel,
        "n_samples": n_samples,
        "anomaly_count": anomaly_count,
        "anomaly_rate": anomaly_rate,
        "threshold": round(threshold, 6),
        "errors": [round(float(e), 6) for e in errors],
        "anomaly_flags": anomaly_window_flags.tolist(),
        "timestamps": window_timestamps,
        "severity": _severity(anomaly_rate),
    }

