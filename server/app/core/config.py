# app/core/config.py
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "Autogenix"
    DEBUG: bool = False

    # NextAuth JWT
    NEXTAUTH_SECRET: str

    # Encryption for GitHub tokens
    ENCRYPTION_KEY: str

    # Database
    DATABASE_URL: str

    # Redis (optional)
    REDIS_URL: str = "redis://localhost:6379"

    # Celery (optional)
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # AI Models
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None

    # Docker
    DOCKER_NETWORK: str = "autogenix_network"
    DOCKER_BASE_IMAGE: str = "python:3.11-slim"


    MAX_SECURITY_ITERATIONS: int = 5   # max guardian↔artificer loops before giving up

    
    class Config:
        env_file = ".env"

settings = Settings()


