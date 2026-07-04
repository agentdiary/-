"""用户鉴权:pbkdf2 密码哈希 + 不透明 Bearer token(库内存储,可吊销)。

零外部依赖(stdlib);上规模后可换 JWT + 刷新令牌。
"""

import hashlib
import hmac
import secrets

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session

from .db import get_session
from .models import AuthToken, User

_PBKDF2_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ITERATIONS
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ITERATIONS
    ).hex()
    return hmac.compare_digest(candidate, digest)


def issue_token(session: Session, user: User) -> str:
    token = AuthToken(token=secrets.token_hex(32), user_id=user.id)
    session.add(token)
    session.commit()
    return token.token


def get_current_user(request: Request, session: Session = Depends(get_session)) -> User:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    record = session.get(AuthToken, header.removeprefix("Bearer ").strip())
    if record is None:
        raise HTTPException(status_code=401, detail="登录已失效,请重新登录")
    user = session.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user
