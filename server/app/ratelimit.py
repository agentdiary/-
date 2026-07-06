"""进程内滑动窗口限流(按用户)。

化身对话 = LLM 算力,公开后必被脚本滥用;内测单实例下进程内计数够用,
多实例部署时换 Redis 计数即可(接口不变)。
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException

_buckets: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, max_calls: int, window_seconds: int) -> None:
    """超限抛 429。key 形如 'chat:<user_id>'。"""
    now = time.monotonic()
    bucket = _buckets[key]
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= max_calls:
        raise HTTPException(status_code=429, detail="操作太频繁,请稍后再试")
    bucket.append(now)
