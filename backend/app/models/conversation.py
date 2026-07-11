from typing import Any

from pydantic import BaseModel, Field


class SpeakerTurn(BaseModel):
    speaker: str
    text: str


class SpeakerTakeaway(BaseModel):
    speaker: str
    points: list[str] = Field(default_factory=list)


class ConversationMemory(BaseModel):
    """
    Person-linked conversation memory for dementia-friendly recall.
    Summary/topics/facts are for HUD + quiz; turns are the archive.
    """

    sessionId: str
    personId: str
    personName: str
    date: str
    place: str | None = None
    summary: str = ""
    topics: list[str] = Field(default_factory=list)
    facts: list[str] = Field(default_factory=list)
    turns: list[SpeakerTurn] = Field(default_factory=list)
    speakerTakeaways: list[SpeakerTakeaway] = Field(default_factory=list)
    cues: list[str] = Field(default_factory=list)
    emotionalTone: str | None = None


class ConversationMemoryCreate(BaseModel):
    sessionId: str | None = None
    personId: str
    personName: str = ""
    place: str | None = None
    summary: str = ""
    topics: list[str] = Field(default_factory=list)
    facts: list[str] = Field(default_factory=list)
    turns: list[SpeakerTurn] = Field(default_factory=list)
    speakerTakeaways: list[SpeakerTakeaway] = Field(default_factory=list)
    cues: list[str] = Field(default_factory=list)
    emotionalTone: str | None = None
