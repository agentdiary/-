"""用户发现:列出其他用户,供「找 TA 的化身聊聊」入口。MVP 阶段全量列出,后续换匹配。"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..auth import get_current_user
from ..db import get_session
from ..models import PersonaCard, User

router = APIRouter(prefix="/users", tags=["users"])


class UserSummary(BaseModel):
    id: str
    username: str
    card_count: int  # 化身被喂养的程度,给访客一个预期
    is_builtin: bool  # 内置名人化身


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
            )
        )
    # 名人化身排在最前,给冷启动的发现页一个门面
    result.sort(key=lambda u: (not u.is_builtin, u.username))
    return result
