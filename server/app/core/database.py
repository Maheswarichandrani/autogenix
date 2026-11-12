from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession
)
from sqlalchemy.orm import declarative_base
from app.core.config import settings    
from typing import AsyncGenerator


# Convert to async driver
DATABASE_URL =  settings.DATABASE_URL.replace(
    "postgresql://",
    "postgresql+asyncpg://"
)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=True,  # disable in production
    pool_size=10,  # Number of connections to keep in the pool
    max_overflow=20,  # Max connections beyond pool_size
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,  # Recycle connections after 1 hour
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
    autoflush=False,
    autocommit=False,
)

# Base class for models
Base = declarative_base()

# Import models here so SQLAlchemy knows about them
from app.models import user  # noqa: E402
from app.models import project  # noqa: E402
from app.models import message  # noqa: E402
from app.models import build  # noqa: E402
from app.models import artifact  # noqa: E402

async def init_db() -> None:
    """
    Refuse to start unless the database is at the Alembic head.

    Tables are created and changed only by `alembic upgrade head`. The API
    used to run create_all here, which built tables outside Alembic and let
    the database drift from the migration history.
    """
    from pathlib import Path

    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    alembic_ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    expected = set(ScriptDirectory.from_config(Config(str(alembic_ini))).get_heads())

    async with engine.connect() as conn:
        current = set(await conn.run_sync(
            lambda sync_conn: MigrationContext.configure(sync_conn).get_current_heads()
        ))

    if current != expected:
        raise RuntimeError(
            f"Database is at {sorted(current) or 'no revision'}, expected {sorted(expected)}. "
            "Run: alembic upgrade head"
        )
    print(f"Database schema is at Alembic head {', '.join(sorted(expected))}")

async def close_db() -> None:
    await engine.dispose()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session