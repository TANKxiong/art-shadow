@echo off
chcp 65001 >nul
title 画影客

echo.
echo   📚 画影客
echo   ═══════════════════════════
echo.
echo   正在启动...

cd /d "%~dp0"

:: Check if port 5173 is already in use
netstat -ano | findstr ":5173" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   服务已在运行，正在打开浏览器...
    start http://localhost:5173
    goto :end
)

:: Start Vite dev server and open browser
start "" http://localhost:5173
npx vite --host

:end
