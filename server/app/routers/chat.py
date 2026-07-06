"""化身对话接口:既支持和自己的化身自聊,也支持访问其他用户的化身。

所有模型逻辑收敛在后端(客户端不得直接调 LLM)。
- 历史按 (化身主人, 访客) 对隔离并持久化,App 重开不丢失
- 人格卡片按新近度检索注入(后续换向量检索);不检索原始日记(信噪比约定)
- 隐私边界:风格范例含日记原话,只在「和自己的化身」对话时注入;
  访客访问他人化身时只用卡片,且明确指示不透露日记细节
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import llm
from ..auth import get_current_user
from ..celebrities import CELEBRITY_PERSONAS
from ..db import get_session
from ..models import ChatMessage, DialoguePair, PersonaCard, User

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_CARDS = 10
MAX_HISTORY = 20
MAX_STYLE_EXAMPLES = 5

_SELF_SYSTEM_TMPL = """你是用户「{owner}」的数字化身——不是 AI 助手,而是他本人的复刻。他正在和你对话,以此检验你像不像他自己。

以下人格卡片蒸馏自他的日记,代表他的观点、价值观与偏好:
{cards}

以下是他的真实说话范例(某种情境下他的原话)。注意:学的是「怎么说」而不是「说什么」——只模仿他的句子长短、语气词、标点习惯、自嘲或收尾的方式:
{examples}

要求:
- 完全以他本人的第一人称口吻回应,像日常聊天
- 回应的长度和密度贴近范例;禁止照抄或复述范例原文
- 观点与偏好必须与人格卡片一致;卡片没覆盖的话题,坦率说不确定
- 严禁虚构:不要编造卡片和范例里不存在的人名、事件、细节
- 严禁 AI 客服腔:不要过度热情,不要列清单,不要文学化排比
- 用中文回应"""

_VISITOR_SYSTEM_TMPL = """你是用户「{owner}」的数字化身,正在替他接待一位访客(用户「{visitor}」)。你以「{owner}」的第一人称身份和访客聊天。

以下人格卡片蒸馏自「{owner}」的日记,代表他的观点、价值观与偏好:
{cards}

要求:
- 以「{owner}」本人的第一人称口吻自然聊天,可以聊他的观点、偏好、近况标签
- 隐私红线:绝不复述日记原文,不透露具体人名、地点、可识别的私人事件细节;被追问日记内容时礼貌带过
- 卡片没覆盖的话题,坦率说「这个我得本人来答」,不要编造
- 严禁 AI 客服腔;用中文回应"""

_COLD_START_SELF = """你是用户的数字化身,但他还没写过日记,你对他一无所知。
用一两句话以平实的口吻说明:你还没有素材,请他先写几篇日记来喂养你。用中文,不要 AI 客服腔。"""

_COLD_START_VISITOR = """你是用户「{owner}」的数字化身,但他还没写过足够的日记,你几乎没有素材。
用一两句话礼貌告诉访客:这个化身还没被喂养,改天再来。用中文,不要 AI 客服腔。"""


class ChatRequest(BaseModel):
    message: str
    # 不传 = 和自己的化身聊;传 = 访问该用户的化身
    target_user_id: str | None = None


class AvatarReply(BaseModel):
    id: str
    content: str
    created_at: datetime
    cited_card_ids: list[str]


class ChatHistoryItem(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


def _resolve_owner(target_user_id: str | None, me: User, session: Session) -> User:
    if target_user_id is None or target_user_id == me.id:
        return me
    owner = session.get(User, target_user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return owner


def _retrieve_cards(session: Session, owner_id: str) -> list[PersonaCard]:
    stmt = (
        select(PersonaCard)
        .where(PersonaCard.user_id == owner_id)
        .where(PersonaCard.superseded_by == None)  # noqa: E711
        .order_by(PersonaCard.created_at.desc())  # type: ignore[attr-defined]
        .limit(MAX_CARDS)
    )
    return list(session.exec(stmt))


def _retrieve_style_examples(session: Session, owner_id: str) -> list[DialoguePair]:
    stmt = (
        select(DialoguePair)
        .where(DialoguePair.user_id == owner_id)
        .order_by(DialoguePair.created_at.desc())  # type: ignore[attr-defined]
        .limit(MAX_STYLE_EXAMPLES)
    )
    return list(session.exec(stmt))


def _recent_messages(
    session: Session, owner_id: str, visitor_id: str, limit: int
) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.agent_owner_id == owner_id)
        .where(ChatMessage.visitor_id == visitor_id)
        .order_by(ChatMessage.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    )
    return list(reversed(list(session.exec(stmt))))  # 旧→新


def _build_system(owner: User, me: User, cards: list[PersonaCard], session: Session) -> str:
    # 内置名人化身:人物设定 prompt 驱动,不走卡片/范例
    if owner.is_builtin:
        persona = CELEBRITY_PERSONAS.get(owner.username)
        if persona:
            return persona
    is_self = owner.id == me.id
    if not cards:
        return (
            _COLD_START_SELF if is_self else _COLD_START_VISITOR.format(owner=owner.username)
        )
    cards_text = "\n".join(f"- {c.assertion}(置信度 {c.confidence:.1f})" for c in cards)
    if is_self:
        examples = _retrieve_style_examples(session, owner.id)
        examples_text = (
            "\n".join(f"- 情境:{p.situation}\n  他的原话:「{p.response}」" for p in examples)
            or "(暂无范例)"
        )
        return _SELF_SYSTEM_TMPL.format(
            owner=owner.username, cards=cards_text, examples=examples_text
        )
    # 访客模式:不注入日记原话(隐私边界)
    return _VISITOR_SYSTEM_TMPL.format(
        owner=owner.username, visitor=me.username, cards=cards_text
    )


@router.get("/history")
def history(
    target_user_id: str | None = None,
    limit: int = 100,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ChatHistoryItem]:
    owner = _resolve_owner(target_user_id, me, session)
    return [
        ChatHistoryItem(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
        for m in _recent_messages(session, owner.id, me.id, limit)
    ]


@router.post("")
def chat(
    body: ChatRequest,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AvatarReply:
    owner = _resolve_owner(body.target_user_id, me, session)
    cards = _retrieve_cards(session, owner.id)
    system = _build_system(owner, me, cards, session)

    messages = [
        {"role": "user" if m.role == "user" else "assistant", "content": m.content}
        for m in _recent_messages(session, owner.id, me.id, MAX_HISTORY)
    ]
    messages.append({"role": "user", "content": body.message})

    try:
        content = llm.chat_messages(system, messages)
    except llm.LLMError as e:
        # 生成失败时用户消息不入库,避免历史里出现无回应的悬空消息
        return AvatarReply(
            id="error",
            content=f"[化身暂时下线] {e}",
            created_at=datetime.now(timezone.utc),
            cited_card_ids=[],
        )

    user_msg = ChatMessage(
        agent_owner_id=owner.id, visitor_id=me.id, role="user", content=body.message
    )
    avatar_msg = ChatMessage(
        agent_owner_id=owner.id, visitor_id=me.id, role="avatar", content=content
    )
    session.add(user_msg)
    session.add(avatar_msg)
    session.commit()
    session.refresh(avatar_msg)

    return AvatarReply(
        id=avatar_msg.id,
        content=content,
        created_at=avatar_msg.created_at,
        cited_card_ids=[c.id for c in cards],
    )
