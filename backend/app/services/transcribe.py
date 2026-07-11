"""
Conversation audio → transcript (Groq Whisper).

Takes raw audio bytes from a recorded conversation and returns plain text.
Keeps GROQ_API_KEY on the server — do not call Groq from the frontend.
"""

from __future__ import annotations

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

# backend/.env (this file lives at backend/app/services/transcribe.py)
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH, override=True)

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_MODEL = "whisper-large-v3-turbo"


class TranscriptionError(Exception):
    """Raised when audio cannot be transcribed."""


def _read_key_from_env_file() -> str:
    """Parse GROQ_API_KEY directly from backend/.env (avoids stale process env)."""
    if not ENV_PATH.is_file():
        return ""
    try:
        text = ENV_PATH.read_text(encoding="utf-8-sig")
    except OSError:
        return ""
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip() != "GROQ_API_KEY":
            continue
        value = value.strip().strip("'").strip('"')
        return value
    return ""


def _groq_api_key() -> str:
    load_dotenv(ENV_PATH, override=True)
    key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not key or key.startswith("your_"):
        key = _read_key_from_env_file()
        if key:
            os.environ["GROQ_API_KEY"] = key
    if not key or key.startswith("your_"):
        raise TranscriptionError(
            f"GROQ_API_KEY is not set (looked in {ENV_PATH}). "
            "Add your Groq API key to backend/.env.",
        )
    return key


async def audio_to_transcript(
    audio_bytes: bytes,
    *,
    filename: str = "conversation.webm",
    content_type: str = "audio/webm",
    language: str = "en",
    model: str = DEFAULT_MODEL,
) -> dict:
    """
    Convert conversation audio into transcript text + timed segments.

    Returns {"text": str, "segments": [{"start","end","text"}, ...]}.
    """
    if not audio_bytes:
        raise TranscriptionError("Empty audio — nothing to transcribe.")

    api_key = _groq_api_key()
    safe_name = filename or "conversation.webm"
    mime = content_type or "application/octet-stream"

    files = {
        "file": (safe_name, audio_bytes, mime),
    }
    data = {
        "model": model,
        "language": language,
        "response_format": "verbose_json",
        "temperature": "0",
    }

    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GROQ_TRANSCRIBE_URL,
            headers=headers,
            data=data,
            files=files,
        )

    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise TranscriptionError(
            f"Groq transcription failed ({response.status_code}): {detail}",
        )

    payload = response.json()
    text = (payload.get("text") or "").strip()
    if not text:
        raise TranscriptionError("Groq returned an empty transcript.")

    segments: list[dict] = []
    for seg in payload.get("segments") or []:
        piece = (seg.get("text") or "").strip()
        if not piece:
            continue
        segments.append(
            {
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": piece,
            },
        )

    return {"text": text, "segments": segments}
