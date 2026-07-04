"""数据模型。

隐私红线(CLAUDE.md §5):
- 日记是最高敏感级数据
- 人格卡片必须保留出处(source_diary_ids),可追溯、可删除
- 删除日记时级联删除衍生的对话对与人格卡片
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid4().hex


class DiaryEntry(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    content: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class DialoguePair(SQLModel, table=True):
    """蒸馏产物:情境 → 用户口吻回应,用于表层风格微调(LoRA)。"""

    id: str = Field(default_factory=_new_id, primary_key=True)
    source_diary_id: str = Field(foreign_key="diaryentry.id", index=True)
    situation: str
    response: str
    created_at: datetime = Field(default_factory=_now)


class PersonaCard(SQLModel, table=True):
    """蒸馏产物:人格断言卡片,用于深层人格 RAG。

    出处通过 source_diary_id 追溯;新断言覆盖旧断言时置 superseded_by。
    """

    id: str = Field(default_factory=_new_id, primary_key=True)
    source_diary_id: str = Field(foreign_key="diaryentry.id", index=True)
    assertion: str
    confidence: float = Field(ge=0.0, le=1.0)
    superseded_by: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=_now)
