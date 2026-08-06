"""用户发现与状态、账号资料(改名/改密/头像)。"""

import base64
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..auth import get_current_user, hash_password, verify_password
from ..config import AVATAR_DIR
from ..db import get_session
from ..models import (
    AuthToken,
    ChatMessage,
    DialoguePair,
    DiaryAllowedUser,
    DiaryEntry,
    DirectMessage,
    MatchReport,
    PersonaCard,
    User,
)
from ..ratelimit import check_rate_limit

router = APIRouter(prefix="/users", tags=["users"])

STATUS_TTL = timedelta(hours=24)

# 头像文件落在数据目录(与 agentdiary.db 同级),部署时随 AGENTDIARY_DATA_DIR
# 一起外置;时间戳存在 User.avatar_updated_at
MAX_AVATAR_BYTES = 8 * 1024 * 1024


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
    avatar_updated_at: datetime | None  # 有值 = 有自定义头像,兼作缓存指纹


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


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class UsernameChange(BaseModel):
    username: str


class AvatarUpload(BaseModel):
    image_base64: str


@router.put("/me/password")
def change_password(
    body: PasswordChange,
    request: Request,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    check_rate_limit(f"pwchange:{me.id}", max_calls=5, window_seconds=3600)
    if not verify_password(body.old_password, me.password_hash):
        raise HTTPException(status_code=403, detail="当前密码不对")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="新密码至少 6 位")
    me.password_hash = hash_password(body.new_password)
    session.add(me)
    # 吊销其他设备的 token,当前会话保留(改密后旧登录一律作废)
    current = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    for t in session.exec(select(AuthToken).where(AuthToken.user_id == me.id)):
        if t.token != current:
            session.delete(t)
    session.commit()
    return {"ok": True}


@router.put("/me/username")
def change_username(
    body: UsernameChange,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    username = body.username.strip()
    if not (2 <= len(username) <= 20):
        raise HTTPException(status_code=422, detail="用户名需 2~20 个字符")
    if username != me.username:
        if session.exec(select(User).where(User.username == username)).first():
            raise HTTPException(status_code=409, detail="用户名已被占用")
        me.username = username
        session.add(me)
        session.commit()
    return {"username": username}


class AccountDeletion(BaseModel):
    password: str


@router.delete("/me")
def delete_account(
    body: AccountDeletion,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """注销账号,连带删除全部衍生数据。

    Apple 审核指南 5.1.1(v) 要求可在 App 内自助注销;PIPL 的删除权同理。
    要求重输密码:token 被盗时不该能一键抹掉别人所有数据。

    删除范围对齐 CLAUDE.md §5「用户删除日记 → 级联删除衍生的对话对与人格
    卡片」,只是把粒度提到账号级。头像文件也一并删,否则数据没了文件还在。
    """
    check_rate_limit(f"delacct:{me.id}", max_calls=5, window_seconds=3600)
    if me.is_builtin:
        raise HTTPException(status_code=403, detail="内置化身账号不可注销")
    if not verify_password(body.password, me.password_hash):
        raise HTTPException(status_code=403, detail="密码不对")

    uid = me.id
    # 先删日记的从属表(DiaryAllowedUser 挂在 diary 上,不是 user 上)
    my_diaries = [d.id for d in session.exec(select(DiaryEntry).where(DiaryEntry.user_id == uid))]
    if my_diaries:
        for allow in session.exec(
            select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id.in_(my_diaries))  # type: ignore[attr-defined]
        ):
            session.delete(allow)
    # 他人日记对我的授权也要撤销
    for allow in session.exec(select(DiaryAllowedUser).where(DiaryAllowedUser.user_id == uid)):
        session.delete(allow)

    for model, columns in (
        (AuthToken, (AuthToken.user_id,)),
        (PersonaCard, (PersonaCard.user_id,)),
        (DialoguePair, (DialoguePair.user_id,)),
        (DiaryEntry, (DiaryEntry.user_id,)),
        # 双向的:我的化身被访问的记录、我访问别人化身的记录,都是我的数据
        (ChatMessage, (ChatMessage.agent_owner_id, ChatMessage.visitor_id)),
        (MatchReport, (MatchReport.owner_id, MatchReport.visitor_id)),
        (DirectMessage, (DirectMessage.sender_id, DirectMessage.recipient_id)),
    ):
        for col in columns:
            for row in session.exec(select(model).where(col == uid)):  # type: ignore[arg-type]
                session.delete(row)

    session.delete(me)
    session.commit()

    # 库删干净了再删文件:反过来的话中途失败会留下有记录无文件的悬空状态
    avatar = AVATAR_DIR / f"{uid}.img"
    if avatar.exists():
        avatar.unlink()

    return {"deleted": uid}


@router.put("/me/avatar")
def upload_avatar(
    body: AvatarUpload,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    check_rate_limit(f"avatar:{me.id}", max_calls=10, window_seconds=3600)
    try:
        raw = base64.b64decode(body.image_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=422, detail="图片数据无效")
    if len(raw) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=422, detail="图片太大(上限 8MB)")
    if not (raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=422, detail="仅支持 JPG/PNG")
    AVATAR_DIR.mkdir(exist_ok=True)
    (AVATAR_DIR / f"{me.id}.img").write_bytes(raw)
    me.avatar_updated_at = datetime.now(timezone.utc)
    session.add(me)
    session.commit()
    return {"avatar_updated_at": me.avatar_updated_at}


@router.get("/{user_id}/avatar")
def get_avatar(user_id: str):
    """头像文件。不鉴权:RN Image 带自定义头不方便,uuid 路径本身不可猜;
    头像非高敏数据(隐私红线只覆盖日记及衍生物)。"""
    path = AVATAR_DIR / f"{user_id}.img"
    if not path.exists():
        raise HTTPException(status_code=404, detail="没有头像")
    head = path.open("rb").read(8)
    media = "image/png" if head == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    return FileResponse(path, media_type=media)


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
                avatar_updated_at=user.avatar_updated_at,
            )
        )
    # 名人化身排在最前,给冷启动的发现页一个门面
    result.sort(key=lambda u: (not u.is_builtin, u.username))
    return result
