from sqlalchemy import select
from .db import SessionLocal, engine, Base
from .models import Train, Seat

SEED_TRAINS = [
    dict(id='tatkal-rajdhani-12951', name='Rajdhani Express', number='12951', source='New Delhi', dest='Mumbai Central', departure='16:55', arrival='08:35', date='Tomorrow', duration='15h 40m', coaches=4, seats_per_coach=12),
    dict(id='tatkal-shatabdi-12001', name='Shatabdi Express', number='12001', source='New Delhi', dest='Bhopal', departure='06:00', arrival='14:05', date='Tomorrow', duration='8h 05m', coaches=4, seats_per_coach=12),
    dict(id='tatkal-vande-22436', name='Vande Bharat', number='22436', source='New Delhi', dest='Varanasi', departure='06:00', arrival='14:00', date='Tomorrow', duration='8h 00m', coaches=4, seats_per_coach=12),
]

async def init_db_and_seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as s:
        existing = (await s.execute(select(Train))).scalars().all()
        if existing:
            return
        for t in SEED_TRAINS:
            s.add(Train(**t))
            for c in range(1, t['coaches'] + 1):
                for n in range(1, t['seats_per_coach'] + 1):
                    sid = f"{t['id']}-C{c}-S{n}"
                    s.add(Seat(id=sid, train_id=t['id'], coach=f'C{c}', seat_number=n, label=f"C{c}-{n:02d}", status='available'))
        await s.commit()
