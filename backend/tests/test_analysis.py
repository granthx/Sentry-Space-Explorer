"""Unit tests for Mars Data Lab analysis services and /api/lab routes."""

from __future__ import annotations

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.errors import ApiError
from app.services import analysis
from app.services.analysis import compare, photos_series, rover_stats


@pytest.fixture
def sample_manifest() -> dict:
    return {
        "name": "TestRover",
        "landing_date": "2020-01-01",
        "status": "active",
        "max_sol": 10,
        "photos": [
            {"sol": 1, "earth_date": "2020-01-02", "total_photos": 10, "cameras": ["FHAZ", "NAVCAM"]},
            {"sol": 3, "earth_date": "2020-01-04", "total_photos": 30, "cameras": ["NAVCAM"]},
            {"sol": 4, "earth_date": "2020-01-05", "total_photos": 20, "cameras": ["FHAZ", "MAST"]},
            {"sol": 8, "earth_date": "2020-01-09", "total_photos": 40, "cameras": ["MAST"]},
            {"sol": 10, "earth_date": "2020-01-11", "total_photos": 20, "cameras": ["NAVCAM"]},
        ],
    }


def test_hand_computed_curiosity_manifest():
    """Verify statistics match hand-calculated numbers from the offline curiosity manifest."""
    manifest = analysis.load_local_manifest("curiosity")
    stats = rover_stats(manifest)

    assert stats["rover"] == "curiosity"
    assert stats["name"] == "Curiosity"
    assert stats["status"] == "active"
    assert stats["max_sol"] == 4100
    assert stats["total_photos"] == 697570
    assert stats["active_sols"] == 3566
    assert stats["quiet_sols"] == 4100 + 1 - 3566
    assert stats["activity_rate"] == round(3566 / 4101, 4)
    assert stats["avg_photos_per_active_sol"] == round(697570 / 3566, 2)
    assert len(stats["busiest_sols"]) == 10
    assert stats["busiest_sols"][0]["sol"] == 3905
    assert stats["busiest_sols"][0]["total_photos"] == 2973
    assert len(stats["longest_gaps"]) <= 5
    assert len(stats["camera_sols"]) > 0


def test_hand_built_manifest_exact_math(sample_manifest):
    """Assert all calculations exactly match hand-calculated values."""
    stats = rover_stats(sample_manifest)

    # 10 + 30 + 20 + 40 + 20 = 120
    assert stats["total_photos"] == 120
    assert stats["active_sols"] == 5
    assert stats["max_sol"] == 10
    # mission sols = 11 (0..10), quiet = 11 - 5 = 6
    assert stats["quiet_sols"] == 6
    assert stats["activity_rate"] == round(5 / 11, 4)
    assert stats["avg_photos_per_active_sol"] == 24.0  # 120 / 5
    # counts: [10, 20, 20, 30, 40] -> median is 20.0
    assert stats["median_photos_per_active_sol"] == 20.0

    # Busiest sols order: 40 (sol 8), 30 (sol 3), 20 (sol 4), 20 (sol 10), 10 (sol 1)
    busiest = stats["busiest_sols"]
    assert len(busiest) == 5
    assert busiest[0]["sol"] == 8 and busiest[0]["total_photos"] == 40
    assert busiest[1]["sol"] == 3 and busiest[1]["total_photos"] == 30
    assert busiest[2]["sol"] == 4 and busiest[2]["total_photos"] == 20
    assert busiest[3]["sol"] == 10 and busiest[3]["total_photos"] == 20
    assert busiest[4]["sol"] == 1 and busiest[4]["total_photos"] == 10

    # Consecutive active sols: 1, 3, 4, 8, 10
    # Gaps:
    # 1 -> 3: length = 1
    # 3 -> 4: length = 0 (skipped)
    # 4 -> 8: length = 3
    # 8 -> 10: length = 1
    # Sorted: len 3 from 4; len 1 from 1; len 1 from 8
    gaps = stats["longest_gaps"]
    assert len(gaps) == 3
    assert gaps[0] == {"from_sol": 4, "to_sol": 8, "length_sols": 3}
    assert gaps[1] == {"from_sol": 1, "to_sol": 3, "length_sols": 1}
    assert gaps[2] == {"from_sol": 8, "to_sol": 10, "length_sols": 1}

    # Cameras:
    # NAVCAM: sols 1, 3, 10 -> 3 sols (share 3/5 = 0.6)
    # FHAZ: sols 1, 4 -> 2 sols (share 2/5 = 0.4)
    # MAST: sols 4, 8 -> 2 sols (share 2/5 = 0.4)
    cams = stats["camera_sols"]
    assert len(cams) == 3
    assert cams[0] == {"camera": "NAVCAM", "sols_used": 3, "share": 0.6}
    # Ties between FHAZ and MAST broken alphabetically
    assert cams[1] == {"camera": "FHAZ", "sols_used": 2, "share": 0.4}
    assert cams[2] == {"camera": "MAST", "sols_used": 2, "share": 0.4}


def test_edge_case_zero_active_sols():
    manifest = {
        "name": "QuietRover",
        "landing_date": "2020-01-01",
        "status": "retired",
        "max_sol": 5,
        "photos": [
            {"sol": 0, "total_photos": 0, "cameras": []},
            {"sol": 1, "total_photos": 0, "cameras": []},
        ],
    }
    stats = rover_stats(manifest)
    assert stats["total_photos"] == 0
    assert stats["active_sols"] == 0
    assert stats["quiet_sols"] == 6
    assert stats["activity_rate"] == 0.0
    assert stats["avg_photos_per_active_sol"] == 0.0
    assert stats["median_photos_per_active_sol"] == 0.0
    assert stats["busiest_sols"] == []
    assert stats["longest_gaps"] == []
    assert stats["camera_sols"] == []


def test_edge_case_single_active_sol():
    manifest = {
        "name": "OneShotRover",
        "landing_date": "2020-01-01",
        "status": "active",
        "max_sol": 5,
        "photos": [
            {"sol": 3, "total_photos": 15, "cameras": ["PANCAM"]},
        ],
    }
    stats = rover_stats(manifest)
    assert stats["active_sols"] == 1
    assert stats["total_photos"] == 15
    assert stats["quiet_sols"] == 5
    assert stats["longest_gaps"] == []  # Single active sol cannot have a gap between active sols
    assert stats["camera_sols"] == [{"camera": "PANCAM", "sols_used": 1, "share": 1.0}]


def test_photos_series_bucketing(sample_manifest):
    # bucket=5 on max_sol 10 produces 3 buckets: [0..4], [5..9], [10..10]
    series = photos_series(sample_manifest, bucket=5)
    assert len(series) == 3

    # Bucket 0: sols 0..4 (span 5). Active: sol 1 (10), sol 3 (30), sol 4 (20) -> 60 photos, 3 active
    assert series[0] == {
        "start_sol": 0,
        "end_sol": 4,
        "photos": 60,
        "active_sols": 3,
        "avg_per_sol": 12.0,
    }

    # Bucket 1: sols 5..9 (span 5). Active: sol 8 (40) -> 40 photos, 1 active
    assert series[1] == {
        "start_sol": 5,
        "end_sol": 9,
        "photos": 40,
        "active_sols": 1,
        "avg_per_sol": 8.0,
    }

    # Bucket 2: sols 10..10 (span 1). Active: sol 10 (20) -> 20 photos, 1 active
    assert series[2] == {
        "start_sol": 10,
        "end_sol": 10,
        "photos": 20,
        "active_sols": 1,
        "avg_per_sol": 20.0,
    }

    # Invalid bucket size
    with pytest.raises(ApiError) as exc_info:
        photos_series(sample_manifest, bucket=0)
    assert exc_info.value.status_code == 422


def test_compare_same_age_omission():
    rover_a = {
        "name": "ShortRover",
        "status": "complete",
        "max_sol": 200,
        "photos": [
            {"sol": 50, "total_photos": 100, "cameras": ["A"]},
            {"sol": 100, "total_photos": 150, "cameras": ["A"]},
        ],
    }
    rover_b = {
        "name": "LongRover",
        "status": "active",
        "max_sol": 2000,
        "photos": [
            {"sol": 50, "total_photos": 200, "cameras": ["B"]},
            {"sol": 100, "total_photos": 300, "cameras": ["B"]},
            {"sol": 500, "total_photos": 400, "cameras": ["B"]},
        ],
    }

    result = compare({"short": rover_a, "long": rover_b})
    same_age = result["same_age"]

    # Milestone 50 should have both
    assert 50 in same_age
    assert same_age[50] == {"shortrover": 100, "longrover": 200}

    # Milestone 100 should have both cumulative
    assert 100 in same_age
    assert same_age[100] == {"shortrover": 250, "longrover": 500}

    # Milestone 500 should omit ShortRover because its max_sol is only 200
    assert 500 in same_age
    assert "shortrover" not in same_age[500]
    assert same_age[500]["longrover"] == 900


# ---------------- Router Tests ----------------

def test_api_lab_overview(api):
    resp = api.http.get("/api/lab/overview")
    assert resp.status_code == 200
    body = resp.json()
    assert "rovers" in body
    assert "errors" in body
    assert len(body["rovers"]) == 4
    rover_slugs = {r["rover"] for r in body["rovers"]}
    assert rover_slugs == {"curiosity", "perseverance", "opportunity", "spirit"}


def test_api_lab_rover_stats(api):
    resp = api.http.get("/api/lab/rovers/curiosity/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rover"] == "curiosity"
    assert body["max_sol"] == 4100
    assert body["total_photos"] == 697570

    # Unknown rover -> 422
    err_resp = api.http.get("/api/lab/rovers/voyager/stats")
    assert err_resp.status_code == 422
    assert "Unknown rover 'voyager'" in err_resp.json()["error"]["message"]


def test_api_lab_rover_series(api):
    resp = api.http.get("/api/lab/rovers/perseverance/series?bucket=100")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) > 0
    assert body[0]["start_sol"] == 0

    # Bucket bounds check (5..500)
    resp_low = api.http.get("/api/lab/rovers/perseverance/series?bucket=2")
    assert resp_low.status_code == 422

    resp_high = api.http.get("/api/lab/rovers/perseverance/series?bucket=999")
    assert resp_high.status_code == 422


def test_api_lab_compare(api):
    resp = api.http.get("/api/lab/compare?rovers=curiosity,perseverance")
    assert resp.status_code == 200
    body = resp.json()
    assert "rovers" in body
    assert len(body["rovers"]) == 2
    assert "same_age" in body
    assert "per_rover_series" in body

    # Missing/single rover -> 422
    resp_single = api.http.get("/api/lab/compare?rovers=curiosity")
    assert resp_single.status_code == 422

    # Duplicates -> 422
    resp_dup = api.http.get("/api/lab/compare?rovers=curiosity,curiosity")
    assert resp_dup.status_code == 422

    # Unknown rover -> 422
    resp_unknown = api.http.get("/api/lab/compare?rovers=curiosity,galileo")
    assert resp_unknown.status_code == 422
