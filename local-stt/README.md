# local-stt

Lightweight background speech-to-text for Windows and macOS, linked to the Clawvio assistant backend.

Press `Ctrl+Shift+Space` to record, press again to stop. Transcription is copied to the clipboard and sent to the assistant API.

## Link to backend

Copy `.env.example` to `.env`:

```env
ASSISTANT_API_URL=http://localhost:4001/api/assistant
ASSISTANT_ENABLED=true
# ASSISTANT_DESKTOP_TOKEN=
# ASSISTANT_CLERK_USER_ID=   # dev-only fallback
```

Start the backend first (`cd ../backend && npm run dev`), then run local-stt.

On first request, local-stt opens a browser pairing page (`/desktop/connect`) and stores a desktop token at `~/.clawvio/desktop-token`.

Tray menu options:
- `Connect Clawvio`
- `Disconnect Clawvio`
- `Quit`

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

## System Requirements

- Python 3.8+
- ffmpeg (required by faster-whisper for audio processing)
- Microphone access (system will prompt for permissions on first run)
- Windows: Windows 10 or later
- macOS: macOS 10.13 or later with microphone/screen recording permissions enabled in System Preferences

## User Transcripts

When you record, local-stt captures and transcribes two separate audio streams:

- Mic (`user`): your voice
- Loopback (`other`): system audio / other speakers

Example output:

```json
{
  "user" : "what time is the meeting",
  "other" : "the meeting is at 2pm",
  "user" : "thanks"
}
```

Output behavior:
- Transcripts are automatically copied to clipboard
- If assistant link is enabled, transcripts are sent to your configured backend
- Press `Esc` to dismiss the overlay and clear transcript display

## Troubleshooting

### No audio captured / "Nothing heard"
- Check microphone permissions
- Ensure microphone is not in use by another application
- Try adjusting microphone volume
- Verify loopback device is available

### Transcription takes too long
- First run downloads the Whisper model (~1.5GB)
- Model is cached locally after first run

### Assistant backend not responding
- Verify backend is running: `cd ../backend && npm run dev`
- Check `ASSISTANT_API_URL` in `.env` matches your backend URL
- Check network connectivity between local-stt and backend

### macOS permissions
- Grant Microphone access in System Settings -> Privacy & Security -> Microphone
- Grant Screen Recording for system-audio capture
- For loopback recording, install BlackHole or a similar virtual audio device

## Build

- Windows: `build_windows.bat` -> `dist\local-stt.exe`
- Windows installer: `build_installer_windows.bat` -> `dist\installer\ClawvioSetup.exe`
- macOS: `./build_mac.sh` -> `dist/local-stt-mac.zip`

## Privacy

Audio and transcription run locally via faster-whisper. Only the text transcript is sent to your configured assistant backend.
