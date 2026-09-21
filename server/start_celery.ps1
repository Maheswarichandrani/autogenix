# Start Celery Worker for Autogenix
# This worker processes workflow tasks (build, deploy, etc.)

Write-Host "Starting Celery Worker for Autogenix..." -ForegroundColor Cyan

# Activate virtual environment
& .\venv\Scripts\Activate.ps1

# Start Celery worker with logging
Write-Host "`nCelery worker starting...`n" -ForegroundColor Green

celery -A app.tasks.build_worker:celery_app worker `
    --loglevel=info `
    --concurrency=2 `
    --pool=solo `
    --hostname=worker@%h

# Note: 
# --pool=solo is required for Windows (gevent/eventlet don't work well on Windows)
# --concurrency=2 means 2 tasks can run simultaneously
# Increase --concurrency if you need more parallel builds
