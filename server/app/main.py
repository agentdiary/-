from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import chat, diaries, persona


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AgentDiary API", version="0.1.0", lifespan=lifespan)

# 开发期放开跨域;上线前收紧
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(diaries.router)
app.include_router(chat.router)
app.include_router(persona.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
