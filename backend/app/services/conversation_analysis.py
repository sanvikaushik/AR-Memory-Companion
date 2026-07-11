"""
LLM conversation analysis (Groq).

Given a Whisper transcript (+ optional timed segments), returns:
- who said what (speaker turns)
- what the conversation is about (summary + topics)
- notable facts mentioned
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.services.transcribe import TranscriptionError, _groq_api_key

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
CHAT_MODEL = "llama-3.3-70b-versatile"


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise TranscriptionError("Conversation model did not return JSON.")
    data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise TranscriptionError("Conversation model JSON was not an object.")
    return data


def _as_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            out.append(text)
    return out


async def analyze_conversation(
    transcript: str,
    *,
    segments: list[dict[str, Any]] | None = None,
    known_speakers: list[str] | None = None,
) -> dict[str, Any]:
    """
    Analyze a conversation transcript with an LLM.

    Returns:
      {
        "summary": str,
        "topics": [str],
        "facts": [str],
        "turns": [{"speaker": str, "text": str}],
        "speakerTakeaways": [{"speaker": str, "points": [str]}],
      }
    """
    cleaned = (transcript or "").strip()
    if not cleaned:
        return {
            "summary": "",
            "topics": [],
            "facts": [],
            "turns": [],
            "speakerTakeaways": [],
        }

    names = [n.strip() for n in (known_speakers or []) if n and n.strip()]
    if not names:
        names = ["Ishaan", "Sanvi"]

    segment_lines: list[str] = []
    for i, seg in enumerate(segments or []):
        piece = (seg.get("text") or "").strip()
        if not piece:
            continue
        start = seg.get("start")
        end = seg.get("end")
        if isinstance(start, (int, float)) and isinstance(end, (int, float)):
            segment_lines.append(f"[{start:.1f}-{end:.1f}s] {piece}")
        else:
            segment_lines.append(f"[{i}] {piece}")

    timed_block = "\n".join(segment_lines) if segment_lines else cleaned
    name_list = ", ".join(names)

    system = (
        "You analyze multi-person conversations for a memory companion app. "
        "From the transcript, figure out (1) who is speaking and what each person said, "
        "(2) what the conversation is mainly about, and (3) useful facts mentioned. "
        "Prefer the provided known speaker names. If someone else is clearly present, "
        "label them Speaker 3, Speaker 4, etc. "
        "Merge consecutive lines from the same speaker. "
        "Return ONLY valid JSON with this exact shape:\n"
        "{"
        '"summary":"1-3 sentence overview of what they talked about",'
        '"topics":["topic1","topic2"],'
        '"facts":["concrete fact mentioned"],'
        '"turns":[{"speaker":"Name","text":"utterance"}],'
        '"speakerTakeaways":[{"speaker":"Name","points":["what this person mainly talked about"]}]'
        "}"
    )
    user = (
        f"Known people in this household/circle: {name_list}\n\n"
        f"Timed transcript segments:\n{timed_block}\n\n"
        f"Full transcript:\n{cleaned}\n\n"
        "Analyze the conversation: who said what, and what are they talking about?"
    )

    api_key = _groq_api_key()
    payload = {
        "model": CHAT_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise TranscriptionError(
            f"Conversation analysis failed ({response.status_code}): {detail}",
        )

    content = (
        response.json()
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    data = _extract_json_object(content)

    turns: list[dict[str, str]] = []
    for item in data.get("turns") or []:
        if not isinstance(item, dict):
            continue
        speaker = str(item.get("speaker") or item.get("name") or "").strip()
        text = str(item.get("text") or item.get("utterance") or "").strip()
        if speaker and text:
            turns.append({"speaker": speaker, "text": text})
    if not turns:
        turns = [{"speaker": names[0], "text": cleaned}]

    takeaways: list[dict[str, Any]] = []
    for item in data.get("speakerTakeaways") or data.get("bySpeaker") or []:
        if not isinstance(item, dict):
            continue
        speaker = str(item.get("speaker") or item.get("name") or "").strip()
        points = _as_str_list(item.get("points") or item.get("about") or [])
        if speaker:
            takeaways.append({"speaker": speaker, "points": points})

    summary = str(data.get("summary") or "").strip()
    topics = _as_str_list(data.get("topics"))
    facts = _as_str_list(data.get("facts"))

    return {
        "summary": summary,
        "topics": topics,
        "facts": facts,
        "turns": turns,
        "speakerTakeaways": takeaways,
    }


# Back-compat alias used by older imports.
async def attribute_speakers(
    transcript: str,
    *,
    segments: list[dict[str, Any]] | None = None,
    known_speakers: list[str] | None = None,
) -> list[dict[str, str]]:
    result = await analyze_conversation(
        transcript,
        segments=segments,
        known_speakers=known_speakers,
    )
    return result["turns"]
