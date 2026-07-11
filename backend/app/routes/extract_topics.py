"""
Stub: Gemini topic/fact extraction proxy.

TODO: Send transcript text to Gemini, return extracted topics and optional facts.
Do not call Gemini from the frontend — keep GEMINI_API_KEY server-side only.
"""

from pydantic import BaseModel, Field
from fastapi import APIRouter

router = APIRouter(prefix="/extract-topics", tags=["extract-topics"])


class ExtractTopicsRequest(BaseModel):
    transcript: str
    personId: str | None = None
    sessionId: str | None = None


class ExtractTopicsResponse(BaseModel):
    topics: list[str] = Field(default_factory=list)
    facts: list[str] = Field(default_factory=list)
    sessionId: str | None = None


@router.post("", response_model=ExtractTopicsResponse)
async def extract_topics(payload: ExtractTopicsRequest) -> ExtractTopicsResponse:
    # Stub — replace with Gemini API call
    return ExtractTopicsResponse(
        topics=["[stub topic] family", "[stub topic] weather"],
        facts=["[stub fact] Extracted from transcript once Gemini is wired up."],
        sessionId=payload.sessionId,
    )
