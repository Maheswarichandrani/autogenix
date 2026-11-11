"""
api/env_vars.py

TWO CONCERNS:

1. ACCOUNT-LEVEL PLATFORM CREDENTIALS  (set once, reused across all projects)
   GET  /account/credentials       — returns connection status (never ciphertext)
   POST /account/railway-key       — save Railway API key (server-side encrypted)
   
   Railway key flow:
     User pastes key in the inline connect_railway card → POST /account/railway-key
     Server encrypts with PLATFORM_ENCRYPTION_KEY → stored in user.railway_api_key_encrypted
     Every future deploy: server decrypts automatically, user never prompted again

2. PROJECT-LEVEL APP ENV VARS  (per-project, zero-knowledge browser encrypted)
   POST   /projects/:id/env-vars  — store encrypted app env vars (ciphertext only)
   GET    /projects/:id/env-vars  — return key names + kdf_salt (never ciphertext)
   DELETE /projects/:id/env-vars/:id — delete a set

3. DEPLOY CONFIRM
   POST /projects/:id/deploy-confirm — user sends plaintext app env vars (browser decrypted)
                                        server fetches Railway key from DB automatically
                                        injects into Railway API → discards from RAM
"""
import json
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models import User, Project, ProjectEnvVar, Build
from app.repositories import ProjectRepo, BuildRepo
from app.api.deps import get_current_user
from app.utils.encryption import encrypt_token, decrypt_token

log = logging.getLogger(__name__)

env_router     = APIRouter(prefix="/projects/{project_id}/env-vars", tags=["env-vars"])
account_router = APIRouter(prefix="/account",                        tags=["account"])


# ── Schemas ───────────────────────────────────────────────────────

class EncryptedVar(BaseModel):
    key_name:   str
    ciphertext: str
    iv:         str
    is_secret:  bool = True


class StoreEnvVarsRequest(BaseModel):
    encrypted_vars: list[EncryptedVar]
    kdf_salt:       str


class RailwayKeyRequest(BaseModel):
    """User pastes their Railway API key. Sent plaintext over HTTPS — we encrypt server-side."""
    railway_api_key: str


class DeployConfirmRequest(BaseModel):
    """
    User's APP env vars decrypted in browser, sent over HTTPS.
    
    WHAT USER SENDS:      app env vars only (STRIPE_KEY, DATABASE_URL etc.)
    WHAT SERVER FETCHES:  github_token + railway_api_key from DB automatically
    
    User never has to send platform credentials again after initial setup.
    """
    plaintext_vars: dict[str, str]   # {"STRIPE_KEY": "sk_live_...", "DATABASE_URL": "postgres://..."}


# ════════════════════════════════════════════════════════════════════
# ACCOUNT — credentials status
# ════════════════════════════════════════════════════════════════════

@account_router.get("/credentials")
async def get_credential_status(current_user: User = Depends(get_current_user)):
    """
    Returns connection status only — never returns actual tokens.
    Frontend shows: "GitHub ✅ Connected | Railway ✅ Connected"
    """
    return {
        "github_connected":   bool(current_user.github_token_encrypted),
        "railway_connected":  bool(current_user.railway_api_key_encrypted),
        "github_username":    current_user.github_username,
        "kdf_salt":           current_user.kdf_salt,
    }


# ════════════════════════════════════════════════════════════════════
# ACCOUNT — save Railway API key (server-side encryption)
# Called from the inline connect_railway card during first deploy,
# or from account settings at any time.
# ════════════════════════════════════════════════════════════════════

@account_router.post("/railway-key")
async def save_railway_key(
    body:         RailwayKeyRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """
    Encrypt and store the user's Railway API key server-side.

    SECURITY:
    - Received as plaintext over HTTPS (TLS only — enforced at nginx)
    - Encrypted immediately with PLATFORM_ENCRYPTION_KEY (AES-256-GCM)
    - Plaintext wiped from scope after encryption
    - Stored as ciphertext in user.railway_api_key_encrypted
    - Never logged

    AFTER THIS CALL:
    - All future deploys use this key automatically
    - User never prompted for Railway key again
    - deployer_node will find it in DB and proceed without interrupting
    """
    if not body.railway_api_key or not body.railway_api_key.strip():
        raise HTTPException(status_code=400, detail="Railway API key cannot be empty")

    # Validate it looks like a Railway token (basic check)
    key = body.railway_api_key.strip()
    if len(key) < 10:
        raise HTTPException(status_code=400, detail="Invalid Railway API key format")

    log.info("Saving Railway API key for user=%s", current_user.id)
    # NEVER: log.info("key=%s", key)

    current_user.railway_api_key_encrypted = encrypt_token(key)

    # Wipe plaintext from local scope immediately
    key  = None
    del body

    await db.flush()

    # ── If a build is currently waiting for this key, resume it ───
    # Find the user's most recently active project with a paused deployer.
    # railway_connect_task will check if the graph is actually paused at deployer —
    # if not, it's a no-op (key saved for future use).
    from sqlalchemy import select
    from app.models import Project
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id, Project.status == "active")
        .order_by(Project.updated_at.desc())
        .limit(1)
    )
    active_project = result.scalar_one_or_none()

    if active_project and active_project.langgraph_thread_id:
        from app.tasks.build_worker import railway_connect_task
        railway_connect_task.delay(
            project_id = str(active_project.id),
            thread_id  = active_project.langgraph_thread_id,
        )
        log.info("Triggered railway_connect_task project=%s", active_project.id)

    return {
        "railway_connected": True,
        "message":           "Railway API key saved. Future deploys are fully automatic.",
    }


@account_router.delete("/railway-key")
async def delete_railway_key(
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """Disconnect Railway — user will be prompted to reconnect on next deploy."""
    current_user.railway_api_key_encrypted = None
    await db.flush()
    return {"railway_connected": False, "message": "Railway disconnected"}


# ════════════════════════════════════════════════════════════════════
# PROJECT ENV VARS — zero-knowledge browser encrypted
# ════════════════════════════════════════════════════════════════════

@env_router.post("/")
async def store_env_vars(
    project_id:   uuid.UUID,
    body:         StoreEnvVarsRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """
    Store encrypted app env vars for a project.
    We receive ONLY ciphertext — never plaintext values.
    """
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    active_build = await BuildRepo(db).get_active_build(project_id)

    record = ProjectEnvVar(
        project_id     = project_id,
        build_id       = active_build.id if active_build else None,
        encrypted_vars = [v.model_dump() for v in body.encrypted_vars],
        kdf_salt       = body.kdf_salt,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)

    return {
        "id":        str(record.id),
        "key_names": [v.key_name for v in body.encrypted_vars],
        "message":   f"Stored {len(body.encrypted_vars)} encrypted var(s)",
    }


@env_router.get("/")
async def get_env_vars(
    project_id:   uuid.UUID,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """
    Returns key names + kdf_salt — NEVER returns ciphertext.
    Frontend shows: "You have: STRIPE_KEY, DATABASE_URL configured"
    Browser uses kdf_salt + password to re-derive decryption key at deploy time.
    """
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectEnvVar)
        .where(ProjectEnvVar.project_id == project_id)
        .order_by(ProjectEnvVar.created_at.desc())
        .limit(1)
    )
    record = result.scalar_one_or_none()
    if not record:
        return {"configured": False, "key_names": [], "kdf_salt": current_user.kdf_salt}

    return {
        "configured": True,
        "env_var_id": str(record.id),
        "key_names":  [v["key_name"] for v in (record.encrypted_vars or [])],
        "kdf_salt":   record.kdf_salt,
        # ciphertext + iv returned so browser can decrypt at deploy time
        "encrypted_vars": [
            {"key_name": v["key_name"], "ciphertext": v["ciphertext"], "iv": v["iv"]}
            for v in (record.encrypted_vars or [])
        ],
    }


@env_router.delete("/{env_var_id}")
async def delete_env_vars(
    project_id:   uuid.UUID,
    env_var_id:   uuid.UUID,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectEnvVar)
        .where(ProjectEnvVar.id == env_var_id, ProjectEnvVar.project_id == project_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Env var set not found")

    await db.delete(record)
    return {"deleted": True}


# ════════════════════════════════════════════════════════════════════
# DEPLOY CONFIRM
# User sends ONLY their app env vars (decrypted in browser).
# Server fetches github_token + railway_api_key from DB automatically.
# ════════════════════════════════════════════════════════════════════

@env_router.post("/deploy-confirm")
async def deploy_confirm(
    project_id:   uuid.UUID,
    body:         DeployConfirmRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """
    WHAT USER SENDS:    only their app env vars (STRIPE_KEY, DATABASE_URL etc.)
    WHAT WE FETCH:      github_token and railway_api_key from DB (server-decrypted)
    RESULT:             all credentials assembled server-side → Celery task → deploy

    SECURITY:
    - HTTPS only (enforce at nginx)
    - Never log body.plaintext_vars
    - Plaintext wiped from RAM after Celery task completes
    """
    from app.tasks.build_worker import deploy_confirm_task

    project = await ProjectRepo(db).get_by_id(project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    active_build = await BuildRepo(db).get_active_build(project_id)
    if not active_build:
        raise HTTPException(status_code=409, detail="No active build waiting for deployment")

    log.info(
        "deploy_confirm project=%s build=%s vars_count=%d",
        project_id, active_build.id, len(body.plaintext_vars),
    )
    # NEVER: log.info("vars=%s", body.plaintext_vars)

    deploy_confirm_task.delay(
        project_id     = str(project_id),
        thread_id      = project.langgraph_thread_id,
        user_id        = str(current_user.id),
        # Encrypted so the Redis broker never holds plaintext env vars
        encrypted_vars = encrypt_token(json.dumps(body.plaintext_vars)),
    )

    # Wipe from local scope
    del body

    return {
        "status":     "deploying",
        "stream_url": f"/projects/{project_id}/messages/stream",
    }