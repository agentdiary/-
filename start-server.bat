@echo off
rem Start backend (FastAPI). Requires Ollama running.
rem Uses venv python directly, no activation needed.
cd /d "%~dp0server"
.venv\Scripts\python.exe -X utf8 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
echo.
echo [start-server] Server exited. Check errors above (e.g. port 8000 already in use).
pause
