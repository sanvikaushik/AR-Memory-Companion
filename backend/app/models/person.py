from typing import Any

from pydantic import BaseModel, Field


class ConversationEntry(BaseModel):
    date: str
    topics: list[str]
    sessionId: str


class Person(BaseModel):
    personId: str
    name: str
    relationship: str
    photo: str
    facts: list[str] = Field(default_factory=list)
    conversationHistory: list[ConversationEntry] = Field(default_factory=list)
    spacedRetrievalState: dict[str, Any] = Field(default_factory=dict)


class PersonCreate(BaseModel):
    name: str
    relationship: str
    photo: str
    facts: list[str] = Field(default_factory=list)
    conversationHistory: list[ConversationEntry] = Field(default_factory=list)
    spacedRetrievalState: dict[str, Any] = Field(default_factory=dict)


class PersonUpdate(BaseModel):
    name: str | None = None
    relationship: str | None = None
    photo: str | None = None
    facts: list[str] | None = None
    conversationHistory: list[ConversationEntry] | None = None
    spacedRetrievalState: dict[str, Any] | None = None
