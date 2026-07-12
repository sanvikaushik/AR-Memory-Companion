import math
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from pymongo import ReturnDocument

from app.db.mongo import get_people_collection
from app.models.person import (
    DescriptorAppend,
    FaceAssign,
    Person,
    PersonCreate,
    PersonUpdate,
    PhotoAppend,
)
from app.services.hardcoded_people import (
    ISHAAN,
    PERSON_ID_BY_GENDER,
    SANVI,
    ensure_hardcoded_people,
)

router = APIRouter(prefix="/people", tags=["people"])

# Max L2 distance between 128-d embeddings to treat two faces as the same
# person. Matches the frontend FaceMatcher threshold.
DEDUP_DISTANCE = 0.6
# Cap reference embeddings stored per person (multiple angles / lighting).
MAX_DESCRIPTORS = 48
# Cap camera-roll / enrollment photos stored per person.
MAX_PHOTOS = 24


def _normalize_photos(photo: str, photos: list[str] | None) -> tuple[str, list[str]]:
    """Ensure photos[] includes primary photo; primary defaults to first photo."""
    gallery = [p for p in (photos or []) if p]
    if photo and photo not in gallery:
        gallery.insert(0, photo)
    gallery = gallery[:MAX_PHOTOS]
    primary = photo or (gallery[0] if gallery else "")
    return primary, gallery


def _doc_to_person(doc: dict[str, Any]) -> Person:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    primary, gallery = _normalize_photos(
        str(doc.get("photo") or ""),
        list(doc.get("photos") or []),
    )
    doc["photo"] = primary
    doc["photos"] = gallery
    return Person(**doc)


def _euclidean(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return math.inf
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _person_descriptors(person: Person) -> list[list[float]]:
    refs = list(person.descriptors)
    if person.descriptor:
        refs.append(person.descriptor)
    return refs


async def _find_duplicate(descriptor: list[float]) -> Person | None:
    """Return an existing person whose face matches this descriptor, if any."""
    if not descriptor:
        return None
    collection = get_people_collection()
    best: Person | None = None
    best_distance = DEDUP_DISTANCE
    async for doc in collection.find({}):
        person = _doc_to_person(doc)
        for ref in _person_descriptors(person):
            distance = _euclidean(descriptor, ref)
            if distance < best_distance:
                best_distance = distance
                best = person
    return best


@router.get("", response_model=list[Person])
async def list_people() -> list[Person]:
    collection = get_people_collection()
    cursor = collection.find({})
    people: list[Person] = []
    async for doc in cursor:
        people.append(_doc_to_person(doc))
    return people


@router.get("/{person_id}", response_model=Person)
async def get_person(person_id: str) -> Person:
    collection = get_people_collection()
    doc = await collection.find_one({"personId": person_id})
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    return _doc_to_person(doc)


@router.post("", response_model=Person, status_code=201)
async def create_person(payload: PersonCreate, response: Response) -> Person:
    collection = get_people_collection()

    # Dedup safety net: if this face already matches an enrolled person,
    # return the existing record instead of creating a duplicate.
    existing = await _find_duplicate(payload.descriptor)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return existing

    descriptors = payload.descriptors[:MAX_DESCRIPTORS]
    photo, photos = _normalize_photos(payload.photo, payload.photos)
    person = Person(
        personId=str(uuid.uuid4()),
        name=payload.name,
        relationship=payload.relationship,
        headline=payload.headline,
        linkedinUrl=payload.linkedinUrl,
        photo=photo,
        photos=photos,
        facts=payload.facts,
        cues=payload.cues,
        comfortTips=payload.comfortTips,
        conversationHistory=payload.conversationHistory,
        spacedRetrievalState=payload.spacedRetrievalState,
        descriptor=payload.descriptor,
        descriptors=descriptors,
    )
    await collection.insert_one(person.model_dump())
    return person


@router.post("/hardcoded/{gender}", response_model=Person)
async def assign_hardcoded_face(gender: str, payload: FaceAssign) -> Person:
    """
    Hackathon shortcut: boy → Ishaan, girl → Sanvi.
    Upserts the fixed person and attaches the live face photo + descriptors.
    """
    key = gender.strip().lower()
    if key in ("boy", "man", "male"):
        slot = "male"
    elif key in ("girl", "woman", "female"):
        slot = "female"
    else:
        raise HTTPException(
            status_code=400,
            detail="gender must be male/female (or boy/girl)",
        )

    await ensure_hardcoded_people()
    template = ISHAAN if slot == "male" else SANVI
    person_id = PERSON_ID_BY_GENDER[slot]
    collection = get_people_collection()
    doc = await collection.find_one({"personId": person_id})
    if doc is None:
        doc = dict(template)
        await collection.insert_one(doc)

    samples = [d for d in payload.descriptors if d][:MAX_DESCRIPTORS]
    if payload.descriptor and payload.descriptor not in samples:
        samples.insert(0, payload.descriptor)
    primary_desc = samples[0] if samples else list(doc.get("descriptor") or [])

    existing_descriptors = list(doc.get("descriptors") or [])
    for sample in samples:
        if sample not in existing_descriptors:
            existing_descriptors.append(sample)
    existing_descriptors = existing_descriptors[-MAX_DESCRIPTORS:]

    photo, photos = _normalize_photos(
        payload.photo or str(doc.get("photo") or ""),
        list(doc.get("photos") or []),
    )

    result = await collection.find_one_and_update(
        {"personId": person_id},
        {
            "$set": {
                "name": template["name"],
                "relationship": template["relationship"],
                "headline": template.get("headline", ""),
                "linkedinUrl": template.get("linkedinUrl", ""),
                "facts": template.get("facts", []),
                "cues": template.get("cues", []),
                "comfortTips": template.get("comfortTips", []),
                "photo": photo,
                "photos": photos,
                "descriptor": primary_desc,
                "descriptors": existing_descriptors,
            }
        },
        return_document=ReturnDocument.AFTER,
        upsert=True,
    )
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to assign face")
    return _doc_to_person(result)


@router.put("/{person_id}", response_model=Person)
async def update_person(person_id: str, payload: PersonUpdate) -> Person:
    collection = get_people_collection()
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "photo" in updates or "photos" in updates:
        doc = await collection.find_one({"personId": person_id})
        if doc is None:
            raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
        primary, gallery = _normalize_photos(
            str(updates.get("photo", doc.get("photo") or "")),
            list(updates.get("photos", doc.get("photos") or [])),
        )
        updates["photo"] = primary
        updates["photos"] = gallery

    result = await collection.find_one_and_update(
        {"personId": person_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    return _doc_to_person(result)


@router.post("/{person_id}/descriptors", response_model=Person)
async def append_descriptor(person_id: str, payload: DescriptorAppend) -> Person:
    """Add a learned reference embedding (new angle) to a person, capped."""
    if not payload.descriptor:
        raise HTTPException(status_code=400, detail="Empty descriptor")

    collection = get_people_collection()
    result = await collection.find_one_and_update(
        {"personId": person_id},
        {
            "$push": {
                "descriptors": {
                    "$each": [payload.descriptor],
                    "$slice": -MAX_DESCRIPTORS,
                }
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    return _doc_to_person(result)


@router.post("/{person_id}/photos", response_model=Person)
async def append_photo(person_id: str, payload: PhotoAppend) -> Person:
    """Append a camera-roll photo; optionally learn a face descriptor from it."""
    if not payload.photo:
        raise HTTPException(status_code=400, detail="Empty photo")

    collection = get_people_collection()
    doc = await collection.find_one({"personId": person_id})
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    primary, gallery = _normalize_photos(
        str(doc.get("photo") or ""),
        list(doc.get("photos") or []),
    )
    if payload.photo not in gallery:
        gallery.append(payload.photo)
    gallery = gallery[-MAX_PHOTOS:]
    if not primary:
        primary = payload.photo

    updates: dict[str, Any] = {"photo": primary, "photos": gallery}
    if payload.descriptor:
        descriptors = list(doc.get("descriptors") or [])
        descriptors.append(payload.descriptor)
        updates["descriptors"] = descriptors[-MAX_DESCRIPTORS:]
        if not doc.get("descriptor"):
            updates["descriptor"] = payload.descriptor

    result = await collection.find_one_and_update(
        {"personId": person_id},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
    return _doc_to_person(result)


@router.delete("/{person_id}", status_code=204)
async def delete_person(person_id: str) -> None:
    collection = get_people_collection()
    result = await collection.delete_one({"personId": person_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
