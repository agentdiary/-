from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import get_current_user, hash_password, issue_token, verify_password
from ..db import get_session
from ..models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    username: str


@router.post("/register")
def register(body: Credentials, session: Session = Depends(get_session)) -> AuthResponse:
    username = body.username.strip()
    if not (2 <= len(username) <= 20):
        raise HTTPException(status_code=422, detail="用户名需 2~20 个字符")
    if len(body.password) < 6:
        raise HTTPException(status_code=422, detail="密码至少 6 位")
    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=409, detail="用户名已被占用")
    user = User(username=username, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthResponse(token=issue_token(session, user), user_id=user.id, username=user.username)


@router.post("/login")
def login(body: Credentials, session: Session = Depends(get_session)) -> AuthResponse:
    user = session.exec(select(User).where(User.username == body.username.strip())).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return AuthResponse(token=issue_token(session, user), user_id=user.id, username=user.username)


class UserInfo(BaseModel):
    id: str
    username: str


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> UserInfo:
    return UserInfo(id=user.id, username=user.username)
