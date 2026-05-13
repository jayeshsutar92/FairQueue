# FairQueue

A compact distributed systems demo of a high-concurrency train-seat booking
system inspired by IRCTC Tatkal.

## Stack

- Frontend: Next.js
- Backend: FastAPI, SQLAlchemy async, Pydantic v2
- Queue and locks: Redis 7 sorted sets, sets, counters, `SET NX EX`
- Database: PostgreSQL 16 through asyncpg
- Realtime: WebSocket queue status updates
- Load testing: Locust
- Orchestration: Docker Compose

## Architecture

```text
Client (Next.js)
  | HTTP + WebSocket
  v
FastAPI backend
  |                  |
  v                  v
Postgres          Redis
trains/seats      FIFO queues, admitted sets,
bookings          TTL seat locks, rate limits
```

The admission loop runs inside FastAPI. Every tick it pops a bounded batch from
each Redis sorted-set queue and moves those users to the admitted set. Seat
locking uses one Redis key per seat with `NX` and expiry. Payment confirmation
rechecks lock ownership, then atomically books the seat in Postgres with
`UPDATE ... WHERE status='available'`.

## Quick Start

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- Locust: http://localhost:8089
- Postgres: localhost:5432 (`fairqueue` / `fairqueue`)
- Redis: localhost:6379

Seed data is created automatically on backend startup: 3 trains with 48 seats
each.

## Local Backend Without Docker

Use this only if you already have Postgres and Redis running locally.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql+asyncpg://fairqueue:fairqueue@localhost:5432/fairqueue
set REDIS_URL=redis://localhost:6379/0
uvicorn app.main:app --reload
```

PowerShell equivalent:

```powershell
$env:DATABASE_URL="postgresql+asyncpg://fairqueue:fairqueue@localhost:5432/fairqueue"
$env:REDIS_URL="redis://localhost:6379/0"
uvicorn app.main:app --reload
```

## Local Frontend Without Docker

```bash
cd frontend
yarn install
yarn dev
```

The frontend reads:

- `NEXT_PUBLIC_API_BASE`, default `http://localhost:8000`
- `NEXT_PUBLIC_WS_BASE`, default `ws://localhost:8000`

## Core Flows To Verify

1. Open the frontend and join a train queue.
2. Watch the waiting room update over WebSocket.
3. After admission, pick an available seat.
4. Confirm payment before the Redis lock TTL expires.
5. Open Admin and verify queue counters, active locks, and Postgres totals.
6. Run Locust from http://localhost:8089 for contention and rate-limit behavior.

## API

See [API.md](./API.md). OpenAPI docs are served by the backend at `/docs`.

## Load Testing

Docker Compose starts Locust with the included scenario:

```bash
docker compose up locust
```

Open http://localhost:8089 and use:

- Host: `http://backend:8000` when running inside Compose
- Users: start with 100
- Spawn rate: start with 20/s

Expected behavior under load:

- FIFO admission in bounded batches
- 409 conflicts when multiple users contend for the same seat
- 429 responses once per-IP route limits are exceeded
- No double-booked seats after concurrent payment attempts

## Configuration

Backend environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://fairqueue:fairqueue@postgres:5432/fairqueue` | Async SQLAlchemy database URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis URL |
| `ADMISSION_BATCH` | `5` | Users admitted per tick |
| `ADMISSION_INTERVAL_MS` | `4000` | Admission tick interval |
| `LOCK_TTL_SECONDS` | `90` | Seat lock TTL |
| `MAX_ADMITTED_PER_TRAIN` | `20` | Concurrent admitted users per train |
| `RATE_LIMIT_MAX` | `30` | Requests per window per IP and path |
| `RATE_LIMIT_WINDOW_SEC` | `10` | Rate-limit window |

## Project Layout

```text
fairqueue-stack/
  backend/
    app/
      main.py
      queue_service.py
      models.py
      db.py
      seed.py
      config.py
      redis_client.py
    Dockerfile
    requirements.txt
  frontend/
    app/
      page.jsx
      layout.jsx
      globals.css
    Dockerfile
    package.json
  locust/
    locustfile.py
  docker-compose.yml
  API.md
```

## Demo Boundaries

This project intentionally skips authentication and real payment processing.
For production, add idempotency keys, authenticated sessions, worker leadership
for admission, migrations, structured logging, and a payment provider callback
flow.
