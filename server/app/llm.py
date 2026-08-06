"""LLM 客户端:OpenAI 兼容协议(/v1/chat/completions)。

千问百炼、Ollama、vLLM 都实现这个协议,所以同一份代码打谁都行,换模型只改
环境变量、请求体一行不动。这是刻意选的:CLAUDE.md §2 的终局是化身跑在自己
LoRA 微调过的开源基座上,那天到来时不该重写调用层。

两套独立配置,因为这两件活对模型的要求根本不同:

- DISTILL:蒸馏抽人格卡片、AI 裁判。分析类任务,吃的是指令遵循和结构化输出
  能力,一直用最强的通用模型。产出的是训练素材,质量决定后续 LoRA 的上限。
- CHAT:化身对话。现在借通用模型顶着跑通 Phase 0 盲测,将来换成自己微调的
  基座——通用模型的 AI 腔靠 prompt 压不干净(CLAUDE.md §2 的 DPO 校准环)。

配置示例(不设则全部回退到本地 Ollama,保持原有开发流程可用):

    DISTILL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
    DISTILL_MODEL=qwen3.7-plus
    CHAT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
    CHAT_MODEL=qwen3.7-plus
    DASHSCOPE_API_KEY=sk-...        # 两套共用;也可分别设 *_API_KEY

API Key 只从环境变量读,绝不落代码或 git:本机用用户级环境变量,服务器用
systemd 的 EnvironmentFile(权限 600)。
"""

import json
import logging
import os
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

# 未配置时的回退:本地 Ollama。它同样提供 OpenAI 兼容端点(/v1),所以走同一条代码路径
_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.5:9b")
_DEFAULT_BASE_URL = f"{_OLLAMA_URL.rstrip('/')}/v1"


class LLMError(RuntimeError):
    pass


@dataclass(frozen=True)
class Profile:
    """一套模型配置。名字用于日志和用量统计的分档。"""

    name: str
    base_url: str
    api_key: str
    model: str


def _load(name: str) -> Profile:
    prefix = name.upper()
    return Profile(
        name=name,
        base_url=os.environ.get(f"{prefix}_BASE_URL", _DEFAULT_BASE_URL).rstrip("/"),
        # 百炼控制台只给一个 key,默认两套共用;需要分开计费时再单独设
        api_key=(
            os.environ.get(f"{prefix}_API_KEY")
            or os.environ.get("DASHSCOPE_API_KEY")
            or "ollama"  # 本地 Ollama 不校验,但 OpenAI 协议要求非空
        ),
        model=os.environ.get(f"{prefix}_MODEL", _OLLAMA_MODEL),
    )


DISTILL = _load("distill")
CHAT = _load("chat")


# --- 用量统计 ---------------------------------------------------------------
# 按用户限流在 ratelimit.py(挡单人滥用),这里挡的是总量超支:20 个用户各聊
# 30 轮同样能烧穿预算。进程内计数,与 ratelimit 一样依赖单 worker 部署;
# 重启归零,所以真实对账看日志里每次调用的 usage 行。
_usage_lock = threading.Lock()
_usage_month = ""
_usage: dict[str, dict[str, int]] = {}

# 设为 0 或不设 = 不限制。超过后拒绝调用,避免账单失控
MONTHLY_TOKEN_BUDGET = int(os.environ.get("LLM_MONTHLY_TOKEN_BUDGET", "0"))


def _check_budget() -> None:
    if not MONTHLY_TOKEN_BUDGET:
        return
    with _usage_lock:
        total = sum(v["prompt"] + v["completion"] for v in _usage.values())
    if total >= MONTHLY_TOKEN_BUDGET:
        raise LLMError(f"本月 token 预算已用尽({total}/{MONTHLY_TOKEN_BUDGET}),暂停调用")


def _record(profile: Profile, usage: dict) -> None:
    global _usage_month, _usage
    prompt = int(usage.get("prompt_tokens", 0))
    completion = int(usage.get("completion_tokens", 0))
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    with _usage_lock:
        if month != _usage_month:  # 跨月归零
            _usage_month, _usage = month, {}
        bucket = _usage.setdefault(profile.name, {"prompt": 0, "completion": 0, "calls": 0})
        bucket["prompt"] += prompt
        bucket["completion"] += completion
        bucket["calls"] += 1
        snapshot = dict(bucket)
    # 每次都记:估算的 token 消耗和真实值常差 ±30%,预算要按这行的累计值来定
    logger.info(
        "usage profile=%s model=%s 本次 in=%d out=%d | 本月累计 in=%d out=%d calls=%d",
        profile.name,
        profile.model,
        prompt,
        completion,
        snapshot["prompt"],
        snapshot["completion"],
        snapshot["calls"],
    )


def usage_snapshot() -> dict:
    """当月各档用量,给运维接口或排查用。"""
    with _usage_lock:
        return {"month": _usage_month, "budget": MONTHLY_TOKEN_BUDGET, "profiles": dict(_usage)}


# --- 调用 -------------------------------------------------------------------


def chat(
    system: str,
    prompt: str,
    *,
    profile: Profile = CHAT,
    json_mode: bool = False,
    timeout: float = 300.0,
) -> str:
    """单轮调用:一条 user 消息。"""
    return chat_messages(
        system,
        [{"role": "user", "content": prompt}],
        profile=profile,
        json_mode=json_mode,
        timeout=timeout,
    )


def chat_messages(
    system: str,
    messages: list[dict],
    *,
    profile: Profile = CHAT,
    json_mode: bool = False,
    timeout: float = 300.0,
    max_tokens: int | None = None,
) -> str:
    """多轮调用:messages 为 [{role: user|assistant, content: str}] 的对话历史。"""
    _check_budget()
    payload: dict = {
        "model": profile.model,
        "messages": [{"role": "system", "content": system}, *messages],
        "stream": False,
        # 思考过程按输出 token 计费,开着能让单轮成本翻数倍;化身对话也不需要
        # 展示推理链。qwen3 系专有字段,不认识的服务端会被下面的重试剥掉
        "enable_thinking": False,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if max_tokens:
        # 成本护栏,不是控长手段:长度靠 prompt 约束,这里只兜住失控的长回复
        payload["max_tokens"] = max_tokens

    data = _post(profile, payload, timeout)
    try:
        content: str = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise LLMError(f"响应格式异常: {str(data)[:200]}") from e

    _record(profile, data.get("usage") or {})
    # 兜底剥离思维链标记:关了 enable_thinking 仍有模型会吐 <think>
    return re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()


def _post(profile: Profile, payload: dict, timeout: float) -> dict:
    url = f"{profile.base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {profile.api_key}"}
    # trust_env=False:不让本机代理(xray 等)插手。本地 Ollama 走代理会被掐断
    # (503/10054);国内 API 走境外代理同样是绕远路,两种情况都该直连
    try:
        with httpx.Client(trust_env=False, timeout=timeout) as client:
            r = client.post(url, json=payload, headers=headers)
            if r.status_code == 400 and "enable_thinking" in payload:
                # 服务端不认识这个扩展字段时剥掉重试一次
                payload = {k: v for k, v in payload.items() if k != "enable_thinking"}
                r = client.post(url, json=payload, headers=headers)
            r.raise_for_status()
    except httpx.HTTPStatusError as e:
        detail = e.response.text[:300]
        if e.response.status_code in (401, 403):
            raise LLMError(f"鉴权失败({profile.name}):检查 API Key 环境变量。{detail}") from e
        raise LLMError(f"调用失败({profile.name} {profile.model}): {detail}") from e
    except Exception as e:
        raise LLMError(f"{profile.name} 服务不可用({url}): {e}") from e
    return r.json()


def chat_json(system: str, prompt: str, *, profile: Profile = CHAT) -> dict:
    text = chat(system, prompt, profile=profile, json_mode=True)
    try:
        return _parse_json_loose(text)
    except LLMError:
        # 小模型偶发截断/坏 JSON,重采样一次往往就好。强模型基本不会走到这里
        text = chat(system, prompt, profile=profile, json_mode=True)
        return _parse_json_loose(text)


def _parse_json_loose(text: str) -> dict:
    """宽松解析:即使开了 json 模式,弱模型仍会包 ```json 围栏或夹杂说明文字。"""
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    embedded = re.search(r"\{.*\}", text, flags=re.S)
    if embedded:
        try:
            return json.loads(embedded.group(0))
        except json.JSONDecodeError:
            pass
    # 生成中途截断的 JSON:试着补上未闭合的字符串/数组/对象
    if text.startswith("{"):
        for suffix in ('"}', '"]}', "]}", "}", '"}]}'):
            try:
                return json.loads(text + suffix)
            except json.JSONDecodeError:
                continue
    raise LLMError(f"模型未返回合法 JSON: {text[:200]}")
