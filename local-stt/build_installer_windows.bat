@echo off
setlocal
pushd "%~dp0"

echo [clawvio] Building Windows executable...
call build_windows.bat
if errorlevel 1 (
  echo [clawvio] build_windows.bat failed.
  popd
  exit /b 1
)

if not exist dist\local-stt.exe (
  echo [clawvio] Missing dist\local-stt.exe. Build step did not produce the executable.
  popd
  exit /b 1
)

set "ISCC_EXE="
for /f "delims=" %%i in ('where iscc.exe 2^>nul') do set "ISCC_EXE=%%i"
if not defined ISCC_EXE (
  if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
)

if not defined ISCC_EXE (
  echo [clawvio] Inno Setup compiler not found.
  echo [clawvio] Install Inno Setup 6 from https://jrsoftware.org/isdl.php
  popd
  exit /b 1
)

echo [clawvio] Using Inno Setup compiler: %ISCC_EXE%
"%ISCC_EXE%" installer\ClawvioSetup.iss
if errorlevel 1 (
  echo [clawvio] Installer build failed.
  popd
  exit /b 1
)

echo.
echo [clawvio] Done! Installer at dist\installer\ClawvioSetup.exe
popd
exit /b 0
