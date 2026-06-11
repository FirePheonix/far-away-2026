@echo off
:: Build local-stt for Windows
:: Produces: dist\local-stt.exe (single file, no console window)
::
:: Requirements:
::   pip install pyinstaller
::   pip install -r requirements.txt

echo [local-stt] Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo [local-stt] Building Windows executable...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name "local-stt" ^
  --icon "assets\icon.ico" ^
  --collect-all faster_whisper ^
  --collect-all ctranslate2 ^
  --collect-all customtkinter ^
  --collect-all sounddevice ^
  --hidden-import pystray._win32 ^
  --hidden-import pynput.keyboard._win32 ^
  --hidden-import pynput.mouse._win32 ^
  --hidden-import pyperclip ^
  app.py

echo.
echo [local-stt] Done! Executable at: dist\local-stt.exe
pause
