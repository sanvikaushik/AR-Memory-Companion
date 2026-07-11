"""
Persist conversation memories for dementia-friendly recall.

Uses MongoDB `conversations` when configured; otherwise a local JSON file
at backend/data/conversations.json so the hackathon MVP still works offline.
Also merges a short history entry + facts onto the Person document when possible.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.db.mongo import (
    get_conversations_collection,
    get_people_collection,
    mongo_configured,
)
from app.models.conversation import ConversationMemory, ConversationMemoryCreate
from app.models.person import ConversationEntry

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
CONVERSATIONS_FILE = DATA_DIR / "conversations.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_cues(memory: ConversationMemory) -> list[str]:
    if memory.cues:
        return memory.cues
    cues: list[str] = []
    if memory.personName and memory.topics:
        topic = memory.topics[0]
        cues.append(f"Who talked with you about {topic}?")
        cues.append(f"What did you and {memory.personName} talk about?")
    elif memory.personName:
        cues.append(f"Who did you speak with recently?")
        cues.append(f"What did you talk about with {memory.personName}?")
    if memory.summary:
        cues.append("What was your last conversation about?")
    # Unique, short list
    seen: set[str] = set()
    out: list[str] = []
    for cue in cues:
        if cue not in seen:
            seen.add(cue)
            out.append(cue)
    return out[:4]


def _read_file_store() -> list[dict[str, Any]]:
    if not CONVERSATIONS_FILE.is_file():
        return []
    try:
        raw = json.loads(CONVERSATIONS_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _write_file_store(rows: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONVERSATIONS_FILE.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


async def _mongo_available() -> bool:
    if not mongo_configured():
        return False
    try:
        client = get_conversations_collection().database.client
        await client.admin.command("ping")
        return True
    except Exception:
        return False


async def save_conversation_memory(
    payload: ConversationMemoryCreate,
) -> tuple[ConversationMemory, str]:
    """
    Save a conversation memory. Returns (memory, storage_backend)
    where storage_backend is "mongodb" or "file".
    """
    memory = ConversationMemory(
        sessionId=payload.sessionId or str(uuid.uuid4()),
        personId=payload.personId,
        personName=payload.personName,
        date=_now_iso(),
        place=payload.place,
        summary=payload.summary,
        topics=payload.topics,
        facts=payload.facts,
        turns=payload.turns,
        speakerTakeaways=payload.speakerTakeaways,
        cues=payload.cues,
        emotionalTone=payload.emotionalTone,
    )
    memory.cues = _build_cues(memory)
    doc = memory.model_dump()

    backend = "file"
    if await _mongo_available():
        await get_conversations_collection().insert_one(doc)
        backend = "mongodb"
        try:
            await _merge_into_person(memory)
        except Exception:
            # Person merge is best-effort.
            pass
    else:
        rows = _read_file_store()
        rows.append(doc)
        _write_file_store(rows)
        backend = "file"

    return memory, backend


async def _merge_into_person(memory: ConversationMemory) -> None:
    collection = get_people_collection()
    person = await collection.find_one({"personId": memory.personId})
    if person is None and memory.personName:
        person = await collection.find_one({"name": memory.personName})
    if person is None:
        return

    history = list(person.get("conversationHistory") or [])
    history.append(
        ConversationEntry(
            date=memory.date,
            topics=memory.topics,
            sessionId=memory.sessionId,
            summary=memory.summary,
            personName=memory.personName,
        ).model_dump(),
    )
    # Keep last 50 sessions on the person card.
    history = history[-50:]

    existing_facts = [str(f).strip().lower() for f in (person.get("facts") or [])]
    merged_facts = list(person.get("facts") or [])
    for fact in memory.facts:
        if fact.strip().lower() not in existing_facts:
            merged_facts.append(fact)
            existing_facts.append(fact.strip().lower())

    spaced = dict(person.get("spacedRetrievalState") or {})
    for i, cue in enumerate(memory.cues[:3]):
        key = f"{memory.personId}-{memory.sessionId[:8]}-{i}"
        spaced[key] = {
            "prompt": cue,
            "answer": memory.personName or memory.summary,
            "topics": memory.topics,
            "createdAt": memory.date,
        }

    await collection.update_one(
        {"personId": person["personId"]},
        {
            "$set": {
                "conversationHistory": history,
                "facts": merged_facts,
                "spacedRetrievalState": spaced,
            },
        },
    )


async def list_conversation_memories(
    person_id: str | None = None,
    limit: int = 50,
) -> list[ConversationMemory]:
    if await _mongo_available():
        query: dict[str, Any] = {}
        if person_id:
            query["personId"] = person_id
        cursor = (
            get_conversations_collection()
            .find(query, {"_id": 0})
            .sort("date", -1)
            .limit(limit)
        )
        out: list[ConversationMemory] = []
        async for doc in cursor:
            out.append(ConversationMemory(**doc))
        return out

    rows = _read_file_store()
    if person_id:
        rows = [r for r in rows if r.get("personId") == person_id]
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return [ConversationMemory(**r) for r in rows[:limit]]


async def get_conversation_memory(session_id: str) -> ConversationMemory | None:
    if await _mongo_available():
        doc = await get_conversations_collection().find_one(
            {"sessionId": session_id},
            {"_id": 0},
        )
        return ConversationMemory(**doc) if doc else None

    for row in _read_file_store():
        if row.get("sessionId") == session_id:
            return ConversationMemory(**row)
    return None
