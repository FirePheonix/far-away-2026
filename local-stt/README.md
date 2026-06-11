# local-stt

Lightweight background speech-to-text for Windows and macOS, linked to the **Far Away assistant backend**.

Press **Ctrl+Shift+Space** to record, press again to stop — transcription is copied to the clipboard and sent to the assistant API.

## Link to backend

Copy `.env.example` to `.env`:

```env
ASSISTANT_API_URL=http://localhost:4001/api/assistant
ASSISTANT_ENABLED=true
ASSISTANT_ASYNC=false
```

Start the backend first (`cd ../backend && npm run dev`), then run local-stt.

Toggle the assistant link from the tray menu: **Assistant link → Enabled**.

## Run from source

```bash
cd local-stt
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS

pip install -r requirements.txt
cp .env.example .env
python app.py
```

## Usage

| Action | Result |
|--------|--------|
| `Ctrl+Shift+Space` | Start recording |
| `Ctrl+Shift+Space` again | Stop, transcribe, copy, send to assistant |
| `Esc` | Dismiss overlay |

## Build

**Windows:** `build_windows.bat` → `dist\local-stt.exe`

**macOS:** `./build_mac.sh` → `dist/local-stt-mac.zip`

## Privacy

Audio and transcription run locally via faster-whisper. Only the **text transcript** is sent to your configured assistant backend.
