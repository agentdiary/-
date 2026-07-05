from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..distill.pipeline import run_pipeline_for_diary
from ..ratelimit import check_rate_limit
from ..models import DialoguePair, DiaryAllowedUser, DiaryEntry, PersonaCard, User

router = APIRouter(prefix="/diaries", tags=["diaries"])

VISIBILITIES = {"public", "restricted", "private"}


class DiaryCreate(BaseModel):
    content: str
    # public=化身可对所有人透露 / restricted=仅指定用户 / private=仅自己
    visibility: str = "public"
    allowed_user_ids: list[str] = []


@router.get("")
def list_diaries(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[DiaryEntry]:
    stmt = (
        select(DiaryEntry)
        .where(DiaryEntry.user_id == me.id)
        .order_by(DiaryEntry.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(stmt))


@router.post("")
def create_diary(
    body: DiaryCreate,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DiaryEntry:
    # 每篇日记都会触发多次 LLM 蒸馏,限 20 篇/天防滥用
    check_rate_limit(f"diary:{me.id}", max_calls=20, window_seconds=86400)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="日记内容不能为空")
    if body.visibility not in VISIBILITIES:
        raise HTTPException(status_code=422, detail="可见性取值不合法")
    diary = DiaryEntry(user_id=me.id, content=content, visibility=body.visibility)
    session.add(diary)
    session.commit()
    session.refresh(diary)
    if body.visibility == "restricted":
        for uid in set(body.allowed_user_ids):
            session.add(DiaryAllowedUser(diary_id=diary.id, user_id=uid))
        session.commit()
    # 蒸馏在后台异步执行,不阻塞保存;本地推理一篇约需十几秒到一分钟
    background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return diary


def _owned_diary(diary_id: str, me: User, session: Session) -> DiaryEntry:
    diary = session.get(DiaryEntry, diary_id)
    if diary is None or diary.user_id != me.id:
        # 不区分「不存在」与「不是你的」,避免泄露他人日记 id 的存在性
        raise HTTPException(status_code=404, detail="日记不存在")
    return diary


class VisibilityUpdate(BaseModel):
    visibility: str
    # 传了就整体替换白名单;不传则保持原样
    allowed_user_ids: list[str] | None = None


@router.patch("/{diary_id}")
def update_visibility(
    diary_id: str,
    body: VisibilityUpdate,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DiaryEntry:
    if body.visibility not in VISIBILITIES:
        raise HTTPException(status_code=422, detail="可见性取值不合法")
    diary = _owned_diary(diary_id, me, session)
    diary.visibility = body.visibility
    if body.allowed_user_ids is not None:
        for row in session.exec(
            select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id == diary.id)
        ):
            session.delete(row)
        if body.visibility == "restricted":
            for uid in set(body.allowed_user_ids):
                session.add(DiaryAllowedUser(diary_id=diary.id, user_id=uid))
    session.add(diary)
    session.commit()
    session.refresh(diary)
    return diary


@router.get("/{diary_id}/allowed")
def get_allowed_users(
    diary_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    diary = _owned_diary(diary_id, me, session)
    ids = [
        row.user_id
        for row in session.exec(
            select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id == diary.id)
        )
    ]
    return {"allowed_user_ids": ids}


@router.post("/{diary_id}/distill")
def redistill(
    diary_id: str,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """手动重跑一篇日记的蒸馏(先清掉旧衍生数据,避免重复)。"""
    diary = _owned_diary(diary_id, me, session)
    for pair in session.exec(select(DialoguePair).where(DialoguePair.source_diary_id == diary.id)):
        session.delete(pair)
    for card in session.exec(select(PersonaCard).where(PersonaCard.source_diary_id == diary.id)):
        session.delete(card)
    session.commit()
    background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return {"status": "queued", "diary_id": diary.id}


@router.delete("/{diary_id}")
def delete_diary(
    diary_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    diary = _owned_diary(diary_id, me, session)
    # 隐私红线:级联删除所有衍生数据
    for pair in session.exec(select(DialoguePair).where(DialoguePair.source_diary_id == diary.id)):
        session.delete(pair)
    for card in session.exec(select(PersonaCard).where(PersonaCard.source_diary_id == diary.id)):
        session.delete(card)
    for allow in session.exec(
        select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id == diary.id)
    ):
        session.delete(allow)
    session.delete(diary)
    session.commit()
    return {"deleted": diary.id}
