"""
Conversation memory CRUD — dementia-friendly recall storage.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.conversation import ConversationMemory, ConversationMemoryCreate
from app.services.memory_store import (
    get_conversation_memory,
    list_conversation_memories,
    save_conversation_memory,
)
from app.services.seed_conversations import build_prep_briefing

router = APIRouter(prefix="/conversations", tags=["conversations"])


class PrepBriefing(BaseModel):
    personId: str
    talkCount: int = 0
    lastSummary: str = ""
    lastPlace: str = ""
    lastTone: str = ""
    topics: list[str] = Field(default_factory=list)
    facts: list[str] = Field(default_factory=list)
    openLoops: list[str] = Field(default_factory=list)
    starters: list[str] = Field(default_factory=list)
    doNotForget: list[str] = Field(default_factory=list)
    safeTopics: list[str] = Field(default_factory=list)
    continuityLine: str = ""


@router.get("", response_model=list[ConversationMemory])
async def list_conversations(
    personId: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[ConversationMemory]:
    return await list_conversation_memories(person_id=personId, limit=limit)


@router.get("/prep/{person_id}", response_model=PrepBriefing)
async def conversation_prep(person_id: str) -> PrepBriefing:
    """Build a pre-conversation briefing from past transcripts."""
    memories = await list_conversation_memories(person_id=person_id, limit=50)
    docs = [m.model_dump() for m in memories]
    try:
        from app.db.mongo import get_conversations_collection, mongo_configured

        if mongo_configured():
            col = get_conversations_collection()
            raw: list[dict] = []
            async for doc in col.find({"personId": person_id}):
                doc.pop("_id", None)
                raw.append(doc)
            if raw:
                docs = raw
    except Exception:
        pass
    return PrepBriefing(**build_prep_briefing(person_id, docs))


@router.get("/{session_id}", response_model=ConversationMemory)
async def get_conversation(session_id: str) -> ConversationMemory:
    memory = await get_conversation_memory(session_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return memory


@router.post("", response_model=ConversationMemory, status_code=201)
async def create_conversation(
    payload: ConversationMemoryCreate,
) -> ConversationMemory:
    memory, _backend = await save_conversation_memory(payload)
    return memory
