@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Taumata 管理台

REM 优先使用 python 命令（兼容性更好），失败再尝试 py launcher
where python >nul 2>nul
if not errorlevel 1 (
    python app.py
    goto :check_result
)

where py >nul 2>nul
if not errorlevel 1 (
    py app.py
    goto :check_result
)

echo.
echo [错误] 未找到 Python，请确保已安装 Python 3 并添加到 PATH
echo        下载地址: https://www.python.org/downloads/
echo        安装时勾选 "Add Python to PATH"
echo.
pause
exit /b 1

:check_result
if errorlevel 1 (
    echo.
    echo [错误] 启动失败，错误码: %errorlevel%
    echo        若提示 ModuleNotFoundError，请安装依赖:
    echo          pip install PySide6 Pillow
    echo.
    pause
)
