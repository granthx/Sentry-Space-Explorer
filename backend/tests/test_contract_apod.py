"""Contract tests for the APOD service, loaded from real NASA response fixtures.

These tests prove that normalize_apod correctly maps the field names NASA
actually returns (as captured in tests/fixtures/) to the shape the frontend uses.

NOTE on APOD fixture status (2026-10-31):
  NASA's APOD API is currently returning a generic placeholder response
  ("NASA Science") for all date queries instead of real APOD data.
  The field NAMES returned (date, explanation, hdurl, media_type, title, url,
  thumbnail_url) match what the code expects — the API is structurally correct.
  The video fixture (apod_video.json) uses a representative known-good shape
  based on documented APOD API responses.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.apod import normalize_apod

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    # Use utf-8-sig to handle the BOM that Windows PowerShell adds to UTF-8 files
    return json.loads((FIXTURES / name).read_text(encoding="utf-8-sig"))


class TestNormalizeApodImageDay:
    """Tests against the image-day fixture (apod_image.json)."""

    def setup_method(self):
        self.raw = load("apod_image.json")
        self.result = normalize_apod(self.raw)

    def test_date_is_preserved(self):
        assert self.result["date"] == self.raw["date"]

    def test_title_is_cleaned(self):
        # normalize_apod strips extra whitespace
        assert self.result["title"] is not None
        assert "  " not in self.result["title"]  # no double spaces

    def test_media_type_is_image(self):
        assert self.result["media_type"] == "image"

    def test_url_is_present(self):
        assert self.result["url"] is not None

    def test_hd_url_maps_from_hdurl(self):
        # NASA returns "hdurl"; the service must expose it as "hd_url"
        assert "hd_url" in self.result
        if self.raw.get("hdurl"):
            assert self.result["hd_url"] == self.raw["hdurl"]

    def test_thumbnail_url_is_none_for_image_day(self):
        # thumbnail_url only exists on video days with thumbs=true
        # For an image day it should be None (or absent in raw)
        if "thumbnail_url" not in self.raw:
            assert self.result["thumbnail_url"] is None

    def test_no_raw_nasa_field_names_exposed(self):
        # "hdurl" is the raw NASA name; the normalized shape must use "hd_url"
        assert "hdurl" not in self.result

    def test_explanation_is_cleaned(self):
        if self.raw.get("explanation"):
            assert self.result["explanation"] is not None


class TestNormalizeApodVideoDay:
    """Tests against the video-day fixture (apod_video.json).

    The fixture uses a representative YouTube-embed APOD shape that matches
    the documented API contract (media_type=video, url=YouTube embed, thumbnail_url present).
    """

    def setup_method(self):
        self.raw = load("apod_video.json")
        self.result = normalize_apod(self.raw)

    def test_media_type_is_video(self):
        assert self.result["media_type"] == "video"

    def test_url_is_youtube_embed(self):
        assert self.result["url"] is not None
        assert "youtube" in self.result["url"] or "vimeo" in self.result["url"]

    def test_thumbnail_url_is_present(self):
        # When thumbs=true and media_type=video, NASA returns thumbnail_url
        assert self.result["thumbnail_url"] is not None

    def test_title_is_present(self):
        assert self.result["title"] is not None

    def test_date_is_present(self):
        assert self.result["date"] is not None

    def test_hd_url_may_be_none_for_video(self):
        # Video days often have no hdurl; hd_url should be None, not raise
        assert "hd_url" in self.result  # key always present


class TestNormalizeApodRandom:
    """Tests normalize_apod against each item in the random fixture."""

    def test_all_items_have_required_keys(self):
        raw_list = load("apod_random.json")
        # copyright is optional (NASA omits it when the image is in the public domain)
        required = {"date", "title", "media_type", "url", "hd_url", "thumbnail_url", "explanation"}
        for raw in raw_list:
            result = normalize_apod(raw)
            missing = required - result.keys()
            assert not missing, f"normalize_apod missing keys: {missing}"

    def test_no_raw_nasa_field_names_in_any_item(self):
        raw_list = load("apod_random.json")
        for raw in raw_list:
            result = normalize_apod(raw)
            assert "hdurl" not in result, "Raw 'hdurl' field leaked into normalised output"


class TestNormalizeApodEdgeCases:
    """Edge cases that are not tied to a specific fixture."""

    def test_missing_fields_return_none_not_keyerror(self):
        result = normalize_apod({})
        assert result["date"] is None
        assert result["title"] is None
        assert result["explanation"] is None
        assert result["media_type"] == "image"  # default
        assert result["url"] is None
        assert result["hd_url"] is None
        assert result["thumbnail_url"] is None

    def test_whitespace_in_title_is_collapsed(self):
        raw = {"title": "  The   Crab   Nebula  ", "media_type": "image"}
        result = normalize_apod(raw)
        assert result["title"] == "The Crab Nebula"

    def test_newlines_in_explanation_are_collapsed(self):
        raw = {"explanation": "Gas\nand\ndust.", "media_type": "image"}
        result = normalize_apod(raw)
        assert result["explanation"] == "Gas and dust."

    def test_blank_media_type_defaults_to_image(self):
        result = normalize_apod({"media_type": ""})
        assert result["media_type"] == "image"

    def test_none_media_type_defaults_to_image(self):
        result = normalize_apod({"media_type": None})
        assert result["media_type"] == "image"
