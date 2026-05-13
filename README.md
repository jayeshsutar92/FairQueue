# FairQueue

FairQueue is a distributed systems prototype for a high-concurrency
train-seat booking flow inspired by IRCTC Tatkal.

The active project lives in [`fairqueue-stack`](./fairqueue-stack):

- FastAPI async backend
- Redis FIFO waiting room, TTL locks, and rate limiting
- PostgreSQL booking storage with atomic seat confirmation
- Next.js frontend
- WebSocket queue updates
- Locust load-test scenario
- Docker Compose orchestration

## Run

```bash
cd fairqueue-stack
docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- Backend docs: http://localhost:8000/docs
- Locust: http://localhost:8089

See [`fairqueue-stack/README.md`](./fairqueue-stack/README.md) for full setup,
API notes, and verification steps.
