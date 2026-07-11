"""
Conversation memory CRUD — dementia-friendly recall storage.
"""

from fastapi import APIRouter, HTTPException, Query

from app.models.conversation import ConversationMemory, ConversationMemoryCreate
from app.services.memory_store import (
    get_conversation_memory,
    list_conversation_memories,
    save_conversation_memory,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationMemory])
async def list_conversations(
    personId: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[ConversationMemory]:
    return await list_conversation_memories(person_id=personId, limit=limit)


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
