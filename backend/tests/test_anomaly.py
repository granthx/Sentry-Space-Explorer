"""Tests for the Spacecraft Anomaly Detection service and router."""

from __future__ import annotations

import csv
import pathlib
import tempfile

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.anomaly import (
    ALL_DATASETS,
    KNOWN_CHANNELS,
    WINDOW,
    _build_windows,
    _compute_errors,
    _expand_flags,
    _severity,
    detect,
)


# ---------------------------------------------------------------------------
# Unit: signal processing helpers
# ---------------------------------------------------------------------------

class TestBuildWindows:
    def test_basic_shape(self):
        values = np.arange(100, dtype=np.float32)
        windows = _build_windows(values)
        assert windows.ndim == 2
        assert windows.shape[1] == WINDOW

    def test_short_signal_returns_one_window(self):
        values = np.zeros(10, dtype=np.float32)
        windows = _build_windows(values)
        assert windows.shape[0] >= 1
        assert windows.shape[1] == WINDOW

    def test_empty_signal_returns_zero_window(self):
        values = np.array([], dtype=np.float32)
        windows = _build_windows(values)
        assert windows.shape == (1, WINDOW)


class TestComputeErrors:
    def test_returns_float32_array(self):
        values = np.random.default_rng(1).standard_normal(100).astype(np.float32)
        windows = _build_windows(values)
        errors = _compute_errors(windows)
        assert errors.dtype == np.float32

    def test_errors_non_negative(self):
        values = np.ones(100, dtype=np.float32)
        windows = _build_windows(values)
        errors = _compute_errors(windows)
        assert np.all(errors >= 0)

    def test_shape_matches_windows(self):
        values = np.random.default_rng(2).standard_normal(200).astype(np.float32)
        windows = _build_windows(values)
        errors = _compute_errors(windows)
        assert errors.shape == (windows.shape[0],)


class TestExpandFlags:
    def test_length_matches_n_samples(self):
        flags = np.array([True, False, True], dtype=bool)
        result = _expand_flags(flags, 80)
        assert len(result) == 80

    def test_anomaly_flag_propagates(self):
        flags = np.array([True, False], dtype=bool)
        result = _expand_flags(flags, 50)
        # first window (True) should mark some samples
        assert any(result)

    def test_all_false(self):
        flags = np.zeros(5, dtype=bool)
        result = _expand_flags(flags, 100)
        assert not any(result)


class TestSeverity:
    def test_zero_is_none(self):  assert _severity(0.0)  == "none"
    def test_low(self):           assert _severity(0.03)  == "low"
    def test_medium(self):        assert _severity(0.10)  == "medium"
    def test_high(self):          assert _severity(0.25)  == "high"


# ---------------------------------------------------------------------------
# Integration: HTTP routes
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestAnomalyRouter:
    def test_channels_endpoint(self, client):
        resp = client.get("/api/anomaly/channels")
        assert resp.status_code == 200
        data = resp.json()
        assert "datasets" in data
        assert "smap" in data["datasets"]
        assert "msl"  in data["datasets"]

    def test_detect_smap_t1(self, client):
        resp = client.get("/api/anomaly/detect?dataset=smap&channel=T-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dataset"] == "smap"
        assert data["channel"] == "T-1"
        assert data["n_samples"] > 0
        assert "anomaly_count" in data
        assert "anomaly_rate" in data
        assert 0.0 <= data["anomaly_rate"] <= 1.0
        assert "severity" in data
        assert data["severity"] in ("none", "low", "medium", "high")
        assert "errors" in data
        assert "anomaly_flags" in data
        assert "threshold" in data

    def test_detect_msl_m1(self, client):
        resp = client.get("/api/anomaly/detect?dataset=msl&channel=M-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dataset"] == "msl"

    def test_detect_all_smap_channels(self, client):
        for ch in KNOWN_CHANNELS["smap"]:
            resp = client.get(f"/api/anomaly/detect?dataset=smap&channel={ch}")
            assert resp.status_code == 200, f"Failed for smap/{ch}"

    def test_detect_all_msl_channels(self, client):
        for ch in KNOWN_CHANNELS["msl"]:
            resp = client.get(f"/api/anomaly/detect?dataset=msl&channel={ch}")
            assert resp.status_code == 200, f"Failed for msl/{ch}"

    def test_detect_unknown_dataset(self, client):
        resp = client.get("/api/anomaly/detect?dataset=unknown&channel=T-1")
        assert resp.status_code == 422

    def test_detect_unknown_channel(self, client):
        resp = client.get("/api/anomaly/detect?dataset=smap&channel=FAKE-99")
        assert resp.status_code == 422

    def test_errors_list_length(self, client):
        resp = client.get("/api/anomaly/detect?dataset=smap&channel=T-2")
        assert resp.status_code == 200
        data = resp.json()
        # errors and flags must be same length
        assert len(data["errors"]) == len(data["anomaly_flags"])

    def test_timestamps_present(self, client):
        resp = client.get("/api/anomaly/detect?dataset=smap&channel=T-3")
        assert resp.status_code == 200
        data = resp.json()
        assert "timestamps" in data
        assert len(data["timestamps"]) > 0

