# AgentDiary cloud backend

The cloud backend runs FastAPI as a user-level systemd service on the Ubuntu host.

## Service

- Repository path: `/home/ubuntu/agentdiary`
- Database path: `/home/ubuntu/agentdiary-data/agentdiary.db`
- Public API base URL: `http://43.130.127.226:8000`
- Health check: `http://43.130.127.226:8000/health`

## Commands

```bash
systemctl --user status agentdiary-api
systemctl --user restart agentdiary-api
journalctl --user -u agentdiary-api -n 100 --no-pager
```

## Environment

The service supports these environment variables:

- `AGENTDIARY_DB_PATH`: SQLite database file path.
- `AGENTDIARY_CORS_ORIGINS`: comma-separated allowed origins, or `*` for early testing.
- `AGENTDIARY_ACCESS_LOG`: set to `1` to write `server/access-debug.log`.
- `OLLAMA_URL`: Ollama endpoint used by LLM calls.
- `OLLAMA_MODEL`: Ollama model name.
