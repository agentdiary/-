"""本地 Ollama 推理客户端(开发期)。

所有 LLM 调用收敛在后端此文件;换云端推理/微调后的化身模型时只改这里。
"""

import json
import os
import re

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.5:9b")


class LLMError(RuntimeError):
    pass


def chat(system: str, prompt: str, *, json_mode: bool = False, timeout: float = 300.0) -> str:
    """单轮调用:一条 user 消息。"""
    return chat_messages(
        system, [{"role": "user", "content": prompt}], json_mode=json_mode, timeout=timeout
    )


def chat_messages(
    system: str,
    messages: list[dict],
    *,
    json_mode: bool = False,
    timeout: float = 300.0,
) -> str:
    """多轮调用:messages 为 [{role: user|assistant, content: str}] 的对话历史。"""
    payload: dict = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}, *messages],
        "stream": False,
        "think": False,  # qwen3 系思考模型:关闭思维链,降低延迟
    }
    if json_mode:
        payload["format"] = "json"
    # trust_env=False:绝不让本机代理(HTTP_PROXY/xray 等)截走发往 localhost 的
    # Ollama 请求——代理会拒绝或掐断 localhost 转发,表现为 503/10054
    try:
        with httpx.Client(trust_env=False, timeout=timeout) as client:
            r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            r.raise_for_status()
    except httpx.HTTPStatusError:
        # 旧版 Ollama 不认识 think 字段时重试一次
        payload.pop("think", None)
        try:
            with httpx.Client(trust_env=False, timeout=timeout) as client:
                r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
                r.raise_for_status()
        except Exception as e:
            raise LLMError(f"Ollama 调用失败: {e}") from e
    except Exception as e:
        raise LLMError(f"Ollama 不可用(是否已启动?): {e}") from e

    content: str = r.json()["message"]["content"]
    # 兜底剥离思维链标记
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
    return content


def chat_json(system: str, prompt: str) -> dict:
    text = chat(system, prompt, json_mode=True)
    try:
        return _parse_json_loose(text)
    except LLMError:
        # 本地小模型偶发截断/坏 JSON,重采样一次往往就好
        text = chat(system, prompt, json_mode=True)
        return _parse_json_loose(text)


def _parse_json_loose(text: str) -> dict:
    """宽松解析:即使开了 format=json,模型偶尔仍会包 ```json 围栏或夹杂说明文字。"""
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
