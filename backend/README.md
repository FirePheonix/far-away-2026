# Far Away Assistant Backend

Tool-based voice assistant backend. Converts natural language (from **local-stt** or any client) into structured Google Workspace actions via a GPT planner and Inngest workflow.

## Architecture

```
POST /api/assistant { transcript }
        ↓
   GPT Planner (strict JSON actions)
        ↓
   executePlan() — tool registry + step chaining
        ↓
   Gmail / Sheets / Calendar / Meet tools
```

Each action is a **tool**, not an agent. The planner outputs `{ "tool": "sheets.get_last_row", "params": {...} }`.

## Quick start

```bash
cd backend
cp .env.example .env
# Set OPENAI_API_KEY at minimum

npm install
npm run dev
```

In another terminal (Inngest dev server):

```bash
npm run inngest:dev
```

## API

### `POST /api/assistant`

```json
{ "transcript": "Get the last row from Hackathon Winners and email the winner." }
```

Response:

```json
{
  "success": true,
  "stepsExecuted": [...],
  "results": { "step_0": {...}, "step_1": {...} },
  "plan": { "actions": [...] }
}
```

Async mode (Inngest queue): `POST /api/assistant?async=true`

### `GET /api/tools` — list registered tools

### `GET /api/health` — health check

## Connect local-stt

The desktop app lives in `../local-stt`. It POSTs each transcript here automatically.

```bash
cd ../local-stt
cp .env.example .env
python app.py
```

Manual test:

```bash
curl -X POST http://localhost:4001/api/assistant \
  -H "Content-Type: application/json" \
  -d "{\"transcript\": \"Schedule a meeting with the winner from Hackathon Winners\"}"
```

## Environment

See [`.env.example`](./.env.example). Set `GOOGLE_MOCK_MODE=true` for local dev without Google credentials.

## Folder structure

```
backend/src/
├── server.ts
├── routes/assistant.routes.ts
├── controllers/assistant.controller.ts
├── ai/          — planner, schemas, prompts
├── tools/       — registry + gmail/sheets/calendar/meet
├── workflows/   — Inngest + executor pipeline
├── types/
├── config/
├── utils/
└── middleware/
```
