@echo off
title Artshadow Maya Plugin Installer
echo ============================================
echo   Artshadow Maya Plugin - One-click Install
echo   Supports Maya 2018 ~ 2025 (Windows)
echo ============================================
echo.

set "MAYA_ROOT=%USERPROFILE%\Documents\maya"
set "TARGET_SCRIPTS="
set "MAYA_VER="

for %%V in (2025 2024 2023 2022 2021 2020 2019 2018) do (
    if exist "%MAYA_ROOT%\%%V\scripts" (
        if not defined TARGET_SCRIPTS (
            set "TARGET_SCRIPTS=%MAYA_ROOT%\%%V\scripts"
            set "MAYA_VER=%%V"
        )
    )
)

if not defined TARGET_SCRIPTS (
    if exist "%MAYA_ROOT%\scripts" (
        set "TARGET_SCRIPTS=%MAYA_ROOT%\scripts"
        set "MAYA_VER=global"
    )
)

if not defined TARGET_SCRIPTS (
    echo [ERROR] Maya scripts dir not found. Please run Maya once first.
    pause
    exit /b 1
)

echo [FOUND] Maya version: %MAYA_VER%
echo [TARGET] %TARGET_SCRIPTS%
echo.

echo [1/2] Copying plugin artshadow_ref.py ...
copy /Y "%~dp0scripts\artshadow_ref.py" "%TARGET_SCRIPTS%\artshadow_ref.py" >nul
if errorlevel 1 (
    echo [ERROR] Copy failed. Check permission.
    pause
    exit /b 1
)
echo [OK] Plugin copied.

echo [2/2] Configuring auto-load (userSetup.py) ...
python "%~dp0install_helper.py" "%TARGET_SCRIPTS%"
if errorlevel 1 (
    echo [NOTE] Auto-config failed. You can run manually in Maya:
    echo    import artshadow_ref; artshadow_ref.build_menu()
)

echo.
echo ============================================
echo   INSTALL DONE!
echo   1. Fully close Maya
echo   2. Reopen Maya
echo   3. Menu bar shows "Artshadow" menu
echo      -> Import Tools -> Open Import Window
echo ============================================
pause
