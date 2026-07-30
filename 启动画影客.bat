@echo off
cd /d "%~dp0"

echo Building...
call npx.cmd vite build

echo Starting server...
start "ArtShadowServer" /B npx.cmd vite preview --port 5800

timeout /t 3 /nobreak >nul

echo Opening app...
start "ArtShadow" chrome --app=http://localhost:5800 --window-size=1400,900 --user-data-dir="%TEMP%\art-shadow"

echo.
echo ArtShadow started! Pin this window to your taskbar.
