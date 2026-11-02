"""Generate stub ONNX models for all three ML modules.

This script produces:
  backend/app/ml/exoplanet_model.onnx   -- 1-D classifier (Kepler transits)
  backend/app/ml/terrain_model.onnx     -- Convolutional segmentation (AI4Mars)
  backend/app/ml/anomaly_model.onnx     -- Autoencoder reconstructor (SMAP telemetry)

Each model is a valid, architecturally correct ONNX graph with ir_version <= 13
compatible with standard ONNX Runtime.
Run with:  python backend/scripts/generate_models.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

ROOT = Path(__file__).resolve().parents[2]
ML_DIR = ROOT / "backend" / "app" / "ml"
ML_DIR.mkdir(parents=True, exist_ok=True)


def _save(model: onnx.ModelProto, name: str) -> None:
    path = ML_DIR / f"{name}.onnx"
    with open(path, "wb") as f:
        f.write(model.SerializeToString())
    size_kb = path.stat().st_size // 1024
    print(f"  saved {path.name}  ({size_kb} KB)")


# ---------------------------------------------------------------------------
# 1. Exoplanet transit model (178 flux bins -> [P(FP), P(Planet)])
# ---------------------------------------------------------------------------

def build_exoplanet() -> None:
    print("Building exoplanet_model.onnx …")
    W1 = np.zeros((178, 16), dtype=np.float32)
    mid = 178 // 2
    # React to negative transit dips in the center
    W1[mid - 10 : mid + 10, :] = -500.0
    b1 = np.full(16, -1.0, dtype=np.float32)

    W2 = np.zeros((16, 2), dtype=np.float32)
    W2[:, 0] = -1.0  # decrease false positive
    W2[:, 1] = 2.0   # increase planet probability
    b2 = np.array([1.5, -1.5], dtype=np.float32)  # default bias: false positive

    initializers = [
        numpy_helper.from_array(W1, "W1"),
        numpy_helper.from_array(b1, "b1"),
        numpy_helper.from_array(W2, "W2"),
        numpy_helper.from_array(b2, "b2"),
    ]
    nodes = [
        helper.make_node("Gemm", ["input", "W1", "b1"], ["h1"], alpha=1.0, beta=1.0),
        helper.make_node("Relu", ["h1"], ["r1"]),
        helper.make_node("Gemm", ["r1", "W2", "b2"], ["logits"], alpha=1.0, beta=1.0),
        helper.make_node("Softmax", ["logits"], ["output"], axis=1),
    ]
    graph = helper.make_graph(
        nodes,
        "exoplanet",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 178])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, 2])],
        initializers,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    _save(model, "exoplanet_model")


# ---------------------------------------------------------------------------
# 2. Terrain segmentation model (3 x 64 x 64 -> 4 x 64 x 64 classes)
# ---------------------------------------------------------------------------

def build_terrain() -> None:
    print("Building terrain_model.onnx …")
    model_size = 64
    # Conv 1: 3 -> 4 channels (1x1 conv)
    W1 = np.zeros((4, 3, 1, 1), dtype=np.float32)
    W1[0, :, 0, 0] = 1.0 / 3.0  # brightness
    W1[1, 0, 0, 0] = 0.5        # red-heavy
    W1[2, 1, 0, 0] = 0.5        # green
    W1[3, 2, 0, 0] = 0.5        # blue
    B1 = np.zeros(4, dtype=np.float32)

    # Conv 2: 4 -> 4 classes
    # 0: soil, 1: bedrock, 2: sand, 3: big rock
    W2 = np.zeros((4, 4, 1, 1), dtype=np.float32)
    B2 = np.zeros(4, dtype=np.float32)

    B2[0] = 0.4
    B2[1] = 0.2
    # sand: favored by high brightness
    W2[2, 0, 0, 0] = 2.0
    B2[2] = -0.5
    # big rock: favored by low brightness (dark shadows / boulders)
    W2[3, 0, 0, 0] = -2.5
    B2[3] = 0.8

    initializers = [
        numpy_helper.from_array(W1, "w1"),
        numpy_helper.from_array(B1, "b1"),
        numpy_helper.from_array(W2, "w2"),
        numpy_helper.from_array(B2, "b2"),
    ]
    nodes = [
        helper.make_node("Conv", ["input", "w1", "b1"], ["conv1"], kernel_shape=[1, 1]),
        helper.make_node("Relu", ["conv1"], ["relu1"]),
        helper.make_node("Conv", ["relu1", "w2", "b2"], ["output"], kernel_shape=[1, 1]),
    ]
    graph = helper.make_graph(
        nodes,
        "terrain",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 3, model_size, model_size])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, 4, model_size, model_size])],
        initializers,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    _save(model, "terrain_model")


# ---------------------------------------------------------------------------
# 3. Anomaly autoencoder model (25 -> 8 -> 25 reconstruction)
# ---------------------------------------------------------------------------

def build_anomaly() -> None:
    print("Building anomaly_model.onnx …")
    n_in = 25
    n_lat = 8

    # Encoder basis projection
    t = np.linspace(0, 1, n_in)
    W_enc = np.zeros((n_in, n_lat), dtype=np.float32)
    for k in range(n_lat):
        basis = np.cos(k * np.pi * t).astype(np.float32)
        W_enc[:, k] = basis / np.sqrt(n_in)
    b_enc = np.zeros(n_lat, dtype=np.float32)

    # Decoder reconstruction
    W_dec = W_enc.T.copy()
    b_dec = np.zeros(n_in, dtype=np.float32)

    initializers = [
        numpy_helper.from_array(W_enc, "W_enc"),
        numpy_helper.from_array(b_enc, "b_enc"),
        numpy_helper.from_array(W_dec, "W_dec"),
        numpy_helper.from_array(b_dec, "b_dec"),
    ]
    nodes = [
        helper.make_node("Gemm", ["input", "W_enc", "b_enc"], ["latent"], alpha=1.0, beta=1.0),
        helper.make_node("Gemm", ["latent", "W_dec", "b_dec"], ["output"], alpha=1.0, beta=1.0),
    ]
    graph = helper.make_graph(
        nodes,
        "anomaly_ae",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, n_in])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, n_in])],
        initializers,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    _save(model, "anomaly_model")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    build_exoplanet()
    build_terrain()
    build_anomaly()
    print("Done.")
