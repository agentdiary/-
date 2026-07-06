"""数据模型。

隐私红线(CLAUDE.md §5):
- 日记是最高敏感级数据,且严格按用户隔离
- 人格卡片必须保留出处(source_diary_id),可追溯、可删除
- 删除日记时级联删除衍生的对话对与人格卡片
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid4().hex


class User(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    # 内置名人化身:由人物设定 prompt 驱动而非日记蒸馏,不可登录
    is_builtin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_now)


class AuthToken(SQLModel, table=True):
    token: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=_now)


class DiaryEntry(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    user_id: str = Field(index=True)
    content: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ChatMessage(SQLModel, table=True):
    """化身对话记录。

    agent_owner_id = 化身属于谁;visitor_id = 谁在说话。
    自对话时两者相同;访问他人化身时不同,历史按 (owner, visitor) 对隔离。
    """

    id: str = Field(default_factory=_new_id, primary_key=True)
    agent_owner_id: str = Field(index=True)
    visitor_id: str = Field(index=True)
    role: str  # "user" | "avatar"
    content: str
    created_at: datetime = Field(default_factory=_now)


class DialoguePair(SQLModel, table=True):
    """蒸馏产物:情境 → 用户口吻回应,用于表层风格微调(LoRA)。"""

    id: str = Field(default_factory=_new_id, primary_key=True)
    user_id: str = Field(index=True)
    source_diary_id: str = Field(foreign_key="diaryentry.id", index=True)
    situation: str
    response: str
    created_at: datetime = Field(default_factory=_now)


class PersonaCard(SQLModel, table=True):
    """蒸馏产物:人格断言卡片,用于深层人格 RAG。

    出处通过 source_diary_id 追溯;新断言覆盖旧断言时置 superseded_by。
    """

    id: str = Field(default_factory=_new_id, primary_key=True)
    user_id: str = Field(index=True)
    source_diary_id: str = Field(foreign_key="diaryentry.id", index=True)
    assertion: str
    confidence: float = Field(ge=0.0, le=1.0)
    superseded_by: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=_now)
