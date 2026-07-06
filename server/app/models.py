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
    # 化身状态(微信状态式):24 小时后自动过期,给化身「今天」的实在感
    status_text: str | None = Field(default=None)
    status_updated_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=_now)


class AuthToken(SQLModel, table=True):
    token: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=_now)


class DiaryEntry(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    user_id: str = Field(index=True)
    content: str
    # 可见性分级:public=化身可对所有访客使用其衍生卡片;
    # restricted=仅 DiaryAllowedUser 中指定的访客;private=仅自己(自聊)
    visibility: str = Field(default="public")
    # 手势锁标记:客户端据此隐藏预览并要求图案验证(图案本身仅存客户端本机)
    locked: bool = Field(default=False)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class DiaryAllowedUser(SQLModel, table=True):
    """restricted 日记的访客白名单。"""

    id: str = Field(default_factory=_new_id, primary_key=True)
    diary_id: str = Field(foreign_key="diaryentry.id", index=True)
    user_id: str = Field(index=True)


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
