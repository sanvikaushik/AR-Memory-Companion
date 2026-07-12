"""Seed demo conversation transcripts for Ishaan & Sanvi (dementia recall demos)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.mongo import get_conversations_collection, mongo_configured
from app.services.hardcoded_people import ISHAAN, SANVI
from app.services.memory_store import _merge_into_person

SEED_FLAG = "hackathon-seed-v1"


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _memories() -> list[dict[str, Any]]:
    ishaan = ISHAAN["personId"]
    sanvi = SANVI["personId"]
    return [
        {
            "sessionId": f"seed-ishaan-1-{SEED_FLAG}",
            "personId": ishaan,
            "personName": "Ishaan Chandra",
            "date": _iso_days_ago(1),
            "place": "Kitchen table",
            "summary": "You and Ishaan talked about his Ericsson internship and a weekend walk.",
            "topics": ["Ericsson internship", "weekend plans", "Ottawa weather"],
            "facts": [
                "Ishaan is interning at Ericsson",
                "Ishaan likes walking downtown on weekends",
            ],
            "turns": [
                {"speaker": "Ishaan Chandra", "text": "Work at Ericsson has been busy but good."},
                {"speaker": "You", "text": "I'm glad. Did you get outside this weekend?"},
                {"speaker": "Ishaan Chandra", "text": "Yes, a short walk downtown."},
            ],
            "speakerTakeaways": [
                {
                    "speaker": "Ishaan Chandra",
                    "points": ["Internship is going well", "Went for a walk downtown"],
                }
            ],
            "cues": [
                "Who talked with you about Ericsson?",
                "What did Ishaan do this weekend?",
            ],
            "emotionalTone": "warm",
            "seedTag": SEED_FLAG,
        },
        {
            "sessionId": f"seed-ishaan-2-{SEED_FLAG}",
            "personId": ishaan,
            "personName": "Ishaan Chandra",
            "date": _iso_days_ago(5),
            "place": "Living room",
            "summary": "Ishaan explained a Carleton class project about machine learning.",
            "topics": ["Carleton", "machine learning project", "school"],
            "facts": [
                "Ishaan studies CS and AI at Carleton",
                "He is working on a machine learning class project",
            ],
            "turns": [
                {"speaker": "Ishaan Chandra", "text": "My ML project is finally compiling."},
                {"speaker": "You", "text": "That sounds hard. Are you proud of it?"},
                {"speaker": "Ishaan Chandra", "text": "Yeah — still polishing it."},
            ],
            "speakerTakeaways": [
                {
                    "speaker": "Ishaan Chandra",
                    "points": ["Working on an ML project at Carleton"],
                }
            ],
            "cues": ["What school does Ishaan attend?", "What project did Ishaan mention?"],
            "emotionalTone": "curious",
            "seedTag": SEED_FLAG,
        },
        {
            "sessionId": f"seed-ishaan-3-{SEED_FLAG}",
            "personId": ishaan,
            "personName": "Ishaan Chandra",
            "date": _iso_days_ago(12),
            "place": "Cafe",
            "summary": "You reminisced about Transport Canada and how proud you are of Ishaan.",
            "topics": ["Transport Canada", "career", "encouragement"],
            "facts": ["Ishaan previously worked at Transport Canada"],
            "turns": [
                {"speaker": "You", "text": "I remember when you were at Transport Canada."},
                {"speaker": "Ishaan Chandra", "text": "That was a good first role."},
            ],
            "speakerTakeaways": [
                {"speaker": "Ishaan Chandra", "points": ["Appreciated past Transport Canada role"]}
            ],
            "cues": ["Where did Ishaan work before Ericsson?"],
            "emotionalTone": "proud",
            "seedTag": SEED_FLAG,
        },
        {
            "sessionId": f"seed-sanvi-1-{SEED_FLAG}",
            "personId": sanvi,
            "personName": "Sanvi Kaushik",
            "date": _iso_days_ago(2),
            "place": "Front porch",
            "summary": "Sanvi shared BlackBerry internship stories and asked about your garden.",
            "topics": ["BlackBerry", "gardening", "summer"],
            "facts": [
                "Sanvi interned at BlackBerry",
                "Sanvi asked about your garden",
            ],
            "turns": [
                {"speaker": "Sanvi Kaushik", "text": "BlackBerry taught me so much about shipping software."},
                {"speaker": "You", "text": "You always loved building things."},
                {"speaker": "Sanvi Kaushik", "text": "How is the garden this year?"},
            ],
            "speakerTakeaways": [
                {
                    "speaker": "Sanvi Kaushik",
                    "points": ["Proud of BlackBerry experience", "Curious about your garden"],
                }
            ],
            "cues": [
                "Who asked about your garden?",
                "Where did Sanvi intern before?",
            ],
            "emotionalTone": "friendly",
            "seedTag": SEED_FLAG,
            "openLoops": ["Tell Sanvi how the garden is doing"],
        },
        {
            "sessionId": f"seed-sanvi-2-{SEED_FLAG}",
            "personId": sanvi,
            "personName": "Sanvi Kaushik",
            "date": _iso_days_ago(8),
            "place": "Dining room",
            "summary": "Sanvi talked about Carleton engineering and Technovation mentoring.",
            "topics": ["Carleton", "Technovation", "mentoring"],
            "facts": [
                "Sanvi studies engineering at Carleton",
                "Sanvi helped with Technovation mentoring",
            ],
            "turns": [
                {"speaker": "Sanvi Kaushik", "text": "Technovation mentees presented their apps."},
                {"speaker": "You", "text": "That must have felt wonderful."},
            ],
            "speakerTakeaways": [
                {"speaker": "Sanvi Kaushik", "points": ["Mentored Technovation students"]}
            ],
            "cues": ["What mentoring did Sanvi do?"],
            "emotionalTone": "uplifting",
            "seedTag": SEED_FLAG,
        },
        {
            "sessionId": f"seed-sanvi-3-{SEED_FLAG}",
            "personId": sanvi,
            "personName": "Sanvi Kaushik",
            "date": _iso_days_ago(15),
            "place": "Park bench",
            "summary": "A calm chat about Ericsson teammates and a shared lunch next week.",
            "topics": ["Ericsson", "lunch plans", "friends"],
            "facts": [
                "Sanvi works at Ericsson",
                "You planned to have lunch together",
            ],
            "turns": [
                {"speaker": "Sanvi Kaushik", "text": "Maybe we can do lunch next week."},
                {"speaker": "You", "text": "I would like that."},
            ],
            "speakerTakeaways": [
                {"speaker": "Sanvi Kaushik", "points": ["Suggested lunch next week"]}
            ],
            "cues": ["What plans did you make with Sanvi?"],
            "emotionalTone": "calm",
            "seedTag": SEED_FLAG,
            "openLoops": ["Confirm lunch plans with Sanvi"],
        },
    ]


async def ensure_seed_conversations() -> int:
    """Insert demo transcripts once; merge short history onto people."""
    if not mongo_configured():
        return 0

    collection = get_conversations_collection()
    inserted = 0
    for doc in _memories():
        existing = await collection.find_one({"sessionId": doc["sessionId"]})
        if existing is not None:
            continue
        payload = {k: v for k, v in doc.items() if k != "openLoops"}
        # Keep openLoops in stored doc for prep UI.
        if "openLoops" in doc:
            payload["openLoops"] = doc["openLoops"]
        await collection.insert_one(payload)
        inserted += 1
        try:
            from app.models.conversation import ConversationMemory

            memory = ConversationMemory(
                **{
                    k: payload[k]
                    for k in ConversationMemory.model_fields
                    if k in payload
                }
            )
            await _merge_into_person(memory)
        except Exception:
            pass
    return inserted


def build_prep_briefing(person_id: str, memories: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate past chats into a wearable conversation-prep briefing."""
    mine = [m for m in memories if m.get("personId") == person_id]
    mine.sort(key=lambda m: m.get("date") or "", reverse=True)

    topics: list[str] = []
    facts: list[str] = []
    open_loops: list[str] = []
    starters: list[str] = []
    last_summary = ""
    last_place = ""
    last_tone = ""
    talk_count = len(mine)

    for m in mine:
        for t in m.get("topics") or []:
            if t not in topics:
                topics.append(t)
        for f in m.get("facts") or []:
            if f not in facts:
                facts.append(f)
        for loop in m.get("openLoops") or []:
            if loop not in open_loops:
                open_loops.append(loop)
        if not last_summary and m.get("summary"):
            last_summary = m["summary"]
            last_place = m.get("place") or ""
            last_tone = m.get("emotionalTone") or ""

    if topics:
        starters.append(f"Ask about {topics[0]}")
    if open_loops:
        starters.append(open_loops[0])
    if facts:
        starters.append(f"Remember: {facts[0]}")
    starters.append("Say their name and smile")

    return {
        "personId": person_id,
        "talkCount": talk_count,
        "lastSummary": last_summary,
        "lastPlace": last_place,
        "lastTone": last_tone,
        "topics": topics[:8],
        "facts": facts[:8],
        "openLoops": open_loops[:5],
        "starters": starters[:6],
        "doNotForget": (open_loops[:2] + facts[:2])[:4],
        "safeTopics": topics[:5] or ["family", "how their day is going", "shared memories"],
        "continuityLine": (
            f"You have talked {talk_count} time{'s' if talk_count != 1 else ''} before."
            if talk_count
            else "This may be a new conversation — take it slow."
        ),
    }
