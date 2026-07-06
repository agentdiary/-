"""SQLite 存储。生产化前需换加密存储方案(隐私红线:存储加密)。"""

import logging
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, text

DB_PATH = Path(__file__).resolve().parent.parent / "agentdiary.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

logger = logging.getLogger(__name__)

# 旧单人版数据在多用户迁移时归入此账号(密码见 README)
LEGACY_USERNAME = "1iyi"
LEGACY_PASSWORD = "agentdiary"


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def _migrate(conn) -> None:
    """SQLite 简易迁移:create_all 不会给已存在的表加列,这里手动补。"""
    added = []
    for table in ("diaryentry", "dialoguepair", "personacard"):
        if conn.execute(text(f"SELECT name FROM sqlite_master WHERE name='{table}'")).fetchone():
            if not _column_exists(conn, table, "user_id"):
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id TEXT"))
                added.append(f"{table}.user_id")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='chatmessage'")).fetchone():
        for col in ("agent_owner_id", "visitor_id"):
            if not _column_exists(conn, "chatmessage", col):
                conn.execute(text(f"ALTER TABLE chatmessage ADD COLUMN {col} TEXT"))
                added.append(f"chatmessage.{col}")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='user'")).fetchone():
        if not _column_exists(conn, "user", "is_builtin"):
            conn.execute(text("ALTER TABLE user ADD COLUMN is_builtin BOOLEAN DEFAULT 0"))
            added.append("user.is_builtin")
        for col, ddl in (
            ("status_text", "ALTER TABLE user ADD COLUMN status_text TEXT"),
            ("status_updated_at", "ALTER TABLE user ADD COLUMN status_updated_at TIMESTAMP"),
        ):
            if not _column_exists(conn, "user", col):
                conn.execute(text(ddl))
                added.append(f"user.{col}")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='diaryentry'")).fetchone():
        if not _column_exists(conn, "diaryentry", "visibility"):
            conn.execute(
                text("ALTER TABLE diaryentry ADD COLUMN visibility TEXT DEFAULT 'public'")
            )
            added.append("diaryentry.visibility")
        if not _column_exists(conn, "diaryentry", "locked"):
            conn.execute(text("ALTER TABLE diaryentry ADD COLUMN locked BOOLEAN DEFAULT 0"))
            added.append("diaryentry.locked")
    if added:
        logger.warning("迁移新增列: %s", added)


def _adopt_orphans() -> None:
    """把无归属的旧数据划给 legacy 账号(单人版历史数据)。"""
    from .auth import hash_password
    from .models import User

    with Session(engine) as session:
        orphan = session.execute(
            text("SELECT COUNT(*) FROM diaryentry WHERE user_id IS NULL")
        ).scalar_one()
        if not orphan:
            return
        from sqlmodel import select

        legacy = session.exec(select(User).where(User.username == LEGACY_USERNAME)).first()
        if legacy is None:
            legacy = User(username=LEGACY_USERNAME, password_hash=hash_password(LEGACY_PASSWORD))
            session.add(legacy)
            session.commit()
            session.refresh(legacy)
        for table in ("diaryentry", "dialoguepair", "personacard"):
            session.execute(
                text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": legacy.id},
            )
        session.execute(
            text(
                "UPDATE chatmessage SET agent_owner_id = :uid, visitor_id = :uid "
                "WHERE agent_owner_id IS NULL"
            ),
            {"uid": legacy.id},
        )
        session.commit()
        logger.warning("已把 %d 篇旧日记及衍生数据归入账号 %s", orphan, LEGACY_USERNAME)


def _seed_celebrities() -> None:
    """创建内置名人化身账号(随机密码,不可登录)。"""
    import secrets

    from sqlmodel import select

    from .auth import hash_password
    from .celebrities import CELEBRITY_PERSONAS
    from .models import User

    with Session(engine) as session:
        for name in CELEBRITY_PERSONAS:
            if session.exec(select(User).where(User.username == name)).first() is None:
                session.add(
                    User(
                        username=name,
                        password_hash=hash_password(secrets.token_hex(16)),
                        is_builtin=True,
                    )
                )
                logger.warning("已创建内置名人化身: %s", name)
        session.commit()


def init_db() -> None:
    with engine.begin() as conn:
        _migrate(conn)
    SQLModel.metadata.create_all(engine)
    _adopt_orphans()
    _seed_celebrities()


def get_session():
    with Session(engine) as session:
        yield session
