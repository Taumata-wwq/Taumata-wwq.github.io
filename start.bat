@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"
title Taumata 管理台

REM 优先使用 python 命令，失败再尝试 py launcher
where python >nul 2>nul
if not errorlevel 1 (
    set "PYCMD=python"
    set "PYWCMD=pythonw"
    goto :check_deps
)

where py >nul 2>nul
if not errorlevel 1 (
    set "PYCMD=py"
    set "PYWCMD=pyw"
    goto :check_deps
)

echo.
echo [错误] 未找到 Python，请确保已安装 Python 3 并添加到 PATH
echo        下载地址: https://www.python.org/downloads/
echo        安装时勾选 "Add Python to PATH"
echo.
pause
exit /b 1

:check_deps
REM 检查 PySide6 是否已安装
%PYCMD% -c "import PySide6" >nul 2>nul
if errorlevel 1 (
    echo.
    echo [错误] 未安装 PySide6，请运行以下命令安装依赖:
    echo        %PYCMD% -m pip install PySide6 Pillow
    echo.
    pause
    exit /b 1
)

REM 检查 Pillow 是否已安装（用于缩略图生成）
%PYCMD% -c "import PIL" >nul 2>nul
if errorlevel 1 (
    echo.
    echo [警告] 未安装 Pillow，缩略图生成功能将不可用
    echo        建议运行: %PYCMD% -m pip install Pillow
    echo.
)

REM 使用 pythonw 启动（无控制台窗口），bat 脚本自行退出
start "" %PYWCMD% app.py
exit /b 0
