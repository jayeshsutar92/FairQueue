from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class Train(Base):
    __tablename__ = 'trains'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    number: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String)
    dest: Mapped[str] = mapped_column(String)
    departure: Mapped[str] = mapped_column(String)
    arrival: Mapped[str] = mapped_column(String)
    duration: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)
    coaches: Mapped[int] = mapped_column(Integer, default=4)
    seats_per_coach: Mapped[int] = mapped_column(Integer, default=12)

class Seat(Base):
    __tablename__ = 'seats'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    train_id: Mapped[str] = mapped_column(ForeignKey('trains.id'))
    coach: Mapped[str] = mapped_column(String)
    seat_number: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default='available')  # available|booked
    booked_by: Mapped[str | None] = mapped_column(String, nullable=True)

class Booking(Base):
    __tablename__ = 'bookings'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String)
    train_id: Mapped[str] = mapped_column(String)
    seat_id: Mapped[str] = mapped_column(String)
    seat_label: Mapped[str] = mapped_column(String)
    passenger_name: Mapped[str] = mapped_column(String)
    passenger_age: Mapped[int] = mapped_column(Integer)
    payment_id: Mapped[str] = mapped_column(String)
    amount_inr: Mapped[int] = mapped_column(Integer, default=1499)
    status: Mapped[str] = mapped_column(String, default='confirmed')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default='user')  # user|admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OtpCode(Base):
    __tablename__ = 'otp_codes'
    __table_args__ = (
        UniqueConstraint('email', 'purpose', 'code_hash', name='uq_otp_email_purpose_hash'),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)  # login|reset
    code_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
