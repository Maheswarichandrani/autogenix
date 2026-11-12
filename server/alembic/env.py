from logging.config import fileConfig
import asyncio
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import your app's Base and settings
from app.core.database import Base
from app.core.config import settings

# Import all models here so Alembic can detect them
from app.models import user  # noqa: F401
from app.models import project  # noqa: F401
from app.models import message  # noqa: F401
from app.models import build  # noqa: F401
from app.models import artifact  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Override sqlalchemy.url with our DATABASE_URL from settings
DATABASE_URL = settings.DATABASE_URL.replace(
    "postgresql://",
    "postgresql+asyncpg://"
)
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# Database objects Alembic must never create, alter or drop.
#
# LangGraph's PostgresSaver creates and migrates its own checkpoint tables.
_LANGGRAPH_TABLES = {"checkpoints", "checkpoint_writes", "checkpoint_blobs", "checkpoint_migrations"}
# Legacy objects on the shared Neon database, left behind by a migration
# (181838669d0d) that is not in this repo. No model uses them. They are kept
# so no data is lost; dropping them needs its own migration and decision.
_LEGACY_TABLES = {"user_integrations"}
_LEGACY_COLUMNS = {
    ("users", "display_name"), ("users", "kdf_salt"), ("users", "work_function"),
    ("users", "privacy_file_storage"), ("users", "privacy_ai_memory"),
    ("users", "privacy_prompt_redaction"), ("users", "privacy_auto_delete"),
    ("builds", "raw_plan"), ("builds", "security_issues_found"), ("builds", "security_iteration"),
}
_IGNORED_TABLES = _LANGGRAPH_TABLES | _LEGACY_TABLES


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    """Hide the objects above from autogenerate so it never proposes dropping them."""
    if type_ == "table" and name in _IGNORED_TABLES:
        return False
    if type_ in ("index", "unique_constraint", "foreign_key_constraint") and getattr(obj, "table", None) is not None:
        if obj.table.name in _IGNORED_TABLES:
            return False
    if type_ == "column" and reflected and compare_to is None:
        if (obj.table.name, name) in _LEGACY_COLUMNS:
            return False
    return True

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

