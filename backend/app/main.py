from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env before importing routes that read env vars.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

from app.db.mongo import close_client
from app.routes import conversations, extract_topics, people, seed, transcribe
from app.services.hardcoded_people import ensure_hardcoded_people
from app.services.seed_conversations import ensure_seed_conversations
from app.services.transcribe import _groq_api_key


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm / repair key so transcription doesn't see a stale placeholder.
    try:
        _groq_api_key()
    except Exception:
        pass
    # Always keep Ishaan + Sanvi in the people collection.
    try:
        await ensure_hardcoded_people()
    except Exception:
        pass
    try:
        await ensure_seed_conversations()
    except Exception:
        pass
    yield
    await close_client()


app = FastAPI(
    title="AR Memory Companion API",
    description="Backend for face-aware memory companion (hackathon MVP)",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(people.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(transcribe.router, prefix="/api")
app.include_router(extract_topics.router, prefix="/api")
app.include_router(seed.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
