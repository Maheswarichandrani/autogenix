# Redis Docker Setup for Autogenix

This guide will help you set up Redis using Docker for your Autogenix server.

## Prerequisites

- Docker Desktop installed on Windows
- Docker Compose (comes with Docker Desktop)

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Start Redis Container**
   ```powershell
   # Navigate to server directory
   cd E:\ALL-PROJECTS\Autogenix\server
   
   # Start Redis in detached mode
   docker-compose up -d redis
   ```

2. **Verify Redis is Running**
   ```powershell
   # Check container status
   docker-compose ps
   
   # Check Redis logs
   docker-compose logs redis
   
   # Test Redis connection
   docker exec -it autogenix-redis redis-cli ping
   ```
   You should see `PONG` as response.

3. **Stop Redis**
   ```powershell
   docker-compose down
   ```

4. **Stop Redis but Keep Data**
   ```powershell
   docker-compose stop redis
   ```

### Option 2: Using Plain Docker Commands

1. **Pull Redis Image**
   ```powershell
   docker pull redis:7-alpine
   ```

2. **Create Docker Network**
   ```powershell
   docker network create autogenix-network
   ```

3. **Run Redis Container**
   ```powershell
   docker run -d `
     --name autogenix-redis `
     --network autogenix-network `
     -p 6379:6379 `
     -v redis-data:/data `
     redis:7-alpine redis-server --appendonly yes
   ```

4. **Verify Redis is Running**
   ```powershell
   # Check if container is running
   docker ps | Select-String "autogenix-redis"
   
   # Test Redis connection
   docker exec -it autogenix-redis redis-cli ping
   ```

5. **Stop and Remove Container**
   ```powershell
   docker stop autogenix-redis
   docker rm autogenix-redis
   ```

## Configuration

Your `config.py` is already configured with:
- `REDIS_URL: "redis://localhost:6379"`
- `CELERY_BROKER_URL: "redis://localhost:6379/0"`
- `CELERY_RESULT_BACKEND: "redis://localhost:6379/0"`

These settings work perfectly with the Docker container exposed on port 6379.

## Development vs Production

### Development (with password)
Use `docker-compose.dev.yml` for development with password protection:
```powershell
docker-compose -f docker-compose.dev.yml up -d redis
```

Update your `.env` file:
```env
REDIS_URL=redis://:devpassword@localhost:6379
CELERY_BROKER_URL=redis://:devpassword@localhost:6379/0
CELERY_RESULT_BACKEND=redis://:devpassword@localhost:6379/0
```

### Production
Use the main `docker-compose.yml` and set a strong password in your production environment.

## Useful Commands

### Monitor Redis in Real-time
```powershell
# View Redis logs
docker-compose logs -f redis

# Connect to Redis CLI
docker exec -it autogenix-redis redis-cli

# Inside Redis CLI, you can run:
# PING - test connection
# KEYS * - list all keys
# INFO - get Redis info
# MONITOR - watch all commands in real-time
```

### Check Redis Stats
```powershell
docker exec -it autogenix-redis redis-cli INFO stats
```

### Backup Redis Data
```powershell
# Create backup
docker exec autogenix-redis redis-cli SAVE

# Copy backup file from container
docker cp autogenix-redis:/data/dump.rdb ./redis-backup.rdb
```

### Clear All Redis Data
```powershell
docker exec -it autogenix-redis redis-cli FLUSHALL
```

## Troubleshooting

### Port Already in Use
If port 6379 is already in use:
```powershell
# Find process using port 6379
netstat -ano | findstr :6379

# Change port in docker-compose.yml
# ports:
#   - "6380:6379"
# Then update REDIS_URL in config.py to redis://localhost:6380
```

### Container Won't Start
```powershell
# Check Docker logs
docker-compose logs redis

# Remove container and volumes, start fresh
docker-compose down -v
docker-compose up -d redis
```

### Connection Refused from Python
Make sure:
1. Redis container is running: `docker ps`
2. Port 6379 is accessible: `telnet localhost 6379`
3. Your `.env` file has correct `REDIS_URL`

## Integration with Your Server

To test Redis connection from your Python server:

```python
# Test script: test_redis.py
import redis

r = redis.Redis.from_url("redis://localhost:6379")
print(r.ping())  # Should print: True
r.set('test_key', 'Hello Redis!')
print(r.get('test_key'))  # Should print: b'Hello Redis!'
```

Run it:
```powershell
# Activate your virtual environment first
.\venv\Scripts\Activate
python test_redis.py
```

## Auto-start Redis with Your Project

Add to your `Makefile`:
```makefile
.PHONY: dev
dev:
	docker-compose up -d redis
	uvicorn app.main:app --reload

.PHONY: stop
stop:
	docker-compose down
```

Then simply run:
```powershell
make dev
```

---

**Note**: The Redis data is persisted in a Docker volume named `redis-data`, so your data will survive container restarts.
