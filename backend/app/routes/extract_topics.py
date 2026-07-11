"""
POST /api/extract-topics — LLM topic/fact extraction from a transcript.

Uses Groq (same key as Whisper) so Gemini is optional for this MVP.
"""

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from app.services.conversation_analysis import analyze_conversation
from app.services.transcribe import TranscriptionError

router = APIRouter(prefix="/extract-topics", tags=["extract-topics"])


class ExtractTopicsRequest(BaseModel):
    transcript: str
    personId: str | None = None
    sessionId: str | None = None
    speakers: list[str] | None = None


class ExtractTopicsResponse(BaseModel):
    topics: list[str] = Field(default_factory=list)
    facts: list[str] = Field(default_factory=list)
    summary: str = ""
    sessionId: str | None = None


@router.post("", response_model=ExtractTopicsResponse)
async def extract_topics(payload: ExtractTopicsRequest) -> ExtractTopicsResponse:
    try:
        analysis = await analyze_conversation(
            payload.transcript,
            known_speakers=payload.speakers or ["Ishaan", "Sanvi"],
        )
    except TranscriptionError as err:
        raise HTTPException(status_code=502, detail=str(err)) from err

    return ExtractTopicsResponse(
        topics=analysis.get("topics") or [],
        facts=analysis.get("facts") or [],
        summary=analysis.get("summary") or "",
        sessionId=payload.sessionId,
    )
