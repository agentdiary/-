"""人格卡片查看接口(可追溯性:每张卡片都能看到出处日记)。"""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import PersonaCard

router = APIRouter(prefix="/persona-cards", tags=["persona"])


@router.get("")
def list_cards(session: Session = Depends(get_session)) -> list[PersonaCard]:
    stmt = select(PersonaCard).order_by(PersonaCard.created_at.desc())  # type: ignore[attr-defined]
    return list(session.exec(stmt))
