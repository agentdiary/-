from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..distill.pipeline import run_pipeline_for_diary
from ..models import DialoguePair, DiaryEntry, PersonaCard

router = APIRouter(prefix="/diaries", tags=["diaries"])


class DiaryCreate(BaseModel):
    content: str


@router.get("")
def list_diaries(session: Session = Depends(get_session)) -> list[DiaryEntry]:
    stmt = select(DiaryEntry).order_by(DiaryEntry.created_at.desc())  # type: ignore[attr-defined]
    return list(session.exec(stmt))


@router.post("")
def create_diary(
    body: DiaryCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> DiaryEntry:
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="日记内容不能为空")
    diary = DiaryEntry(content=content)
    session.add(diary)
    session.commit()
    session.refresh(diary)
    # 蒸馏在后台异步执行,不阻塞保存;本地推理一篇约需十几秒到一分钟
    background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return diary


@router.delete("/{diary_id}")
def delete_diary(diary_id: str, session: Session = Depends(get_session)) -> dict:
    diary = session.get(DiaryEntry, diary_id)
    if diary is None:
        raise HTTPException(status_code=404, detail="日记不存在")
    # 隐私红线:级联删除所有衍生数据
    for pair in session.exec(select(DialoguePair).where(DialoguePair.source_diary_id == diary_id)):
        session.delete(pair)
    for card in session.exec(select(PersonaCard).where(PersonaCard.source_diary_id == diary_id)):
        session.delete(card)
    session.delete(diary)
    session.commit()
    return {"deleted": diary_id}
