# FairQueue API

Base URL: `http://localhost:8000`

All endpoints return JSON. Errors: `{ "detail": "<code>" }` with non-2xx.

Interactive docs: **`/docs`** (Swagger) and **`/redoc`**.

## Health

### `GET /health`
Returns service status and current config.

## Trains

### `GET /trains`
List seeded trains.
```json
{ "trains": [ { "id": "tatkal-rajdhani-12951", "name": "Rajdhani Express", ... } ] }
```

### `GET /trains/{train_id}/seats`
Returns seat map with live lock overlay.
```json
{ "train_id": "...", "seats": [ { "id": "...-C1-S1", "label": "C1-01", "status": "available|booked", "locked": false, "locked_by": null, "lock_ttl": null } ] }
```

## Queue

### `POST /queue/join`
Join the virtual waiting room for a train.
```json
// body
{ "train_id": "tatkal-rajdhani-12951" }
// 200
{ "user_id": "uuid", "status": "waiting", "position": 12, "queue_depth": 12, "admitted_count": 5, "eta_seconds": 10 }
```
Rate-limited per (ip, path).

### `GET /queue/status?user_id&train_id`
One-shot status.

### `WS /ws/queue?user_id&train_id`
Live status push every ~1.5s. Closes when client disconnects.

## Seats

### `POST /seats/lock`
Requires admitted status. Atomic `SET NX EX` on `seat:lock:{id}` with TTL.
```json
{ "user_id": "...", "train_id": "...", "seat_id": "...-C1-S1" }
// 200
{ "success": true, "ttl": 90 }
// 409 if already locked by another user or already booked
```

### `POST /seats/release`
Voluntary release. No-op if not lock owner.

## Payment (mock)

### `POST /payment/process`
Validates lock ownership, then atomically transitions the seat to `booked` via
`UPDATE seats SET status='booked' WHERE id=$1 AND status='available'`. If 0
rows updated (race lost), returns 409.
```json
{ "user_id": "...", "train_id": "...", "seat_id": "...", "passenger_name": "...", "passenger_age": 28 }
// 200
{ "success": true, "booking": { "id": "...", "payment_id": "PAY-XXXX", "seat_label": "C1-01", ... } }
```

## Admin

### `GET /admin/stats`
Global counters + per-train queue depths + active locks + DB totals.

### `POST /admin/reset`
Dangerous: `FLUSHDB` Redis, mark all seats available, delete bookings. Demo only.

## Status codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 404 | train/seat not found |
| 409 | lock conflict / already booked / not admitted |
| 429 | rate limit exceeded |
| 500 | internal |
