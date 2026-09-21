# Development server (FastAPI only)
dev:
	uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production server (FastAPI only)
prod:
	uvicorn main:app --host 0.0.0.0 --port 8000

# Start Celery worker (required for workflows)
worker:
	celery -A app.tasks.build_task:celery_app worker --loglevel=info --pool=solo --concurrency=2

# Start Celery worker with debug logging
worker-debug:
	celery -A app.tasks.build_task:celery_app worker --loglevel=debug --pool=solo --concurrency=1

# Start all services (Redis, FastAPI, Celery) - Windows PowerShell
start-all:
	powershell -ExecutionPolicy Bypass -File ./start_all.ps1

# Lint code
lint:
	ruff check .

# Format code
format:
	ruff format .

# Check Redis connection
redis-check:
	docker exec -it autogenix-redis redis-cli ping

# View Celery active tasks
celery-tasks:
	celery -A app.tasks.build_task:celery_app inspect active

# Purge all Celery tasks from queue
celery-purge:
	celery -A app.tasks.build_task:celery_app purge