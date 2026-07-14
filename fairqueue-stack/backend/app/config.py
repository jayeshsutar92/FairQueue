from pydantic_settings import BaseSettings



class Settings(BaseSettings):
    DATABASE_URL: str = 'postgresql+asyncpg://fairqueue:fairqueue@postgres:5432/fairqueue'
    REDIS_URL: str = 'redis://localhost:6379/0'
    JWT_SECRET: str = 'dev-change-me-fairqueue-secret'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    OTP_EXPIRE_MINUTES: int = 10
    RETURN_DEV_OTP: bool = False
    SHOW_DEV_OTP: bool = False
    ADMIN_EMAIL: str = 'admin@fairqueue.local'
    ADMIN_PASSWORD: str = 'AdminPass123!'
    ADMISSION_BATCH: int = 5
    RATE_LIMIT_MAX: int = 30
    RATE_LIMIT_WINDOW_SEC: int = 10

settings = Settings()
