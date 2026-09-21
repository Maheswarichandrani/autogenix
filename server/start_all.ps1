# Start All Autogenix Backend Services
# Launches Redis, FastAPI, and Celery Worker in separate terminals

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Starting Autogenix Backend Services  " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# 1. Start Redis
Write-Host "`n[1/3] Starting Redis Docker Container..." -ForegroundColor Yellow
docker-compose up -d redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Redis started successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to start Redis" -ForegroundColor Red
    exit 1
}

Start-Sleep 2

# 2. Start FastAPI in new terminal
Write-Host "`n[2/3] Starting FastAPI Server..." -ForegroundColor Yellow
$fastApiCommand = "cd '$PWD'; .\venv\Scripts\Activate.ps1; Write-Host 'FastAPI Server Running on http://localhost:8000' -ForegroundColor Green; python -m app.main"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $fastApiCommand
Write-Host "✓ FastAPI terminal opened" -ForegroundColor Green

Start-Sleep 2

# 3. Start Celery worker in new terminal
Write-Host "`n[3/3] Starting Celery Worker..." -ForegroundColor Yellow
$celeryCommand = "cd '$PWD'; .\venv\Scripts\Activate.ps1; Write-Host 'Celery Worker Ready' -ForegroundColor Green; celery -A app.tasks.build_task:celery_app worker --loglevel=info --pool=solo --concurrency=2"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $celeryCommand
Write-Host "✓ Celery worker terminal opened" -ForegroundColor Green

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  All Services Started!               " -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "`nServices running:" -ForegroundColor White
Write-Host "  • Redis:      localhost:6379" -ForegroundColor Cyan
Write-Host "  • FastAPI:    http://localhost:8000" -ForegroundColor Cyan
Write-Host "  • Celery:     Background worker" -ForegroundColor Cyan
Write-Host "`nPress Ctrl+C in each terminal to stop services" -ForegroundColor Yellow
