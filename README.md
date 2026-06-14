# Far Away

Voice assistant stack with separate frontend and backend (not a monorepo — each app has its own dependencies and deploys independently).

## Project structure

```
far-away-2026/
├── client/      # Next.js frontend  → deploy to Vercel / static host
├── backend/     # Express + Inngest assistant API  → deploy to Railway / Fly / etc.
└── local-stt/   # Desktop speech-to-text  → links to backend after dictation
```

## Quick start

Each folder is independent. Install and run separately:

### Backend (port 4001)

```bash
cd backend
cp .env.example .env   # set OPENAI_API_KEY
npm install
npm run dev
```

Inngest dev server (optional, for async workflows):

```bash
npm run inngest:dev
```

### Frontend (port 3000)

```bash
cd client
cp .env.example .env.local
npm install
npm run dev
```

### Local STT (desktop)

```bash
cd local-stt
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Press **Ctrl+Shift+Space** to record. Transcript is copied to clipboard and sent to `http://localhost:4001/api/assistant`.

## Deploy separately

| App | Folder | Typical host |
|-----|--------|--------------|
| Frontend | `client/` | Vercel, Netlify |
| Backend | `backend/` | Railway, Fly.io, Render |
| Local STT | `local-stt/` | User's machine (not deployed) |

Set `ASSISTANT_API_URL` in `local-stt/.env` to your production backend URL when not running locally.

## Publish Windows installer (R2 / S3)

Build installer:

```bash
cd local-stt
build_installer_windows.bat
```

Upload to Cloudflare R2:

```powershell
cd local-stt\release
.\upload-r2.ps1 -AccountId "<account-id>" -Bucket "<bucket>" -PublicBaseUrl "https://downloads.clawvio.ai" -Version "1.0.0"
```

Upload to AWS S3:

```powershell
cd local-stt\release
.\upload-s3.ps1 -Bucket "<bucket>" -Region "us-east-1" -PublicBaseUrl "https://downloads.clawvio.ai" -Version "1.0.0"
```

Set client env for the website download button:

```env
NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL=https://downloads.clawvio.ai/windows/ClawvioSetup-latest.exe
```
