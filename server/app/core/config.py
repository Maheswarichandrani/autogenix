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
    # Model ids live here (AGENTS.md §10). Keys must exist in UnifiedLLM.MODELS.
    AGENT_MODEL: str = "claude-sonnet-5-5"       # Artificer, fixer, Guardian, Deployer
    CONDUCTOR_MODEL: str = "claude-haiku-4-5"    # chat vs build routing

    # Docker
    DOCKER_NETWORK: str = "autogenix_network"
    DOCKER_BASE_IMAGE: str = "python:3.11-slim"


    MAX_SECURITY_ITERATIONS: int = 2   # Guardian → fix → retest rounds before escalating
    MAX_STARTUP_FIX_ATTEMPTS: int = 3  # verify → fix → verify rounds before escalating

    
    class Config:
        env_file = ".env"

settings = Settings()


