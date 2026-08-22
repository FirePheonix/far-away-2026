# local-stt-rs

Background speech-to-text for Windows, powered by **NVIDIA Parakeet TDT 0.6B v3 INT8** via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx).

Press **Ctrl+Shift+Space** to start recording, press again to stop — transcription is copied to the clipboard.

Runs in the system tray with a floating overlay. While you speak, audio is decoded in **live 10s chunks** so stopping usually only waits on the leftover tail.

---

## Download

Go to the [Releases](../../releases) page and download `local-stt-windows-x64.zip`.

1. Extract the zip
2. Run `local-stt.exe`
3. Wait for the tray tooltip: **Parakeet INT8 ready**
4. Press **Ctrl+Shift+Space** to record

First launch downloads ~500 MB of model weights into `%USERPROFILE%\.local-stt\models\` (cached afterwards).

---

## Requirements (from source)

- Rust toolchain (1.80+)
- Microphone access
- Network on first run (model download)

## Run from source

```powershell
cd local-stt-rs
cargo run --release
```

Or package a Windows zip:

```powershell
cargo build --release
.\scripts\package-windows.ps1
# -> dist\local-stt-windows-x64.zip
```

First **build** downloads sherpa-onnx shared libs (can take several minutes).  
Quit any other `local-stt` instance first (same single-instance port `47915`).

## Usage

| Action | Result |
|---|---|
| `Ctrl+Shift+Space` | Start recording |
| `Ctrl+Shift+Space` again | Stop & transcribe → clipboard |
| `Esc` | Dismiss result overlay |
| Tray → Quit | Exit |

## Model

| | |
|---|---|
| Model | [sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2) |
| Runtime | sherpa-onnx (CPU) |
| Sample rate | 16 kHz mono |
| Config | `~/.local-stt/config.json` |

## Privacy

Audio is processed locally. The only network use is the one-time model download from GitHub releases.

## Python reference

The original Python app (onnx-asr / nano-parakeet) lives in [`../local-stt`](../local-stt).
