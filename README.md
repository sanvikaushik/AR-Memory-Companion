# AR Memory Companion

Hackathon MVP: AR "memory companion" for people with dementia. Glasses (simulated via webcam) recognize people, show a HUD profile card, transcribe conversations, extract topics with an LLM, and quiz the wearer using spaced retrieval.

### Product UX (wearer)

1. Live camera sees a face → **box around the face**
2. Face is matched against people enrolled from the **camera roll** (not typed in live)
3. On match → **HUD overlay** (name / relationship / facts) appears automatically
4. Conversation can be transcribed; topics extracted afterward
5. Later: spaced-retrieval quiz from the same person records

There is **no** live "Add person" form in the wearer flow. Enroll faces via `backend/seed/` + `python -m scripts.seed_people`.

This monorepo scaffolds the request/response loop. Face-api.js matching, camera-roll enrollment, Groq Whisper, and Gemini extraction are **stubs** so three people can implement them in parallel without editing the same files.

## Repo layout

```
/frontend          Next.js (App Router) + TypeScript
/backend           FastAPI + MongoDB Atlas
```

### Who owns what (parallel work)

| Person | Implement in these files only |
|--------|-------------------------------|
| Face recognition | `frontend/src/lib/faceDetection.ts`, `frontend/src/components/CameraFeed.tsx` |
| Speech + topics | `backend/app/routes/transcribe.py`, `backend/app/routes/extract_topics.py`, `frontend/src/components/SessionControls.tsx` |
| Quiz / spaced retrieval | `frontend/src/components/QuizScreen.tsx`, person `spacedRetrievalState` via `people` API |

Shared contracts (touch carefully): `frontend/src/lib/types.ts`, `backend/app/models/person.py`, `frontend/src/lib/api.ts`.

## Prerequisites

- Node.js 20+
- Python 3.11+
- A MongoDB Atlas cluster (connection string in `.env`)

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set MONGODB_URI (and later GROQ_API_KEY, GEMINI_API_KEY)
```

Run the API **from `backend/` with the venv activated** (required — a system/Homebrew `uvicorn` will miss packages like `motor`):

```bash
cd backend
source .venv/bin/activate
which uvicorn                      # should be .../backend/.venv/bin/uvicorn
uvicorn app.main:app --reload --port 8000
```

Or without activating:

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Confirm it’s up (expect `{"status":"ok"}`):

```bash
curl http://127.0.0.1:8000/health
```

- Health: http://127.0.0.1:8000/health
- Interactive docs: http://127.0.0.1:8000/docs

If you see `ModuleNotFoundError: No module named 'motor'`, you’re not using the project venv — re-run with `source .venv/bin/activate` or `.venv/bin/uvicorn ...`.
If the browser shows connection timed out / refused, nothing is listening on `:8000` — start the API first, then hit `/health`.

### People API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/people` | List all people |
| GET | `/api/people/{personId}` | Get one person |
| POST | `/api/people` | Create person (`personId` auto-generated) |
| PUT | `/api/people/{personId}` | Partial update |
| DELETE | `/api/people/{personId}` | Delete |

Stub routes (safe to call now; return placeholder payloads):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/transcribe` | Multipart `audio` file → stub transcript |
| POST | `/api/extract-topics` | JSON `{ transcript, personId?, sessionId? }` → stub topics |

## Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```

Open http://localhost:3000

### Seed two people for live face matching (no UI enroll)

1. Put clear front-facing photos in `backend/seed/` (e.g. `person_a.jpg`, `person_b.jpg`).
2. Edit `backend/seed/people.json` with their names, relationships, facts, and filenames.
3. Seed MongoDB:

```bash
cd backend
source .venv/bin/activate
python -m scripts.seed_people
```

4. Reload the frontend — it loads people from `GET /api/people` and indexes faces. Live UI stays detection-only (oval + HUD).

### Verify end-to-end

1. Start backend on `:8000` (venv uvicorn), confirm with `curl http://127.0.0.1:8000/health`.
2. Start frontend on `:3000`.
3. Allow webcam — you should see the live feed and a **stub face box** after ~1.5s.
4. HUD stays empty until a **known** match (camera-roll matching not implemented yet).
5. **Start recording** / **Stop & process** hits stub `/api/transcribe` then `/api/extract-topics`.

Dev-only Mongo check (not part of wearer UX):

```bash
curl -s http://127.0.0.1:8000/api/people \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alex Rivera","relationship":"grandchild","photo":"https://example.com/alex.jpg","facts":["Visits Sundays"],"conversationHistory":[],"spacedRetrievalState":{}}'
```

Allow mic when testing session recording.

## Person document shape

Stored in MongoDB and mirrored in `frontend/src/lib/types.ts`:

```json
{
  "personId": "string",
  "name": "string",
  "relationship": "string",
  "photo": "string",
  "facts": ["string"],
  "conversationHistory": [
    { "date": "string", "topics": ["string"], "sessionId": "string" }
  ],
  "spacedRetrievalState": {}
}
```

## Face detection events

```ts
{ status: "known", personId: string, box: { x, y, width, height } }  // 0–1 relative
// or
{ status: "unknown", snapshot: string, box: { x, y, width, height } }
```

Live UI draws `box` on the camera feed and shows the HUD only for `known` matches.

## Environment variables

**Backend** (`backend/.env`):

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name (default `ar_memory_companion`) |
| `GROQ_API_KEY` | Groq Whisper (when implementing `transcribe.py`) |
| `GEMINI_API_KEY` | Gemini (when implementing `extract_topics.py`) |

**Frontend** (`frontend/.env.local`):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend origin (default `http://localhost:8000`) |
