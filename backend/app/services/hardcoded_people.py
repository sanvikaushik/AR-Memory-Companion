"""Ensure the two hackathon demo people always exist in MongoDB.

Profile facts are sourced from public LinkedIn headlines / roles and stored
on the person document so the HUD can show who they are.
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
        "Software Engineer Intern at Ericsson (Ottawa)",
        "Studies Computer Science, Machine Learning and AI at Carleton University",
        "Previously Software Developer at Transport Canada",
        "Based in Ottawa, Ontario",
        "LinkedIn: https://www.linkedin.com/in/ishaan-chandra-b9a3ba225",
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
        "Software Developer / SWE Intern at Ericsson (Ottawa)",
        "Previously Software Development Intern at BlackBerry",
        "Technovation Program Assistant at Carleton Faculty of Engineering and Design",
        "Bachelor of Engineering (BEng) at Carleton University",
        "Based in Ottawa, Ontario",
        "LinkedIn: https://www.linkedin.com/in/sanvi-705v1",
    ],
    "conversationHistory": [],
    "spacedRetrievalState": {},
    "descriptor": [],
    "descriptors": [],
}

HARDCODED_PEOPLE: list[dict[str, Any]] = [ISHAAN, SANVI]

# Stable IDs used by the frontend gender → person mapping.
PERSON_ID_BY_GENDER = {
    "male": ISHAAN["personId"],
    "female": SANVI["personId"],
}

# Profile fields we refresh from LinkedIn seed without wiping face data.
_PROFILE_FIELDS = (
    "name",
    "relationship",
    "headline",
    "linkedinUrl",
    "facts",
)


async def ensure_hardcoded_people() -> int:
    """
    Upsert Ishaan Chandra + Sanvi Kaushik with LinkedIn profile facts.
    Does not wipe enrolled photos / descriptors.
    Returns how many documents were inserted (0–2).
    """
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
                # Also catch short-name leftovers ("Ishaan" / "Sanvi").
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
