# Package Windows release zip: exe + runtime DLLs
# Run from repo root after: cargo build --release

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Release = Join-Path $Root "target\release"
$OutDir = Join-Path $Root "dist\windows"
$ZipPath = Join-Path $Root "dist\local-stt-windows-x64.zip"

$Exe = Join-Path $Release "local-stt-rs.exe"
if (-not (Test-Path $Exe)) {
    throw "Missing $Exe - run: cargo build --release"
}

$Dlls = @(
    "onnxruntime.dll",
    "onnxruntime_providers_shared.dll",
    "sherpa-onnx-c-api.dll",
    "sherpa-onnx-cxx-api.dll"
)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Get-ChildItem $OutDir | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item $Exe (Join-Path $OutDir "local-stt.exe")
foreach ($d in $Dlls) {
    $src = Join-Path $Release $d
    if (-not (Test-Path $src)) { throw "Missing DLL: $src" }
    Copy-Item $src $OutDir
}

@"
local-stt (Rust) - Windows x64
==============================

1. Unzip anywhere
2. Run local-stt.exe
3. Wait for tray tooltip: Parakeet INT8 ready
4. Press Ctrl+Shift+Space to start/stop recording
5. Text is copied to the clipboard

First run downloads ~500 MB Parakeet INT8 model into:
  %USERPROFILE%\.local-stt\models\

Privacy: audio stays on your machine (model download is the only network use).
"@ | Set-Content -Path (Join-Path $OutDir "README.txt") -Encoding UTF8

New-Item -ItemType Directory -Force -Path (Split-Path $ZipPath) | Out-Null
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $ZipPath -Force
$hash = (Get-FileHash $ZipPath -Algorithm SHA256).Hash
Write-Host "Packed: $ZipPath"
Write-Host "SHA256: $hash"
Get-Item $ZipPath | Format-List FullName, Length, LastWriteTime
