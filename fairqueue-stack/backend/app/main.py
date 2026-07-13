import asyncio
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, field_validator

from .db import get_session, SessionLocal
from .models import Train, Seat, Booking, User, OtpCode
from .seed import init_db_and_seed
from .config import settings
from .redis_client import close_redis
from .security import (
    create_access_token,
    generate_otp,
    get_current_user_from_token,
    hash_otp,
    hash_password,
    normalize_email,
    otp_expiry,
    require_admin,
    validate_email,
    validate_password,
    verify_password,
)
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
origins = [
    "https://fair-queue.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
)

class SignupReq(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)

    @field_validator('email')
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)

class LoginReq(BaseModel):
    email: str
    password: str

    @field_validator('email')
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)

class OtpRequestReq(BaseModel):
    email: str

    @field_validator('email')
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)

class OtpVerifyReq(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)

    @field_validator('email')
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)

    @field_validator('otp')
    @classmethod
    def otp_valid(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError('otp_must_be_numeric')
        return value

class PasswordResetReq(BaseModel):
    email: str
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('email')
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)

    @field_validator('otp')
    @classmethod
    def otp_valid(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError('otp_must_be_numeric')
        return value

class JoinReq(BaseModel):
    train_id: str

class LockReq(BaseModel):
    train_id: str
    seat_id: str

class ReleaseReq(BaseModel):
    seat_id: str

class PayReq(BaseModel):
    train_id: str
    seat_id: str
    passenger_name: str = 'Guest'
    passenger_age: int = 30

async def rate_guard(request: Request, path: str):
    ip = request.headers.get('x-forwarded-for', request.client.host if request.client else 'unknown').split(',')[0].strip()
    if not await q.rate_limit(ip, path):
        raise HTTPException(429, 'rate_limited')

async def current_user(authorization: str | None = Header(None), s: AsyncSession = Depends(get_session)) -> User:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(401, 'missing_bearer_token')
    return await get_current_user_from_token(authorization.split(' ', 1)[1].strip(), s)

async def current_admin(user: User = Depends(current_user)) -> User:
    return require_admin(user)

def user_out(user: User) -> dict:
    return {'id': user.id, 'email': user.email, 'name': user.name, 'role': user.role}

def auth_out(user: User) -> dict:
    return {'access_token': create_access_token(user), 'token_type': 'bearer', 'user': user_out(user)}

async def create_otp(s: AsyncSession, email: str, purpose: str) -> str:
    code = generate_otp()
    await s.execute(
        update(OtpCode)
        .where(OtpCode.email == email, OtpCode.purpose == purpose, OtpCode.consumed_at.is_(None))
        .values(consumed_at=datetime.utcnow())
    )
    s.add(OtpCode(
        id=str(uuid.uuid4()),
        email=email,
        purpose=purpose,
        code_hash=hash_otp(email, purpose, code),
        expires_at=otp_expiry(),
    ))
    await s.commit()
    return code

async def consume_otp(s: AsyncSession, email: str, purpose: str, code: str) -> None:
    code_hash = hash_otp(email, purpose, code)
    row = (await s.execute(
        select(OtpCode)
        .where(
            OtpCode.email == email,
            OtpCode.purpose == purpose,
            OtpCode.code_hash == code_hash,
            OtpCode.consumed_at.is_(None),
        )
        .order_by(OtpCode.created_at.desc())
    )).scalar_one_or_none()
    if not row or row.expires_at < datetime.utcnow():
        raise HTTPException(400, 'invalid_or_expired_otp')
    row.consumed_at = datetime.utcnow()
    await s.commit()

from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

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

@app.post('/auth/signup')
async def auth_signup(req: SignupReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'auth/signup')
    validate_password(req.password)
    email = normalize_email(req.email)
    existing = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, 'email_already_registered')
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        name=req.name.strip() if req.name else None,
        password_hash=hash_password(req.password),
        role='user',
        is_active=True,
    )
    s.add(user)
    try:
        await s.commit()
    except IntegrityError:
        await s.rollback()
        raise HTTPException(409, 'email_already_registered')
    return auth_out(user)

@app.post('/auth/login')
async def auth_login(req: LoginReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'auth/login')
    email = normalize_email(req.email)
    user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, 'invalid_email_or_password')
    return auth_out(user)

@app.post('/auth/otp/request')
async def auth_otp_request(req: OtpRequestReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'auth/otp/request')
    email = normalize_email(req.email)
    user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(404, 'user_not_found')
    code = await create_otp(s, email, 'login')
    response = {'success': True, 'message': 'otp_sent'}
    if settings.RETURN_DEV_OTP:
        response['dev_otp'] = code
    return response

@app.post('/auth/otp/verify')
async def auth_otp_verify(req: OtpVerifyReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'auth/otp/verify')
    email = normalize_email(req.email)
    await consume_otp(s, email, 'login', req.otp)
    user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(401, 'user_not_found_or_inactive')
    return auth_out(user)

@app.post('/auth/password/forgot')
async def auth_password_forgot(req: OtpRequestReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'auth/password/forgot')
    email = normalize_email(req.email)
    user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
    response = {'success': True, 'message': 'if_account_exists_otp_sent'}
    if user and user.is_active:
        code = await create_otp(s, email, 'reset')
        if settings.RETURN_DEV_OTP:
            response['dev_otp'] = code
    return response

@app.post('/auth/password/reset')
async def auth_password_reset(req: PasswordResetReq, request: Request, s: AsyncSession = Depends(get_session)):
    await rate_guard(request, 'auth/password/reset')
    validate_password(req.new_password)
    email = normalize_email(req.email)
    await consume_otp(s, email, 'reset', req.otp)
    user = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(404, 'user_not_found')
    user.password_hash = hash_password(req.new_password)
    await s.commit()
    return {'success': True}

@app.get('/auth/me')
async def auth_me(user: User = Depends(current_user)):
    return {'user': user_out(user)}

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
async def queue_join(req: JoinReq, request: Request, s: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    await rate_guard(request, 'queue/join')
    train = (await s.execute(select(Train).where(Train.id == req.train_id))).scalar_one_or_none()
    if not train:
        raise HTTPException(404, 'train_not_found')
    return await q.join_queue(req.train_id, user.id)

@app.get('/queue/status')
async def queue_status(train_id: str, user_id: str | None = None, user: User = Depends(current_user)):
    if user_id and user_id != user.id:
        raise HTTPException(403, 'cannot_read_other_user_queue')
    return await q.get_status(user.id, train_id)

@app.websocket('/ws/queue')
async def ws_queue(ws: WebSocket, train_id: str, token: str, user_id: str | None = None):
    try:
        async with SessionLocal() as s:
            user = await get_current_user_from_token(token, s)
        if user_id and user_id != user.id:
            await ws.close(code=1008)
            return
    except Exception:
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        while True:
            status = await q.get_status(user.id, train_id)
            await ws.send_json(status)
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        return

@app.post('/seats/lock')
async def seats_lock(req: LockReq, request: Request, s: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    await rate_guard(request, 'seats/lock')
    seat = (await s.execute(select(Seat).where(Seat.id == req.seat_id, Seat.train_id == req.train_id))).scalar_one_or_none()
    if not seat:
        raise HTTPException(404, 'seat_not_found')
    if seat.status == 'booked':
        raise HTTPException(409, 'seat_already_booked')
    result = await q.lock_seat(user.id, req.train_id, req.seat_id)
    if not result['success']:
        raise HTTPException(409, result.get('error', 'lock_failed'))
    return result

@app.post('/seats/release')
async def seats_release(req: ReleaseReq, user: User = Depends(current_user)):
    return await q.release_seat(user.id, req.seat_id)

@app.post('/payment/process')
async def payment_process(req: PayReq, request: Request, s: AsyncSession = Depends(get_session), user: User = Depends(current_user)):
    await rate_guard(request, 'payment/process')
    lock = await q.get_seat_lock(req.seat_id)
    if not lock or lock['user_id'] != user.id:
        raise HTTPException(409, 'lock_expired_or_invalid')
    await asyncio.sleep(0.6)  # mock payment latency
    lock = await q.get_seat_lock(req.seat_id)
    if not lock or lock['user_id'] != user.id:
        raise HTTPException(409, 'lock_expired_or_invalid')
    # Atomic seat update via SQL
    res = await s.execute(
        update(Seat).where(Seat.id == req.seat_id, Seat.status == 'available')
        .values(status='booked', booked_by=user.id).returning(Seat.id, Seat.label)
    )
    row = res.first()
    if not row:
        raise HTTPException(409, 'seat_already_booked')
    booking = Booking(
        id=str(uuid.uuid4()), user_id=user.id, train_id=req.train_id, seat_id=req.seat_id,
        seat_label=row.label, passenger_name=req.passenger_name, passenger_age=req.passenger_age,
        payment_id=f'PAY-{uuid.uuid4().hex[:8].upper()}', amount_inr=1499, status='confirmed',
    )
    s.add(booking)
    await s.commit()
    await q.mark_booked(user.id, req.train_id)
    await q.release_seat(user.id, req.seat_id)
    return {'success': True, 'booking': {
        'id': booking.id, 'user_id': booking.user_id, 'train_id': booking.train_id,
        'seat_id': booking.seat_id, 'seat_label': booking.seat_label,
        'passenger': {'name': booking.passenger_name, 'age': booking.passenger_age},
        'payment_id': booking.payment_id, 'amount_inr': booking.amount_inr, 'status': booking.status,
    }}

@app.get('/admin/stats')
async def admin_stats(s: AsyncSession = Depends(get_session), admin: User = Depends(current_admin)):
    base = await q.admin_stats()
    trains_n = len((await s.execute(select(Train))).scalars().all())
    seats_total = len((await s.execute(select(Seat))).scalars().all())
    seats_booked = len((await s.execute(select(Seat).where(Seat.status == 'booked'))).scalars().all())
    bookings_n = len((await s.execute(select(Booking))).scalars().all())
    return {**base, 'db': {'trains': trains_n, 'seats_total': seats_total, 'seats_booked': seats_booked, 'bookings': bookings_n}}

@app.post('/admin/reset')
async def admin_reset(s: AsyncSession = Depends(get_session), admin: User = Depends(current_admin)):
    await q.admin_reset()
    await s.execute(update(Seat).values(status='available', booked_by=None))
    await s.execute(Booking.__table__.delete())
    await s.commit()
    return {'success': True}

@app.get('/admin/users')
async def admin_users(s: AsyncSession = Depends(get_session), admin: User = Depends(current_admin)):
    rows = (await s.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return {'users': [
        {**user_out(row), 'is_active': row.is_active, 'created_at': row.created_at.isoformat()}
        for row in rows
    ]}

@app.delete('/admin/users/{user_id}')
async def admin_delete_user(user_id: str, s: AsyncSession = Depends(get_session), admin: User = Depends(current_admin)):
    if user_id == admin.id:
        raise HTTPException(400, 'cannot_delete_self')
    user = (await s.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, 'user_not_found')
    await s.execute(delete(OtpCode).where(OtpCode.email == user.email))
    await s.delete(user)
    await s.commit()
    return {'success': True}
