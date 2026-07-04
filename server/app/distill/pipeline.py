"""蒸馏 pipeline v1。

流程(CLAUDE.md §2):
    日记 → 脱敏 → 切片 → ①逆向构造「情境→用户口吻回应」对话对(表层风格,LoRA 素材)
                        → ②抽取人格断言卡片(深层人格,RAG 素材)

当前用本地 Ollama(qwen)实现;在 FastAPI BackgroundTasks 中异步执行,
不阻塞日记保存。后续训练任务上 GPU 时升级为正式任务队列。
"""

import logging

from sqlmodel import Session

from .. import llm
from ..db import engine
from ..models import DialoguePair, DiaryEntry, PersonaCard
from .privacy import sanitize

logger = logging.getLogger(__name__)

# 单篇日记最多处理的切片数,控制本地推理耗时
MAX_SLICES = 5

_SITUATION_SYSTEM = (
    "你是训练数据构造助手。给定用户日记中的一段话,推测在什么对话情境下"
    "(朋友问了什么、或发生了什么事)用户会自然地说出这段话。"
    "关键:构造的是「对话」情境,这样这段话才能作为对话回应来训练,而不是日记独白。"
    "只输出一句话的情境描述,不要任何解释或多余内容。"
)

_CARDS_SYSTEM = (
    "你是人格分析助手。从用户日记中抽取「人格断言卡片」:关于这个人的观点、"
    "价值排序、偏好、幽默方式、行为模式的陈述句。要求:\n"
    "- 每条断言独立、具体,用第三人称(如「他认为…」「他习惯…」)\n"
    "- confidence 为 0~1,表示日记证据对该断言的支撑强度\n"
    "- 宁缺毋滥,没有明确证据就不要编造\n"
    '只输出 JSON:{"cards": [{"assertion": "...", "confidence": 0.8}]}'
)


def slice_diary(content: str) -> list[str]:
    """按段落切片。后续可换语义切片。"""
    return [p.strip() for p in content.split("\n") if p.strip()]


def build_dialogue_pairs(diary: DiaryEntry, slices: list[str]) -> list[DialoguePair]:
    """逆向构造对话对:避免直接拿日记原文训练导致化身学成日记腔。"""
    pairs = []
    for s in slices[:MAX_SLICES]:
        situation = llm.chat(_SITUATION_SYSTEM, s)
        pairs.append(
            DialoguePair(source_diary_id=diary.id, situation=situation, response=s)
        )
    return pairs


def extract_persona_cards(diary: DiaryEntry, clean_content: str) -> list[PersonaCard]:
    """抽取人格断言卡片,带置信度与出处。"""
    data = llm.chat_json(_CARDS_SYSTEM, clean_content)
    cards = []
    for item in data.get("cards", []):
        assertion = str(item.get("assertion", "")).strip()
        if not assertion:
            continue
        try:
            confidence = min(1.0, max(0.0, float(item.get("confidence", 0.5))))
        except (TypeError, ValueError):
            confidence = 0.5
        cards.append(
            PersonaCard(source_diary_id=diary.id, assertion=assertion, confidence=confidence)
        )
    return cards


def run_pipeline_for_diary(diary_id: str) -> None:
    """后台任务入口:自建 Session,对单篇日记跑完整蒸馏流程并落库。

    LLM 失败只记日志不抛出——日记本体已保存,蒸馏可以后续补跑。
    """
    with Session(engine) as session:
        diary = session.get(DiaryEntry, diary_id)
        if diary is None:
            return
        try:
            clean = sanitize(diary.content)  # 红线:先脱敏再进入任何蒸馏步骤
            slices = slice_diary(clean)
            for pair in build_dialogue_pairs(diary, slices):
                session.add(pair)
            for card in extract_persona_cards(diary, clean):
                session.add(card)
            session.commit()
            logger.info("蒸馏完成: diary=%s", diary_id)
        except llm.LLMError as e:
            logger.error("蒸馏失败(diary=%s): %s", diary_id, e)
