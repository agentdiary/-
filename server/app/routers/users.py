"""用户发现与状态。列出其他用户供「找 TA 的化身聊聊」;状态给化身「今天」的实在感。"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..auth import get_current_user
from ..db import get_session
from ..models import PersonaCard, User

router = APIRouter(prefix="/users", tags=["users"])

STATUS_TTL = timedelta(hours=24)


def current_status(user: User) -> str | None:
    """未过期的状态文本;超过 24 小时视为过期(微信状态式)。"""
    if not user.status_text or user.status_updated_at is None:
        return None
    updated = user.status_updated_at
    if updated.tzinfo is None:  # SQLite 存的是 naive UTC
        updated = updated.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - updated > STATUS_TTL:
        return None
    return user.status_text


class UserSummary(BaseModel):
    id: str
    username: str
    card_count: int  # 化身被喂养的程度,给访客一个预期
    is_builtin: bool  # 内置名人化身
    status: str | None  # 当前有效状态


class StatusUpdate(BaseModel):
    status: str | None  # None 或空串 = 清除状态


@router.put("/me/status")
def set_status(
    body: StatusUpdate,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    text = (body.status or "").strip()
    if len(text) > 50:
        raise HTTPException(status_code=422, detail="状态最多 50 字")
    me.status_text = text or None
    me.status_updated_at = datetime.now(timezone.utc) if text else None
    session.add(me)
    session.commit()
    return {"status": text or None}


@router.get("/me/status")
def get_my_status(me: User = Depends(get_current_user)) -> dict:
    return {"status": current_status(me)}


@router.get("")
def list_users(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[UserSummary]:
    result = []
    for user in session.exec(select(User).where(User.id != me.id)):
        count = session.exec(
            select(func.count()).select_from(PersonaCard).where(PersonaCard.user_id == user.id)
        ).one()
        result.append(
            UserSummary(
                id=user.id,
                username=user.username,
                card_count=count,
                is_builtin=user.is_builtin,
                status=current_status(user),
            )
        )
    # 名人化身排在最前,给冷启动的发现页一个门面
    result.sort(key=lambda u: (not u.is_builtin, u.username))
    return result
