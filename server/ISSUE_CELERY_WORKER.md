# 🔴 ISSUE FOUND: Celery Worker Not Running

## Problem Summary

You discovered why your workflows appear "silent" with no errors:

### What's Happening

```
Frontend sends message
    ↓
FastAPI receives request ✅
    ↓
Message saved to DB ✅
    ↓
Celery task dispatched ✅
    ↓
Task sits in Redis queue ❌ ← NO WORKER TO EXECUTE IT
    ↓
Workflow never starts ❌
    ↓
No SSE events published ❌
    ↓
Frontend sees nothing ❌
```

### Why No Errors?

Everything technically "works":
- ✅ FastAPI is running
- ✅ Redis is running  
- ✅ Tasks are dispatched successfully
- ✅ Database writes succeed

But the **Celery worker** that actually executes workflows isn't running, so tasks just queue up forever.

## The Fix (3 Required Services)

You need **THREE** services running simultaneously:

### 1️⃣ Redis (Message Broker)
```powershell
cd E:\ALL-PROJECTS\Autogenix\server
docker-compose up -d redis
```

### 2️⃣ FastAPI Server (Terminal 1)
```powershell
cd E:\ALL-PROJECTS\Autogenix\server
.\venv\Scripts\Activate.ps1
python -m app.main
```

### 3️⃣ Celery Worker (Terminal 2) ← **THIS IS MISSING!**
```powershell
cd E:\ALL-PROJECTS\Autogenix\server
.\start_celery.ps1
```

## Quick Start (Automated)

I created a script that starts everything:

```powershell
cd E:\ALL-PROJECTS\Autogenix\server
.\start_all.ps1
```

This will open 2 new terminals automatically:
- Terminal 1: FastAPI server
- Terminal 2: Celery worker

## Verify It Works

### Step 1: Run Diagnostic
```powershell
cd E:\ALL-PROJECTS\Autogenix\server
.\check_services.ps1
```

Expected output:
```
✓ Redis is running
✓ FastAPI is running on http://localhost:8000
✓ Celery worker is RUNNING and responding
```

### Step 2: Send a Test Message

From your frontend, send any message. You should now see:

**Celery Terminal:**
```
[2024-xx-xx] Task workers.start_workflow[abc-123] received
[2024-xx-xx] Conductor: Analyzing request...
[2024-xx-xx] Publishing event: stage_change -> planning
[2024-xx-xx] Task workers.start_workflow[abc-123] succeeded
```

**FastAPI Terminal:**
```
INFO: SSE connection opened for project=abc-123
INFO: Publishing SSE event type=stage_change
INFO: Publishing SSE event type=text_chunk
```

**Frontend Console:**
```javascript
SSE Event: {type: "stage_change", stage: "planning"}
SSE Event: {type: "text_chunk", chunk: "Analyzing...", role: "conductor"}
SSE Event: {type: "artifact", artifact_type: "plan", ...}
```

## Files I Created

1. **start_celery.ps1** - Start Celery worker
2. **start_all.ps1** - Start all services at once
3. **check_services.ps1** - Diagnostic tool
4. **STARTUP_GUIDE.md** - Complete documentation
5. **Updated Makefile** - Added worker commands

## Common Issues

### "celery: command not found"
```powershell
pip install celery redis
```

### "No module named 'app.tasks'"
Make sure you're in the `server` directory and venv is activated.

### Worker won't start on Windows
Use the `--pool=solo` flag (already in the script).

### Tasks still not executing
1. Check Redis is running: `docker ps`
2. Check worker is connected: `celery -A app.tasks.build_worker:celery_app inspect ping`
3. Check queue: `docker exec autogenix-redis redis-cli LLEN celery`

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Your Browser                          │
│  - Sends: POST /messages {"action": "send_message"}      │
│  - Receives: SSE stream from /messages/stream            │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│              FastAPI Server (Terminal 1)                 │
│  1. Saves message to PostgreSQL                          │
│  2. Dispatches: start_workflow_task.delay(...)           │
│  3. Returns: {thread_id, stream_url}                     │
│  4. Streams SSE events from Redis pub/sub                │
└────────┬────────────────────────────────────┬────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────┐           ┌──────────────────────┐
│  PostgreSQL         │           │  Redis               │
│  - Messages         │           │  - Task Queue        │
│  - Projects         │           │  - Pub/Sub Channels  │
│  - Artifacts        │           └──────────┬───────────┘
└─────────────────────┘                      │
                                             │
                                             ▼
                                ┌─────────────────────────┐
                                │ Celery Worker (Terminal 2) ← YOU'RE MISSING THIS!
                                │  1. Picks up task        │
                                │  2. Runs LangGraph       │
                                │  3. Publishes SSE events │
                                │  4. Saves artifacts      │
                                └──────────────────────────┘
```

## Next Steps

1. **Stop your current FastAPI server** (Ctrl+C)
2. **Run the diagnostic**: `.\check_services.ps1`
3. **Start all services**: `.\start_all.ps1`
4. **Test a message** from your frontend
5. **Watch Celery terminal** - you should see task execution!

## Expected Behavior After Fix

### Before (Current State)
- Send message → Nothing happens
- No errors, just silence
- Message saved to DB but workflow never runs

### After (With Celery Worker)
- Send message → Celery picks up task immediately
- Workflow executes (Conductor → Artificer → Guardian → Deployer)
- SSE events stream to frontend in real-time
- Chat updates live with AI responses
- Artifacts (plans, code) appear in UI

---

**The root cause:** You had 2 of 3 required services running. The missing Celery worker meant tasks were dispatched but never executed. No errors because everything upstream worked perfectly - the task just sat in Redis queue waiting for a worker that didn't exist.

Start the worker and everything will come alive! 🚀
