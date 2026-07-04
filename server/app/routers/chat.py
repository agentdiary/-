"""化身自对话接口。

所有模型逻辑收敛在后端(客户端不得直接调 LLM)。
v1:按新近度检索人格卡片注入 system prompt(后续换向量检索),
用本地 Ollama qwen 生成回应;微调后替换为化身专属模型。
注意:检索的是卡片,不检索原始日记(信噪比约定)。
"""

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import llm
from ..db import get_session
from ..models import PersonaCard

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_CARDS = 10
# 带入 prompt 的最大历史轮数(条),控制本地推理延迟与上下文长度
MAX_HISTORY = 20

_AVATAR_SYSTEM_TMPL = """你是一位用户的「数字化身」——不是 AI 助手,而是用户本人的复刻。用户正在和你对话,以此检验你像不像他自己。

以下人格卡片蒸馏自用户的日记,代表他的观点、价值观、偏好与说话方式:
{cards}

要求:
- 完全以用户本人的第一人称口吻回应,像日常聊天,简短自然
- 观点与偏好必须与人格卡片一致;卡片没覆盖的话题,坦率说不确定,不要编造
- 严禁 AI 客服腔:不要「有什么可以帮您」,不要过度热情,不要列清单式回答
- 用中文回应"""

_COLD_START_SYSTEM = """你是一位用户的「数字化身」,但用户还没写过日记,你对他一无所知。
用一两句话以平实的口吻说明:你还没有素材,请他先写几篇日记来喂养你。用中文,不要 AI 客服腔。"""


class ChatTurn(BaseModel):
    role: Literal["user", "avatar"]
    content: str


class ChatRequest(BaseModel):
    message: str
    # 之前的对话历史(旧→新),由客户端携带;后端暂不持久化会话
    history: list[ChatTurn] = []


class AvatarReply(BaseModel):
    id: str
    content: str
    created_at: datetime
    cited_card_ids: list[str]


def _retrieve_cards(session: Session) -> list[PersonaCard]:
    stmt = (
        select(PersonaCard)
        .where(PersonaCard.superseded_by == None)  # noqa: E711
        .order_by(PersonaCard.created_at.desc())  # type: ignore[attr-defined]
        .limit(MAX_CARDS)
    )
    return list(session.exec(stmt))


@router.post("")
def chat(body: ChatRequest, session: Session = Depends(get_session)) -> AvatarReply:
    cards = _retrieve_cards(session)

    if cards:
        cards_text = "\n".join(
            f"- {c.assertion}(置信度 {c.confidence:.1f})" for c in cards
        )
        system = _AVATAR_SYSTEM_TMPL.format(cards=cards_text)
    else:
        system = _COLD_START_SYSTEM

    messages = [
        {"role": "user" if t.role == "user" else "assistant", "content": t.content}
        for t in body.history[-MAX_HISTORY:]
    ]
    messages.append({"role": "user", "content": body.message})

    try:
        content = llm.chat_messages(system, messages)
    except llm.LLMError as e:
        content = f"[化身暂时下线] {e}"

    return AvatarReply(
        id=uuid4().hex,
        content=content,
        created_at=datetime.now(timezone.utc),
        cited_card_ids=[c.id for c in cards],
    )
