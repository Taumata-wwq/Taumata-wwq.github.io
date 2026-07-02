@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Taumata 管理台
python app.py
if errorlevel 1 (
    echo.
    echo 启动失败，请检查 Python 和 PySide6 是否已安装
    pause
)
