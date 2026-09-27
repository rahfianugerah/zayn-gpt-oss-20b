from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parent.parent
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


class Settings(BaseSettings):
    # The same .env also holds the frontend's NEXT_PUBLIC_ variable, so unknown keys are ignored.
    # Inputs stay out of error messages, because both secrets would otherwise be printed there.
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", extra="ignore", hide_input_in_errors=True
    )

    ollama_api_key: SecretStr
    # No default on purpose: which model runs is chosen per machine in .env, never in the code
    ollama_model: str = Field(min_length=1)
    database_url: SecretStr
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @field_validator("ollama_api_key")
    @classmethod
    def reject_placeholder(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value().strip() in ("", "your_ollama_api_key_here"):
            raise ValueError("OLLAMA_API_KEY is empty or still holds the .env.example placeholder")
        return value

    @field_validator("database_url")
    @classmethod
    def require_local_database(cls, value: SecretStr) -> SecretStr:
        # The owner allows only the PostgreSQL server on this machine, never a remote one
        if make_url(value.get_secret_value()).host not in LOCAL_HOSTS:
            raise ValueError("DATABASE_URL must point at the PostgreSQL server on this machine")
        return value


settings = Settings()
