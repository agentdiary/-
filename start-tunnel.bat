@echo off
rem Expose local backend (port 8000) via ngrok fixed domain.
rem ngrok free plan cannot connect through a proxy (ERR_NGROK_9009),
rem so clear proxy env vars for this process only.
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="
set "ALL_PROXY="
set "all_proxy="
"%~dp0utils\ngrok\ngrok.exe" http --url=https://exes-valium-map.ngrok-free.dev 8000
echo.
echo [start-tunnel] Tunnel exited. Check errors above.
pause
