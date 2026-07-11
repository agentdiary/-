"""真人对话(DM):AI 裁判解锁后,两个真实用户直接对话——化身社交漏斗的终点。

历史按用户对隔离;解锁校验在每次读写时做(报告被删则通道自然关闭)。
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, and_, or_, select

from ..auth import get_current_user
from ..db import get_session
from ..models import DirectMessage, User
from ..ratelimit import check_rate_limit
from .judge import pair_unlocked

router = APIRouter(prefix="/dm", tags=["dm"])

MAX_MESSAGES = 200
MAX_LEN = 2000


class DMOut(BaseModel):
    id: str
    sender_id: str
    content: str
    created_at: datetime


class DMSend(BaseModel):
    content: str


def _resolve_peer(user_id: str, me: User, session: Session) -> User:
    peer = session.get(User, user_id)
    if peer is None or peer.id == me.id:
        raise HTTPException(status_code=404, detail="用户不存在")
    if peer.is_builtin:
        raise HTTPException(status_code=400, detail="名人化身没有真人对话")
    if not pair_unlocked(session, me.id, peer.id):
        raise HTTPException(
            status_code=403, detail="真人对话未解锁:先和 TA 的化身聊,再请 AI 裁判评估"
        )
    return peer


def _between(a: str, b: str):
    return or_(
        and_(DirectMessage.sender_id == a, DirectMessage.recipient_id == b),
        and_(DirectMessage.sender_id == b, DirectMessage.recipient_id == a),
    )


@router.get("/{user_id}")
def list_messages(
    user_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[DMOut]:
    peer = _resolve_peer(user_id, me, session)
    stmt = (
        select(DirectMessage)
        .where(_between(me.id, peer.id))
        .order_by(DirectMessage.created_at.desc())  # type: ignore[attr-defined]
        .limit(MAX_MESSAGES)
    )
    # 新→旧,供客户端 inverted 列表直接用
    return [
        DMOut(id=m.id, sender_id=m.sender_id, content=m.content, created_at=m.created_at)
        for m in session.exec(stmt)
    ]


@router.post("/{user_id}")
def send_message(
    user_id: str,
    body: DMSend,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DMOut:
    # 真人打字没有 LLM 开销,放宽;防脚本刷屏即可
    check_rate_limit(f"dm:{me.id}", max_calls=240, window_seconds=3600)
    peer = _resolve_peer(user_id, me, session)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="消息不能为空")
    if len(content) > MAX_LEN:
        raise HTTPException(status_code=422, detail=f"消息最长 {MAX_LEN} 字")
    msg = DirectMessage(sender_id=me.id, recipient_id=peer.id, content=content)
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return DMOut(id=msg.id, sender_id=msg.sender_id, content=msg.content, created_at=msg.created_at)
