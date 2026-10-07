"""
Configuration module - reads from .env file
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables"""

    # App
    APP_NAME: str = "Helpdesk Module"
    API_VERSION: str = "0.1.0"
    API_ENV: str = os.getenv("API_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # API
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/helpdesk_db"
    )

    # Auth Mode: "mock" for development, "production" for real auth
    AUTH_MODE: str = os.getenv("AUTH_MODE", "mock")

    # Workmate's System (used when AUTH_MODE=production)
    WORKMATE_AUTH_URL: Optional[str] = os.getenv("WORKMATE_AUTH_URL")
    WORKMATE_DB_URL: Optional[str] = os.getenv("WORKMATE_DB_URL")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-key-change-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")

    # File Storage
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    ALLOWED_FILE_TYPES: str = os.getenv("ALLOWED_FILE_TYPES", "pdf,jpg,jpeg,png,docx,xlsx,txt")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # CORS
    ALLOWED_ORIGINS: str = os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
    )

    # Ticket Settings
    DEFAULT_TICKET_STATUS: str = "open"
    REOPEN_WINDOW_DAYS: int = 7
    AUTO_CLOSE_DAYS: int = 30

    # SLA Settings (Phase 2)
    SLA_RESPONSE_TIME_HOURS: int = 24
    SLA_RESOLUTION_TIME_HOURS: int = 72

    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
