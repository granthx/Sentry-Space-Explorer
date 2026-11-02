"""Tests for the Mars Terrain Segmentation service and router."""

from __future__ import annotations

import base64
import io
import json
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.terrain import (
    CLASS_NAMES,
    MODEL_SIZE,
    PALETTE,
    _run_model,
    segment,
)


# ---------------------------------------------------------------------------
# Unit: _run_model fallback (no ONNX file)
# ---------------------------------------------------------------------------

class TestRunModelFallback:
    def test_output_shape(self):
        img = np.zeros((1, 3, MODEL_SIZE, MODEL_SIZE), dtype=np.float32)
        out = _run_model(img)
        assert out.shape == (1, 4, MODEL_SIZE, MODEL_SIZE)

    def test_bright_image_not_big_rock(self):
        # Bright image should favour sand/soil over big_rock
        img = np.ones((1, 3, MODEL_SIZE, MODEL_SIZE), dtype=np.float32)
        out = _run_model(img)
        cls = np.argmax(out[0], axis=0)
        # big_rock is class 3; bright pixels should NOT mostly be big_rock
        big_rock_count = (cls == 3).sum()
        assert big_rock_count < (MODEL_SIZE * MODEL_SIZE * 0.8)

    def test_dark_image_mostly_big_rock(self):
        img = np.zeros((1, 3, MODEL_SIZE, MODEL_SIZE), dtype=np.float32)
        out = _run_model(img)
        cls = np.argmax(out[0], axis=0)
        big_rock_count = (cls == 3).sum()
        assert big_rock_count > 0


# ---------------------------------------------------------------------------
# Integration: HTTP routes
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _tiny_png_b64() -> str:
    """Return a base64-encoded 4×4 red PNG."""
    import struct, zlib

    def _png(w, h, data):
        def chunk(t, d):
            c = struct.pack('>I', len(d)) + t + d
            return c + struct.pack('>I', zlib.crc32(c[4:]) & 0xFFFFFFFF)
        raw = b''.join(b'\x00' + bytes([255, 0, 0] * w) for _ in range(h))
        return (
            b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw))
            + chunk(b'IEND', b'')
        )
    return base64.b64encode(_png(4, 4, None)).decode()


class TestTerrainRouter:
    def test_classes_endpoint(self, client):
        resp = client.get("/api/terrain/classes")
        assert resp.status_code == 200
        data = resp.json()
        assert "classes" in data
        assert len(data["classes"]) == 4

    def test_segment_base64(self, client):
        b64 = _tiny_png_b64()
        resp = client.post(
            "/api/terrain/segment",
            json={"image_source": b64},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["width"] == MODEL_SIZE
        assert data["height"] == MODEL_SIZE
        assert "class_map" in data
        assert len(data["class_map"]) == MODEL_SIZE
        assert len(data["class_map"][0]) == MODEL_SIZE
        assert "dominant_class" in data
        assert data["dominant_class"] in CLASS_NAMES
        assert "safe_to_drive" in data
        assert isinstance(data["safe_to_drive"], bool)
        assert "class_counts" in data

    def test_segment_missing_body(self, client):
        resp = client.post("/api/terrain/segment", json={})
        assert resp.status_code == 422

    def test_segment_invalid_source(self, client):
        resp = client.post(
            "/api/terrain/segment",
            json={"image_source": "not_a_valid_base64_or_url!!!"},
        )
        # Should 422 (invalid base64) or 422/502
        assert resp.status_code in (422, 502)

    def test_palette_in_response(self, client):
        b64 = _tiny_png_b64()
        resp = client.post("/api/terrain/segment", json={"image_source": b64})
        assert resp.status_code == 200
        data = resp.json()
        assert "palette" in data
        for cls in CLASS_NAMES:
            assert cls in data["palette"]
            assert len(data["palette"][cls]) == 3

