@echo off
rem Start frontend (Expo dev server) using portable toolchain in utils/
call "%~dp0utils\env.bat"
cd /d "%~dp0client"
npx expo start
pause
