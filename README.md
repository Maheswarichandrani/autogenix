# 🚀 Autogenix

AI-powered application builder with a Next.js frontend and FastAPI backend.

---

## 📁 Project Structure

```
Autogenix/
├── client/          → Next.js frontend (React, TypeScript, Tailwind CSS)
└── server/          → FastAPI backend  (Python, SQLAlchemy, PostgreSQL)
```

---

## ⚙️ Prerequisites

Make sure you have these installed:

| Tool       | Version  | Download                                      |
| ---------- | -------- | --------------------------------------------- |
| Node.js    | v18+     | https://nodejs.org                             |
| Python     | 3.11+    | https://python.org                             |
| PostgreSQL | 14+      | https://postgresql.org                         |
| Redis      | 7+       | https://redis.io (optional, for Celery tasks)  |
| Git        | any      | https://git-scm.com                            |

---

## 🏁 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Maheswarichandrani/autogenix.git
cd autogenix
```

---

### 2. Setup the Server (FastAPI)

```bash
# Navigate to the server folder
cd server

# Create a virtual environment
python -m venv venv

# Activate it
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

#### Create a `.env` file inside `server/`:

```env
# Database (PostgreSQL)
DATABASE_URL=postgresql+asyncpg://postgres:yourpassword@localhost:5432/autogenix

# NextAuth Secret (must match the client's NEXTAUTH_SECRET)
NEXTAUTH_SECRET=your-nextauth-secret

# Encryption key for GitHub tokens
ENCRYPTION_KEY=your-encryption-key

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Anthropic API Key (optional)
ANTHROPIC_API_KEY=your-anthropic-key
```

#### Run Database Migrations

```bash
alembic upgrade head
```

#### Start the Server

```bash
python -m app.main
```

The API will be running at **http://localhost:8000**

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

---

### 3. Setup the Client (Next.js)

Open a **new terminal** and:

```bash
# Navigate to the client folder
cd client

# Install dependencies
npm install

# Start the dev server
npm run dev
```

#### Create a `.env.local` file inside `client/`:

```env
# NextAuth
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth
AUTH_GITHUB_ID=your-github-oauth-app-id
AUTH_GITHUB_SECRET=your-github-oauth-app-secret

# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The frontend will be running at **http://localhost:3000**

---

## 🧪 Quick Reference — Commands

| What                    | Where      | Command                         |
| ----------------------- | ---------- | ------------------------------- |
| Start backend server    | `server/`  | `python -m app.main`            |
| Start frontend dev      | `client/`  | `npm run dev`                   |
| Run DB migrations       | `server/`  | `alembic upgrade head`          |
| Create new migration    | `server/`  | `alembic revision --autogenerate -m "message"` |
| Install new pip package | `server/`  | `pip install <pkg> && pip freeze > requirements.txt` |
| Install new npm package | `client/`  | `npm install <pkg>`             |
| Build frontend          | `client/`  | `npm run build`                 |
| Lint frontend           | `client/`  | `npm run lint`                  |

---

## 🔑 Getting GitHub OAuth Credentials

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set:
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
3. Copy the **Client ID** and **Client Secret** into your client `.env.local`

---

## 🛠️ Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui |
| Backend  | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2  |
| Database | PostgreSQL (asyncpg)                          |
| Auth     | NextAuth.js v5 (GitHub OAuth)                 |
| Tasks    | Celery + Redis (optional)                     |

---

## 📝 Notes

- Both `client/.env.local` and `server/.env` share the same `NEXTAUTH_SECRET` value — keep them in sync.
- The backend runs on port **8000** and frontend on port **3000** by default.
- Always activate the virtual environment (`.\venv\Scripts\Activate.ps1`) before running server commands.