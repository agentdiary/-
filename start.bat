@echo off
rem One-click backend stack: ngrok tunnel (new window) + FastAPI server (this window).
rem Ollama must be running separately (it usually autostarts with Windows).
start "agentdiary-tunnel" "%~dp0start-tunnel.bat"
call "%~dp0start-server.bat"
