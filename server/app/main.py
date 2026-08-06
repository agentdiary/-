from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .db import init_db
from .routers import auth_routes, chat, diaries, dm, judge, persona, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AgentDiary API", version="0.1.0", lifespan=lifespan)

# 访问日志交给 uvicorn / nginx。曾经这里挂过一个把每个请求同步写文件的诊断
# 中间件,那在公网上是逐请求的阻塞式磁盘写,不能带上生产。
#
# 移动端不受 CORS 约束,这条只对 Expo web 构建生效;上线设 CORS_ORIGINS 收紧
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(users.router)
app.include_router(diaries.router)
app.include_router(chat.router)
app.include_router(persona.router)
app.include_router(judge.router)
app.include_router(dm.router)


@app.get("/")
def root() -> dict:
    """根路径。没有这条时裸访问域名只会得到 {"detail":"Not Found"},
    和「隧道/反代挂了」的 404 长得一样,排查时会误判到别处去。"""
    return {"service": "AgentDiary API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
