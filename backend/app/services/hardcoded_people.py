"""Ensure the two hackathon demo people always exist in MongoDB.

Includes LinkedIn-style profile facts plus dementia-friendly cues / tips.
"""

from __future__ import annotations

from typing import Any

from app.db.mongo import get_people_collection, mongo_configured

ISHAAN = {
    "personId": "ishaan-chandra",
    "name": "Ishaan Chandra",
    "relationship": "friend",
    "headline": "SWE Intern @ Ericsson | CS, ML & AI @ Carleton",
    "linkedinUrl": "https://www.linkedin.com/in/ishaan-chandra-b9a3ba225",
    "photo": "",
    "photos": [],
    "facts": [
        "Your friend Ishaan Chandra",
        "Software Engineer Intern at Ericsson in Ottawa",
        "Studies Computer Science, Machine Learning and AI at Carleton University",
        "Previously Software Developer at Transport Canada",
        "You often see him when friends get together",
    ],
    "cues": [
        "Ishaan works at Ericsson in Ottawa",
        "Ishaan studies computer science at Carleton",
        "Ishaan used to work at Transport Canada",
        "Say his name: Ishaan",
    ],
    "comfortTips": [
        "Ask Ishaan how his internship is going",
        "Ask what he is learning at Carleton",
        "Tell him you are glad he is here",
    ],
    "conversationHistory": [],
    "spacedRetrievalState": {},
    "descriptor": [],
    "descriptors": [],
}

SANVI = {
    "personId": "sanvi-kaushik",
    "name": "Sanvi Kaushik",
    "relationship": "friend",
    "headline": "SWE Intern @ Ericsson | prev BlackBerry | BEng @ Carleton",
    "linkedinUrl": "https://www.linkedin.com/in/sanvi-705v1",
    "photo": "",
    "photos": [],
    "facts": [
        "Your friend Sanvi Kaushik",
        "Software Developer / SWE Intern at Ericsson in Ottawa",
        "Previously Software Development Intern at BlackBerry",
        "Helped with Technovation at Carleton Faculty of Engineering and Design",
        "Studying Bachelor of Engineering at Carleton University",
    ],
    "cues": [
        "Sanvi works at Ericsson in Ottawa",
        "Sanvi studied engineering at Carleton",
        "Sanvi used to intern at BlackBerry",
        "Say her name: Sanvi",
    ],
    "comfortTips": [
        "Ask Sanvi about Carleton",
        "Ask how her work at Ericsson is going",
        "Tell her it is nice to see her",
    ],
    "conversationHistory": [],
    "spacedRetrievalState": {},
    "descriptor": [],
    "descriptors": [],
}

HARDCODED_PEOPLE: list[dict[str, Any]] = [ISHAAN, SANVI]

PERSON_ID_BY_GENDER = {
    "male": ISHAAN["personId"],
    "female": SANVI["personId"],
}

_PROFILE_FIELDS = (
    "name",
    "relationship",
    "headline",
    "linkedinUrl",
    "facts",
    "cues",
    "comfortTips",
)


async def ensure_hardcoded_people() -> int:
    """Upsert Ishaan + Sanvi care profiles without wiping face data."""
    if not mongo_configured():
        return 0

    collection = get_people_collection()
    inserted = 0
    for person in HARDCODED_PEOPLE:
        existing = await collection.find_one({"personId": person["personId"]})
        profile = {k: person[k] for k in _PROFILE_FIELDS}
        if existing is None:
            by_name = await collection.find_one({"name": person["name"]})
            if by_name is None:
                short = person["name"].split()[0]
                by_name = await collection.find_one({"name": short})
            if by_name is None:
                await collection.insert_one(dict(person))
                inserted += 1
            else:
                await collection.update_one(
                    {"personId": by_name["personId"]},
                    {"$set": {"personId": person["personId"], **profile}},
                )
        else:
            await collection.update_one(
                {"personId": person["personId"]},
                {"$set": profile},
            )
    return inserted
