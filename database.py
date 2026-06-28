from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def verify_connection() -> dict:
    """Test the database connection and return server info."""
    async with engine.connect() as conn:
        version = (await conn.execute(text("SELECT version()"))).scalar()
        db_name = (await conn.execute(text("SELECT current_database()"))).scalar()
        db_user = (await conn.execute(text("SELECT current_user"))).scalar()
        table_count = (await conn.execute(text(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
        ))).scalar()
    return {
        "server": version,
        "database": db_name,
        "user": db_user,
        "public_tables": table_count,
    }
