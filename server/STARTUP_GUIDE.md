# Autogenix Server - Complete Startup Guide

## 🔴 CRITICAL: Missing Celery Worker

**You found the issue!** Your workflow tasks are being dispatched but never executed because the Celery worker isn't running.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Autogenix Backend                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. FastAPI (port 8000)                                     │
│     ├─ REST API endpoints                                   │
│     ├─ SSE streaming endpoint                               │
│     └─ Dispatches tasks to Celery                           │
│                                                             │
│  2. Redis (port 6379)                                       │
│     ├─ Celery broker (task queue)                           │
│     ├─ Celery result backend                                │
│     └─ Pub/Sub for SSE events                               │
│                                                             │
│  3. Celery Worker ⚠️ NOT RUNNING ⚠️                         │
│     ├─ Executes workflow tasks                              │
│     ├─ Runs LangGraph workflows                             │
│     └─ Publishes SSE events to Redis                        │
│                                                             │
│  4. PostgreSQL (port 5432)                                  │
│     └─ Data persistence                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Why Nothing Is Happening

When you send a message:

1. ✅ **FastAPI receives request** → `POST /messages`
2. ✅ **Message saved to DB** → You confirmed this works
3. ✅ **Task dispatched to Celery** → `start_workflow_task.delay(...)` 
4. ❌ **Task sits in Redis queue forever** → No worker to pick it up
5. ❌ **No workflow execution** → LangGraph never runs
6. ❌ **No SSE events published** → Frontend sees nothing
7. ❌ **No errors logged** → Everything appears "silent"

## Complete Startup Process

You need **3 separate terminals** running simultaneously:

### Terminal 1: Redis (Docker)

```powershell
# Navigate to server directory
cd E:\ALL-PROJECTS\Autogenix\server

# Start Redis in background
docker-compose up -d redis

# Verify it's running
docker ps | Select-String "redis"
```

**Expected Output:**
```
CONTAINER ID   IMAGE           STATUS         PORTS
abc123...      redis:7-alpine  Up 2 minutes   0.0.0.0:6379->6379/tcp
```

### Terminal 2: FastAPI Server

```powershell
# Navigate to server directory
cd E:\ALL-PROJECTS\Autogenix\server

# Activate venv
.\venv\Scripts\Activate.ps1

# Start FastAPI with hot reload
python -m app.main
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Terminal 3: Celery Worker ⚠️ THIS IS MISSING!

```powershell
# Navigate to server directory
cd E:\ALL-PROJECTS\Autogenix\server

# Run the new start script
.\start_celery.ps1
```

**OR manually:**
```powershell
# Activate venv
.\venv\Scripts\Activate.ps1

# Start Celery worker
celery -A app.tasks.build_task:celery_app worker --loglevel=info --pool=solo --concurrency=2
```

**Expected Output:**
```
 -------------- celery@YOURCOMPUTER v5.x.x
---- **** ----- 
--- * ***  * -- Windows-10-10.0.xxxxx
-- * - **** --- 
- ** ---------- [config]
- ** ---------- .> app:         autogenix:0x...
- ** ---------- .> transport:   redis://localhost:6379//
- ** ---------- .> results:     redis://localhost:6379/
- *** --- * --- .> concurrency: 2 (solo)

[tasks]
  . workers.start_workflow
  . workers.resume_workflow
  . workers.railway_connect
  . workers.deploy_confirm

[2024-xx-xx 13:00:00,000: INFO/MainProcess] Connected to redis://localhost:6379//
[2024-xx-xx 13:00:00,000: INFO/MainProcess] celery@YOURCOMPUTER ready.
```

## Verify Everything Works

### 1. Check Redis Connection

```powershell
# In a new terminal
docker exec -it autogenix-redis redis-cli

# Inside redis-cli, check for queued tasks
LLEN celery
KEYS *
```

### 2. Send a Test Message

From your frontend, send a message. You should now see:

**In Celery Worker Terminal:**
```
[2024-xx-xx 13:05:00,000: INFO/MainProcess] Task workers.start_workflow received
[2024-xx-xx 13:05:01,000: INFO/MainProcess] Task workers.start_workflow succeeded
```

**In FastAPI Terminal:**
```
INFO: SSE connection opened for project=abc-123
INFO: Publishing event type=stage_change stage=planning
```

**In Frontend (Browser Console):**
```
SSE Event: {type: "stage_change", stage: "planning"}
SSE Event: {type: "text_chunk", chunk: "Analyzing...", role: "conductor"}
```

## Quick Start All Services

Create a master start script:

```powershell
# start_all.ps1
Write-Host "Starting Autogenix Backend Services..." -ForegroundColor Cyan

# 1. Start Redis
Write-Host "`n1. Starting Redis..." -ForegroundColor Yellow
docker-compose up -d redis
Start-Sleep 2

# 2. Start FastAPI in new terminal
Write-Host "`n2. Starting FastAPI..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; python -m app.main"

# 3. Start Celery worker in new terminal
Write-Host "`n3. Starting Celery Worker..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\start_celery.ps1"

Write-Host "`nAll services started!" -ForegroundColor Green
Write-Host "FastAPI: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Redis: localhost:6379" -ForegroundColor Cyan
```

## Troubleshooting

### "No module named 'celery'"

```powershell
pip install celery redis
```

### Worker Won't Start on Windows

Use `--pool=solo` flag:
```powershell
celery -A app.tasks.build_task:celery_app worker --pool=solo
```

### Tasks Not Being Picked Up

Check Redis is running:
```powershell
docker ps | Select-String "redis"
```

Check Celery can connect:
```powershell
celery -A app.tasks.build_task:celery_app inspect ping
```

### Still No SSE Events

1. Check Celery worker logs for errors
2. Verify Redis pub/sub:
   ```powershell
   # In redis-cli
   SUBSCRIBE project:*:stream
   ```
3. Check FastAPI logs for SSE connections

## Production Deployment

For production, use a process manager like **supervisord** or **systemd**:

```ini
[program:celery_worker]
command=/path/to/venv/bin/celery -A app.tasks.build_task:celery_app worker --loglevel=info --concurrency=4
directory=/path/to/server
user=autogenix
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/celery_worker.log
```

## Summary

**The Fix:**
1. ✅ Install Celery: `pip install celery redis`
2. ✅ Start Redis: `docker-compose up -d redis`
3. ✅ Start FastAPI: `python -m app.main`
4. ✅ **Start Celery Worker**: `.\start_celery.ps1` ← **THIS WAS MISSING**

Now when you send a message, the workflow will execute and SSE events will stream to your frontend! 🚀
