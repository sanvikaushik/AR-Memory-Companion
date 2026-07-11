from typing import Any

from pydantic import BaseModel, Field


class ConversationEntry(BaseModel):
    date: str
    topics: list[str]
    sessionId: str
    summary: str = ""
    personName: str = ""


class Person(BaseModel):
    personId: str
    name: str
    relationship: str
    photo: str
    facts: list[str] = Field(default_factory=list)
    conversationHistory: list[ConversationEntry] = Field(default_factory=list)
    spacedRetrievalState: dict[str, Any] = Field(default_factory=dict)
    # 128-d face embedding used for recognition + duplicate detection.
    descriptor: list[float] = Field(default_factory=list)
    # Multiple reference embeddings (different angles), grown via online learning.
    descriptors: list[list[float]] = Field(default_factory=list)


class PersonCreate(BaseModel):
    name: str
    relationship: str
    photo: str
    facts: list[str] = Field(default_factory=list)
    conversationHistory: list[ConversationEntry] = Field(default_factory=list)
    spacedRetrievalState: dict[str, Any] = Field(default_factory=dict)
    descriptor: list[float] = Field(default_factory=list)
    descriptors: list[list[float]] = Field(default_factory=list)


class PersonUpdate(BaseModel):
    name: str | None = None
    relationship: str | None = None
    photo: str | None = None
    facts: list[str] | None = None
    conversationHistory: list[ConversationEntry] | None = None
    spacedRetrievalState: dict[str, Any] | None = None
    descriptor: list[float] | None = None
    descriptors: list[list[float]] | None = None


class DescriptorAppend(BaseModel):
    descriptor: list[float]
