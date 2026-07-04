@echo off
rem Load portable toolchain (utils/) into current cmd session.
rem Usage: utils\env.bat
set "UTILS=%~dp0"
set "PATH=%UTILS%node;%UTILS%npm-global;%PATH%"
set "NPM_CONFIG_PREFIX=%UTILS%npm-global"
set "NPM_CONFIG_CACHE=%UTILS%npm-cache"
echo [agentdiary] toolchain loaded
node -v
npm -v
