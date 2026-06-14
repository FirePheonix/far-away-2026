@echo off
setlocal
pushd "%~dp0"
:: Build local-stt for Windows
:: Produces: dist\local-stt.exe (single file, no console window)
::
:: Requirements:
::   pip install pyinstaller
::   pip install -r requirements.txt

echo [local-stt] Installing dependencies...
python -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :fail

python -m pip install -r requirements.txt
if errorlevel 1 goto :fail

python -m pip install --upgrade "pyinstaller>=6.11.0"
if errorlevel 1 goto :fail

if exist build rmdir /s /q build
if exist dist\local-stt.exe del /f /q dist\local-stt.exe
if exist local-stt.spec del /f /q local-stt.spec

echo.
echo [local-stt] Building Windows executable...
python -m PyInstaller ^
  --clean ^
  --noconfirm ^
  --onefile ^
  --windowed ^
  --name "local-stt" ^
  --icon "assets\icon.ico" ^
  --collect-all faster_whisper ^
  --collect-all ctranslate2 ^
  --collect-all sounddevice ^
  --collect-all soundcard ^
  --exclude-module rich ^
  --exclude-module pygments ^
  --exclude-module markdown_it ^
  --exclude-module pystray ^
  --exclude-module PIL ^
  --hidden-import soundcard ^
  --hidden-import pynput.keyboard._win32 ^
  --hidden-import pynput.mouse._win32 ^
  --hidden-import pyperclip ^
  app.py
if errorlevel 1 goto :fail

echo.
echo [local-stt] Done! Executable at: dist\local-stt.exe
pause
popd
exit /b 0

:fail
echo.
echo [local-stt] Build failed.
popd
exit /b 1
