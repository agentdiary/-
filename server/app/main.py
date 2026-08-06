from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routers import auth_routes, chat, diaries, persona, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AgentDiary API", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def _debug_access(request, call_next):
    from datetime import datetime, timezone
    from pathlib import Path

    response = await call_next(request)
    if os.environ.get("AGENTDIARY_ACCESS_LOG") != "1":
        return response
    log = Path(__file__).resolve().parent.parent / "access-debug.log"
    with log.open("a", encoding="utf-8") as f:
        f.write(
            f"{datetime.now(timezone.utc).isoformat()} "
            f"{request.client.host} {request.method} {request.url.path} -> {response.status_code}\n"
        )
    return response


def _cors_origins() -> list[str]:
    raw = os.environ.get("AGENTDIARY_CORS_ORIGINS", "*")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(users.router)
app.include_router(diaries.router)
app.include_router(chat.router)
app.include_router(persona.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
