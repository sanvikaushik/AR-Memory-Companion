import math
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from pymongo import ReturnDocument

from app.db.mongo import get_people_collection
from app.models.person import (
    DescriptorAppend,
    Person,
    PersonCreate,
    PersonUpdate,
)

router = APIRouter(prefix="/people", tags=["people"])

# Max L2 distance between 128-d embeddings to treat two faces as the same
# person. Matches the frontend FaceMatcher threshold.
DEDUP_DISTANCE = 0.6
# Cap reference embeddings stored per person.
MAX_DESCRIPTORS = 24


def _doc_to_person(doc: dict[str, Any]) -> Person:
    doc = {k: v for k, v in doc.items() if k != "_id"}
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
    person = Person(
        personId=str(uuid.uuid4()),
        name=payload.name,
        relationship=payload.relationship,
        photo=payload.photo,
        facts=payload.facts,
        conversationHistory=payload.conversationHistory,
        spacedRetrievalState=payload.spacedRetrievalState,
        descriptor=payload.descriptor,
        descriptors=descriptors,
    )
    await collection.insert_one(person.model_dump())
    return person


@router.put("/{person_id}", response_model=Person)
async def update_person(person_id: str, payload: PersonUpdate) -> Person:
    collection = get_people_collection()
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

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


@router.delete("/{person_id}", status_code=204)
async def delete_person(person_id: str) -> None:
    collection = get_people_collection()
    result = await collection.delete_one({"personId": person_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
