# Autogenix Service Diagnostic Tool
# Checks if all required services are running

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Autogenix Service Diagnostic         " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$allGood = $true

# --------------------------------------------------
# Check 1: Redis Docker Container
# --------------------------------------------------
Write-Host "`n[1] Checking Redis..." -ForegroundColor Yellow
try {
    $redisStatus = docker ps --filter "name=redis" --format "{{.Status}}"

    if ($redisStatus -like "*Up*") {
        Write-Host "✓ Redis is running" -ForegroundColor Green
        
        $redisPing = docker exec autogenix-redis redis-cli ping 2>&1
        if ($redisPing -match "PONG") {
            Write-Host "  └─ Connection test: PONG" -ForegroundColor Green
        } else {
            Write-Host "  └─ Connection test: FAILED" -ForegroundColor Red
            $allGood = $false
        }
    } else {
        Write-Host "✗ Redis is NOT running" -ForegroundColor Red
        Write-Host "  └─ Start with: docker-compose up -d redis" -ForegroundColor Yellow
        $allGood = $false
    }
}
catch {
    Write-Host "✗ Docker or Redis container not found" -ForegroundColor Red
    Write-Host "  └─ Start with: docker-compose up -d redis" -ForegroundColor Yellow
    $allGood = $false
}



# --------------------------------------------------
# Check 3: FastAPI Server
# --------------------------------------------------
Write-Host "`n[3] Checking FastAPI Server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -Method GET -TimeoutSec 2 -UseBasicParsing 2>$null

    if ($response.StatusCode -eq 200) {
        Write-Host "✓ FastAPI is running on http://localhost:8000" -ForegroundColor Green
    }
}
catch {
    Write-Host "✗ FastAPI is NOT running" -ForegroundColor Red
    Write-Host "  └─ Start with: python -m app.main" -ForegroundColor Yellow
    $allGood = $false
}

# --------------------------------------------------
# Check 4: Celery Worker
# --------------------------------------------------
Write-Host "`n[4] Checking Celery Worker..." -ForegroundColor Yellow
try {
    $celeryPath = ".\venv\Scripts\celery.exe"

    if (Test-Path $celeryPath) {
        $celeryCheck = & $celeryPath --version 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Celery is installed: $($celeryCheck -split "`n" | Select-Object -First 1)" -ForegroundColor Green

            $workers = & $celeryPath -A app.tasks.build_task:celery_app inspect ping 2>&1

            if ($workers -match "pong") {
                Write-Host "✓ Celery worker is RUNNING and responding" -ForegroundColor Green
            } else {
                Write-Host "✗ Celery worker is NOT running" -ForegroundColor Red
                Write-Host "  └─ THIS IS WHY YOUR WORKFLOWS DON'T START!" -ForegroundColor Red
                Write-Host "  └─ Start with: .\start_celery.ps1" -ForegroundColor Yellow
                $allGood = $false
            }
        }
        else {
            Write-Host "✗ Celery executable not working properly" -ForegroundColor Red
            $allGood = $false
        }
    }
    else {
        Write-Host "✗ Celery is not installed in venv" -ForegroundColor Red
        Write-Host "  └─ Install with: pip install celery" -ForegroundColor Yellow
        $allGood = $false
    }
}
catch {
    Write-Host "✗ Could not check Celery" -ForegroundColor Red
    Write-Host "  └─ Error: $_" -ForegroundColor Yellow
    $allGood = $false
}

# --------------------------------------------------
# Check 5: Pending Tasks in Queue
# --------------------------------------------------
Write-Host "`n[5] Checking Task Queue..." -ForegroundColor Yellow
try {
    $queueLength = docker exec autogenix-redis redis-cli LLEN celery 2>&1

    if ($queueLength -match '^\d+$') {
        if ([int]$queueLength -gt 0) {
            Write-Host "! Found $queueLength pending task(s) in queue" -ForegroundColor Yellow
            Write-Host "  └─ Tasks are waiting for Celery worker!" -ForegroundColor Yellow
        } else {
            Write-Host "✓ Queue is empty (no pending tasks)" -ForegroundColor Green
        }
    }
}
catch {
    Write-Host "! Could not check queue" -ForegroundColor Yellow
}

# --------------------------------------------------
# Summary
# --------------------------------------------------
Write-Host "`n=====================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "  ✓ All Systems Operational!         " -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "`nYou're ready to build! 🚀" -ForegroundColor Green
}
else {
    Write-Host "  ✗ Some Services Missing             " -ForegroundColor Red
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "`nQuick Fix:" -ForegroundColor Yellow
    Write-Host "  Run: .\start_all.ps1" -ForegroundColor Cyan
    Write-Host "`nOr start manually:" -ForegroundColor Yellow
    Write-Host "  1. docker-compose up -d redis" -ForegroundColor White
    Write-Host "  2. python -m app.main (in terminal 1)" -ForegroundColor White
    Write-Host '  3. .\start_celery.ps1 (in terminal 2)' -ForegroundColor White
}

Write-Host ""