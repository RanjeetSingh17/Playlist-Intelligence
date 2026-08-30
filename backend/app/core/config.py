"""
Application configuration, loaded from environment variables (.env file).
"""
import json
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class MissingConfigurationError(RuntimeError):
    """Raised when a feature is used before its required key is configured."""


class Settings(BaseSettings):
    # Keep the API bootable without optional integration keys. This lets the
    # health check and pure step-5 planning endpoints work immediately,
    # while integration endpoints return a clear 503 only when used.
    YOUTUBE_API_KEY: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    GROQ_API_KEY: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    WEBSHARE_PROXY_USERNAME: Optional[str] = None
    WEBSHARE_PROXY_PASSWORD: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins_list(self) -> List[str]:
        """Accepts either a comma-separated string or a JSON array in .env."""
        raw = self.ALLOWED_ORIGINS
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    def require(self, name: str) -> str:
        value = getattr(self, name, "")
        if isinstance(value, str) and value.strip():
            return value.strip()
        raise MissingConfigurationError(
            f"{name} is not configured. Copy .env.example to .env and set {name}."
        )


settings = Settings()
