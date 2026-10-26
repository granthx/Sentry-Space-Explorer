from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables or backend/.env."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Space Explorer"

    # NASA
    nasa_api_key: str = "DEMO_KEY"
    nasa_base_url: str = "https://api.nasa.gov"
    nasa_images_base_url: str = "https://images-api.nasa.gov"
    request_timeout_seconds: float = 20.0

    # In-memory cache
    cache_ttl_seconds: int = 900
    cache_max_entries: int = 512

    # Serving
    serve_frontend: bool = True
    cors_origins: str = (
        "http://localhost:8000,http://127.0.0.1:8000,"
        "http://localhost:5500,http://127.0.0.1:5500,"
        "http://localhost:3000,http://localhost:8080"
    )

    # AI Assistant (Groq)
    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.8-27b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    assistant_engine: str = "groq"  # "groq" or "langgraph"
    assistant_max_turns: int = 6
    assistant_max_tokens: int = 1024
    assistant_rate_limit_per_minute: int = 10


    @field_validator("nasa_api_key")
    @classmethod
    def _blank_key_means_demo(cls, value: str) -> str:
        value = (value or "").strip()
        return value or "DEMO_KEY"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def using_demo_key(self) -> bool:
        return self.nasa_api_key.upper() == "DEMO_KEY"


@lru_cache
def get_settings() -> Settings:
    return Settings()
