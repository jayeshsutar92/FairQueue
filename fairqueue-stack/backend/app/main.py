import asyncio
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from .db import get_session
from .models import Train, Seat, Booking
from .seed import init_db_and_seed
from .config import settings
from .redis_client import close_redis
from . import queue_service as q

_admission_task: asyncio.Task | None = None

async def admission_loop():
    while True:
        try:
            await q.admit_batch()
        except Exception as e:
            print('admission error', e)
        await asyncio.sleep(settings.ADMISSION_INTERVAL_MS / 1000)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_and_seed()
    global _admission_task
    _admission_task = asyncio.create_task(admission_loop())
    yield
    if _admission_task:
        _admission_task.cancel()
        try:
            await _admission_task
        except asyncio.CancelledError:
            pass
    await close_redis()

app = FastAPI(title='FairQueue API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

class JoinReq(BaseModel):
    train_id: str

class LockReq(BaseModel):
    user_id: str
    train_id: str
    seat_id: str

class ReleaseReq(BaseModel):
    user_id: str
    seat_id: str

class PayReq(BaseModel):
    user_id: str
    train_id: str
    seat_id: str
    passenger_name: str = 'Guest'
    passenger_age: int = 30

async def rate_guard(request: Request, path: str):
    ip = request.headers.get('x-forwarded-for', request.client.host if request.client else 'unknown').split(',')[0].strip()
    if not await q.rate_limit(ip, path):
        raise HTTPException(429, 'rate_limited')

@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'service': 'FairQueue',
        'config': {
            'admission_batch': settings.ADMISSION_BATCH,
            'admission_interval_ms': settings.ADMISSION_INTERVAL_MS,
            'lock_ttl_seconds': settings.LOCK_TTL_SECONDS,
            'max_admitted_per_train': settings.MAX_ADMITTED_PER_TRAIN,
            'rate_limit_max': settings.RATE_LIMIT_MAX,
            'rate_limit_window_sec': settings.RATE_LIMIT_WINDOW_SEC,
        },
    }

@app.get('/trains')
async def list_trains(s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Train))).scalars().all()
    return {'trains': [
        {'id': r.id, 'name': r.name, 'number': r.number, 'source': r.source, 'dest': r.dest,
         'departure': r.departure, 'arrival': r.arrival, 'duration': r.duration, 'date': r.date,
         'coaches': r.coaches, 'seats_per_coach': r.seats_per_coach}
        for r in rows
    ]}

@app.get('/trains/{train_id}/seats')
async def list_seats(train_id: str, s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Seat).where(Seat.train_id == train_id))).scalars().all()
    out = []
    for r in rows:
        lock = await q.get_seat_lock(r.id)
        out.append({
            'id': r.id, 'train_id': r.train_id, 'coach': r.coach, 'seat_number': r.seat_number,
            'label': r.label, 'status': r.status, 'booked_by': r.booked_by,
            'locked': lock is not None and r.status != 'booked',
            'locked_by': lock['user_id'][:8] if lock else None,
            'lock_ttl': lock['ttl'] if lock else None,
        })
    return {'train_id': train_id, 'seats': out}

@app.post('/queue/join')
async def queue_join(req: JoinReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'queue/join')
    train = (await s.execute(select(Train).where(Train.id == req.train_id))).scalar_one_or_none()
    if not train:
        raise HTTPException(404, 'train_not_found')
    return await q.join_queue(req.train_id)

@app.get('/queue/status')
async def queue_status(user_id: str, train_id: str):
    return await q.get_status(user_id, train_id)

@app.websocket('/ws/queue')
async def ws_queue(ws: WebSocket, user_id: str, train_id: str):
    await ws.accept()
    try:
        while True:
            status = await q.get_status(user_id, train_id)
            await ws.send_json(status)
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        return

@app.post('/seats/lock')
async def seats_lock(req: LockReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'seats/lock')
    seat = (await s.execute(select(Seat).where(Seat.id == req.seat_id, Seat.train_id == req.train_id))).scalar_one_or_none()
    if not seat:
        raise HTTPException(404, 'seat_not_found')
    if seat.status == 'booked':
        raise HTTPException(409, 'seat_already_booked')
    result = await q.lock_seat(req.user_id, req.train_id, req.seat_id)
    if not result['success']:
        raise HTTPException(409, result.get('error', 'lock_failed'))
    return result

@app.post('/seats/release')
async def seats_release(req: ReleaseReq):
    return await q.release_seat(req.user_id, req.seat_id)

@app.post('/payment/process')
async def payment_process(req: PayReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'payment/process')
    lock = await q.get_seat_lock(req.seat_id)
    if not lock or lock['user_id'] != req.user_id:
        raise HTTPException(409, 'lock_expired_or_invalid')
    await asyncio.sleep(0.6)  # mock payment latency
    lock = await q.get_seat_lock(req.seat_id)
    if not lock or lock['user_id'] != req.user_id:
        raise HTTPException(409, 'lock_expired_or_invalid')
    # Atomic seat update via SQL
    res = await s.execute(
        update(Seat).where(Seat.id == req.seat_id, Seat.status == 'available')
        .values(status='booked', booked_by=req.user_id).returning(Seat.id, Seat.label)
    )
    row = res.first()
    if not row:
        raise HTTPException(409, 'seat_already_booked')
    booking = Booking(
        id=str(uuid.uuid4()), user_id=req.user_id, train_id=req.train_id, seat_id=req.seat_id,
        seat_label=row.label, passenger_name=req.passenger_name, passenger_age=req.passenger_age,
        payment_id=f'PAY-{uuid.uuid4().hex[:8].upper()}', amount_inr=1499, status='confirmed',
    )
    s.add(booking)
    await s.commit()
    await q.mark_booked(req.user_id, req.train_id)
    await q.release_seat(req.user_id, req.seat_id)
    return {'success': True, 'booking': {
        'id': booking.id, 'user_id': booking.user_id, 'train_id': booking.train_id,
        'seat_id': booking.seat_id, 'seat_label': booking.seat_label,
        'passenger': {'name': booking.passenger_name, 'age': booking.passenger_age},
        'payment_id': booking.payment_id, 'amount_inr': booking.amount_inr, 'status': booking.status,
    }}

@app.get('/admin/stats')
async def admin_stats(s: AsyncSession = Depends(get_session)):
    base = await q.admin_stats()
    trains_n = len((await s.execute(select(Train))).scalars().all())
    seats_total = len((await s.execute(select(Seat))).scalars().all())
    seats_booked = len((await s.execute(select(Seat).where(Seat.status == 'booked'))).scalars().all())
    bookings_n = len((await s.execute(select(Booking))).scalars().all())
    return {**base, 'db': {'trains': trains_n, 'seats_total': seats_total, 'seats_booked': seats_booked, 'bookings': bookings_n}}

@app.post('/admin/reset')
async def admin_reset(s: AsyncSession = Depends(get_session)):
    await q.admin_reset()
    await s.execute(update(Seat).values(status='available', booked_by=None))
    await s.execute(Booking.__table__.delete())
    await s.commit()
    return {'success': True}
