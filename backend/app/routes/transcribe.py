"""
POST /api/transcribe — conversation audio → transcript + LLM analysis + memory save.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.models.conversation import ConversationMemoryCreate
from app.services.conversation_analysis import analyze_conversation
from app.services.memory_store import save_conversation_memory
from app.services.transcribe import TranscriptionError, audio_to_transcript

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


class SpeakerTurn(BaseModel):
    speaker: str
    text: str


class SpeakerTakeaway(BaseModel):
    speaker: str
    points: list[str] = Field(default_factory=list)


class TranscribeResponse(BaseModel):
    text: str
    sessionId: str | None = None
    turns: list[SpeakerTurn] = Field(default_factory=list)
    summary: str = ""
    topics: list[str] = Field(default_factory=list)
    facts: list[str] = Field(default_factory=list)
    speakerTakeaways: list[SpeakerTakeaway] = Field(default_factory=list)
    saved: bool = False
    storage: str | None = None


@router.post("", response_model=TranscribeResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    sessionId: str | None = Form(None),
    personId: str | None = Form(None),
    personName: str | None = Form(None),
    speakers: str | None = Form(
        None,
        description='JSON array of known names, e.g. ["Ishaan","Sanvi"]',
    ),
) -> TranscribeResponse:
    raw = await audio.read()
    filename = audio.filename or "conversation.webm"
    content_type = audio.content_type or "audio/webm"

    known: list[str] = []
    if speakers:
        try:
            parsed = json.loads(speakers)
            if isinstance(parsed, list):
                known = [str(x).strip() for x in parsed if str(x).strip()]
        except json.JSONDecodeError:
            known = [s.strip() for s in speakers.split(",") if s.strip()]

    if not known:
        known = ["Ishaan", "Sanvi"]

    try:
        result = await audio_to_transcript(
            raw,
            filename=filename,
            content_type=content_type,
        )
        analysis = await analyze_conversation(
            result["text"],
            segments=result.get("segments") or [],
            known_speakers=known,
        )
    except TranscriptionError as err:
        raise HTTPException(status_code=502, detail=str(err)) from err

    turns = [SpeakerTurn(**t) for t in analysis["turns"]]
    takeaways = [
        SpeakerTakeaway(**t) for t in analysis.get("speakerTakeaways") or []
    ]
    summary = analysis.get("summary") or ""
    topics = analysis.get("topics") or []
    facts = analysis.get("facts") or []

    # Prefer active person; else first known speaker name from the analysis.
    save_person_id = (personId or "").strip() or "unknown"
    save_person_name = (personName or "").strip()
    if not save_person_name and turns:
        save_person_name = turns[0].speaker
    if not save_person_name and known:
        save_person_name = known[0]
    if save_person_id == "unknown" and save_person_name:
        # Stable local id from name for file-store demos (ishaan / sanvi).
        save_person_id = save_person_name.lower().replace(" ", "-")

    saved = False
    storage: str | None = None
    try:
        _memory, storage = await save_conversation_memory(
            ConversationMemoryCreate(
                sessionId=sessionId,
                personId=save_person_id,
                personName=save_person_name or "Someone",
                summary=summary,
                topics=topics,
                facts=facts,
                turns=[{"speaker": t.speaker, "text": t.text} for t in turns],
                speakerTakeaways=[
                    {"speaker": t.speaker, "points": t.points} for t in takeaways
                ],
            ),
        )
        saved = True
        if sessionId is None:
            sessionId = _memory.sessionId
    except Exception as err:
        # Transcription still succeeds even if persistence fails.
        storage = f"error:{err}"

    return TranscribeResponse(
        text=result["text"],
        sessionId=sessionId,
        turns=turns,
        summary=summary,
        topics=topics,
        facts=facts,
        speakerTakeaways=takeaways,
        saved=saved,
        storage=storage,
    )
