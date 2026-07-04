"""人格卡片查看接口(可追溯性:每张卡片都能看到出处日记)。只能看自己的。"""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import PersonaCard, User

router = APIRouter(prefix="/persona-cards", tags=["persona"])


@router.get("")
def list_cards(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[PersonaCard]:
    stmt = (
        select(PersonaCard)
        .where(PersonaCard.user_id == me.id)
        .order_by(PersonaCard.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(stmt))
