@echo off
cd /d D:\agenticaimediacheck\backend
call venv\Scripts\activate.bat
set PYTHONUNBUFFERED=1
uvicorn main:app
pause
