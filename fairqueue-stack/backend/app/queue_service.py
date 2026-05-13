"""
Redis-backed FIFO queue using sorted sets.

Keys:
  q:waiting:{train_id}   - ZSET, score = epoch_ms (FIFO order), member = user_id
  q:admitted:{train_id}  - SET of admitted user_ids (also has TTL via separate keys)
  q:user:{user_id}       - HASH: train_id, status, joined_at
  seat:lock:{seat_id}    - STRING: user_id, with EXPIRE = LOCK_TTL_SECONDS
  stats:{counter}        - INCR counters
  rate:{ip}:{path}       - INCR with EXPIRE = RATE_LIMIT_WINDOW_SEC
"""
import time
import uuid
from typing import Optional
from .config import settings
from .redis_client import get_redis

WAITING = 'q:waiting:{tid}'
ADMITTED = 'q:admitted:{tid}'
USER = 'q:user:{uid}'
SEAT_LOCK = 'seat:lock:{sid}'

async def join_queue(train_id: str) -> dict:
    r = await get_redis()
    uid = str(uuid.uuid4())
    score = int(time.time() * 1000)
    pipe = r.pipeline()
    pipe.zadd(WAITING.format(tid=train_id), {uid: score})
    pipe.hset(USER.format(uid=uid), mapping={'train_id': train_id, 'status': 'waiting', 'joined_at': str(score)})
    pipe.incr('stats:total_joined')
    await pipe.execute()
    status = await get_status(uid, train_id)
    return {'user_id': uid, **status}

async def get_status(user_id: str, train_id: str) -> dict:
    r = await get_redis()
    user = await r.hgetall(USER.format(uid=user_id))
    if not user:
        return {'status': 'not_found', 'position': 0, 'queue_depth': 0, 'admitted_count': 0, 'eta_seconds': 0}
    rank = await r.zrank(WAITING.format(tid=train_id), user_id)
    depth = await r.zcard(WAITING.format(tid=train_id))
    admitted_count = await r.scard(ADMITTED.format(tid=train_id))
    is_admitted = await r.sismember(ADMITTED.format(tid=train_id), user_id)
    status = 'admitted' if is_admitted else (user.get('status') or 'waiting')
    if rank is None and not is_admitted:
        status = user.get('status', 'not_found')
    position = (rank or 0) + 1 if rank is not None else 0
    ahead = rank or 0
    eta = int((ahead / max(1, settings.ADMISSION_BATCH)) * (settings.ADMISSION_INTERVAL_MS / 1000))
    return {
        'status': status,
        'position': position if status == 'waiting' else 0,
        'queue_depth': depth,
        'admitted_count': admitted_count,
        'eta_seconds': eta,
    }

async def admit_batch():
    """Pop oldest N users from each waiting queue into admitted (subject to MAX_ADMITTED)."""
    r = await get_redis()
    # discover trains with waiting queues
    cursor = 0
    train_ids = set()
    while True:
        cursor, keys = await r.scan(cursor, match='q:waiting:*', count=100)
        for k in keys:
            train_ids.add(k.split(':')[-1])
        if cursor == 0:
            break
    for tid in train_ids:
        admitted_now = await r.scard(ADMITTED.format(tid=tid))
        slots = max(0, settings.MAX_ADMITTED_PER_TRAIN - admitted_now)
        n = min(settings.ADMISSION_BATCH, slots)
        if n <= 0:
            continue
        # Atomic pop N lowest-score members
        users = await r.zpopmin(WAITING.format(tid=tid), n)
        if not users:
            continue
        pipe = r.pipeline()
        for uid, _score in users:
            pipe.sadd(ADMITTED.format(tid=tid), uid)
            pipe.hset(USER.format(uid=uid), 'status', 'admitted')
            pipe.incr('stats:total_admitted')
        await pipe.execute()

async def lock_seat(user_id: str, train_id: str, seat_id: str) -> dict:
    r = await get_redis()
    is_admitted = await r.sismember(ADMITTED.format(tid=train_id), user_id)
    if not is_admitted:
        return {'success': False, 'error': 'not_admitted'}
    key = SEAT_LOCK.format(sid=seat_id)
    # SET NX EX  — only succeeds if no existing lock; atomic.
    ok = await r.set(key, user_id, nx=True, ex=settings.LOCK_TTL_SECONDS)
    if not ok:
        existing = await r.get(key)
        if existing == user_id:
            await r.expire(key, settings.LOCK_TTL_SECONDS)
            return {'success': True, 'ttl': settings.LOCK_TTL_SECONDS}
        return {'success': False, 'error': 'already_locked'}
    return {'success': True, 'ttl': settings.LOCK_TTL_SECONDS}

async def release_seat(user_id: str, seat_id: str) -> dict:
    r = await get_redis()
    key = SEAT_LOCK.format(sid=seat_id)
    cur = await r.get(key)
    if cur == user_id:
        await r.delete(key)
        return {'success': True}
    return {'success': False, 'error': 'not_owner'}

async def get_seat_lock(seat_id: str) -> Optional[dict]:
    r = await get_redis()
    key = SEAT_LOCK.format(sid=seat_id)
    val = await r.get(key)
    if val is None:
        return None
    ttl = await r.ttl(key)
    return {'user_id': val, 'ttl': ttl}

async def mark_booked(user_id: str, train_id: str):
    r = await get_redis()
    pipe = r.pipeline()
    pipe.srem(ADMITTED.format(tid=train_id), user_id)
    pipe.hset(USER.format(uid=user_id), 'status', 'booked')
    pipe.incr('stats:total_booked')
    await pipe.execute()

async def rate_limit(ip: str, path: str) -> bool:
    r = await get_redis()
    key = f'rate:{ip}:{path}'
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, settings.RATE_LIMIT_WINDOW_SEC)
    if count > settings.RATE_LIMIT_MAX:
        await r.incr('stats:total_rate_limited')
        return False
    return True

async def admin_stats() -> dict:
    r = await get_redis()
    keys = ['stats:total_joined', 'stats:total_admitted', 'stats:total_booked', 'stats:total_rate_limited']
    vals = await r.mget(keys)
    cursor = 0
    queues = {}
    while True:
        cursor, ks = await r.scan(cursor, match='q:waiting:*', count=100)
        for k in ks:
            tid = k.split(':')[-1]
            queues.setdefault(tid, {})
            queues[tid]['waiting'] = await r.zcard(k)
        if cursor == 0:
            break
    cursor = 0
    while True:
        cursor, ks = await r.scan(cursor, match='q:admitted:*', count=100)
        for k in ks:
            tid = k.split(':')[-1]
            queues.setdefault(tid, {})
            queues[tid]['admitted'] = await r.scard(k)
        if cursor == 0:
            break
    cursor = 0
    locks = []
    while True:
        cursor, ks = await r.scan(cursor, match='seat:lock:*', count=100)
        for k in ks:
            uid = await r.get(k)
            ttl = await r.ttl(k)
            locks.append({'seat_id': k.split(':', 2)[-1], 'user_id': uid, 'ttl': ttl})
        if cursor == 0:
            break
    return {
        'stats': {
            'total_joined': int(vals[0] or 0),
            'total_admitted': int(vals[1] or 0),
            'total_booked': int(vals[2] or 0),
            'total_rate_limited': int(vals[3] or 0),
        },
        'queues': queues,
        'active_locks': locks[:50],
        'active_lock_count': len(locks),
    }

async def admin_reset():
    r = await get_redis()
    await r.flushdb()
