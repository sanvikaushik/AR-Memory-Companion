"""
Stub: Groq Whisper transcription proxy.

TODO: Accept audio upload, call Groq whisper-large-v3-turbo, return transcript text.
Do not call Groq from the frontend — keep GROQ_API_KEY server-side only.
"""

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


class TranscribeResponse(BaseModel):
    text: str
    sessionId: str | None = None


@router.post("", response_model=TranscribeResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    sessionId: str | None = Form(None),
) -> TranscribeResponse:
    # Stub — replace with Groq Whisper API call
    _ = await audio.read()
    return TranscribeResponse(
        text="[stub transcript] Conversation audio received but not yet transcribed.",
        sessionId=sessionId,
    )
