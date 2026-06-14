# Clawvio

<p>
  <img src="https://img.shields.io/badge/Conversation-OS-111827?style=for-the-badge&logoColor=white" alt="Conversation OS" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/Express-Backend-1f2937?style=for-the-badge&logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/Inngest-Workflows-0f766e?style=for-the-badge" alt="Inngest" />
  <img src="https://img.shields.io/badge/Supabase-Data-065f46?style=for-the-badge&logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Clerk-Auth-4f46e5?style=for-the-badge" alt="Clerk" />
</p>

<p align="center">
<img width="900" height="870" alt="image" src="https://github.com/user-attachments/assets/1576a990-6365-47a2-9373-52faeb018990" />
</p>

Clawvio is an operating system powered by conversation.  
It captures intent from voice or text, executes actions across connected apps, and continuously grows a reusable personal/team knowledge base from run history.

<table>
<tr>
<td align="center" width="33%">
  
<img src="https://github.com/user-attachments/assets/f5b48199-021e-4575-853f-e8be5ffd1dd0" width="260">

<br><br>

<b>Clawvio captures context, not just notes.</b>



From client calls to internal standups, Clawvio turns raw conversation into clear, usable context.

</td>

<td align="center" width="33%">
<img src="https://github.com/user-attachments/assets/eb5d6b12-60df-45c2-8f63-17d7a54f162a" width="260">

<br><br>

<b>Every conversation becomes clear next steps.</b>

Clawvio extracts owners, deadlines, and priorities so your team always knows what to do next.

</td>

<td align="center" width="33%">
<img src="https://github.com/user-attachments/assets/52aada5b-eaf0-4f51-98bc-984ecade1c25" width="260">

<br><br>

<b>Move from insights to execution faster.</b>

Clawvio connects ideas to real workflows so decisions turn into shipped outcomes, not forgotten threads.

</td>
</tr>
</table>

## What It Does

- Converts natural language requests into structured multi-step workflows
- Executes real actions across Gmail, Calendar (and Meet through Calendar), Sheets, Docs, and more
- Runs async workflows via Inngest with run visibility and retry support
- Stores workflow context, connections, and run outcomes in Supabase
- Provides web dashboard views for `runs`, `apps`, `connections`, `data`, and `settings`
- Includes a Windows desktop STT app with hotkey capture (`Ctrl+Shift+Space`)

## Tech Stack

- Frontend: Next.js 16, React 19, Tailwind CSS 4, Framer Motion, Clerk
- Backend: Node.js 22+, Express, Inngest, OpenAI SDK, Google APIs, Supabase JS, Zod
- Desktop App: Python, faster-whisper, PyQt6, sounddevice, soundcard, pynput
- Infra: Vercel (client), Railway (backend), Supabase (DB), Cloudflare R2 / S3 (desktop installer distribution)

## Repository Layout

```text
far-away-2026/
|- client/       # Next.js web app (landing + dashboard)
|- backend/      # Express API + Inngest workflows + integrations
|- local-stt/    # Windows desktop speech-to-text companion app
|- supabase/     # SQL / migration assets
```

## Quick Start

### 1) Backend (`http://localhost:4001`)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Optional Inngest local dev server:

```bash
npm run inngest:dev
```

### 2) Client (`http://localhost:3000`)

```bash
cd client
cp .env.example .env.local
npm install
npm run dev
```

### 3) Desktop STT

```powershell
cd local-stt
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Press `Ctrl+Shift+Space` to start/stop recording.

## Environment Files

- Client env template: `client/.env.example`
- Backend env template: `backend/.env.example`
- Desktop env template: `local-stt/.env.example`

Key production requirements:

- Backend: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `TOKEN_ENCRYPTION_KEY`
- Google OAuth: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- Inngest: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_APP_ID`
- Client: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_URL`

## Deploy

| Service | Folder | Typical Host |
|---|---|---|
| Client | `client/` | Vercel |
| Backend | `backend/` | Railway |
| Desktop App | `local-stt/` | User download + local install |

## Desktop Installer Release

Build Windows executable + installer:

```powershell
cd local-stt
.\build_windows.bat
.\build_installer_windows.bat
```

Upload installer to Cloudflare R2:

```powershell
cd local-stt\release
.\upload-r2.ps1 -AccountId "<account-id>" -Bucket "<bucket>" -PublicBaseUrl "https://downloads.your-domain.com" -Version "1.0.0"
```

Set download URL in client:

```env
NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL=https://downloads.your-domain.com/windows/ClawvioSetup-latest.exe
```
