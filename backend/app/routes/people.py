import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pymongo import ReturnDocument

from app.db.mongo import get_people_collection
from app.models.person import Person, PersonCreate, PersonUpdate

router = APIRouter(prefix="/people", tags=["people"])


def _doc_to_person(doc: dict[str, Any]) -> Person:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    return Person(**doc)


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
async def create_person(payload: PersonCreate) -> Person:
    collection = get_people_collection()
    person = Person(
        personId=str(uuid.uuid4()),
        name=payload.name,
        relationship=payload.relationship,
        photo=payload.photo,
        facts=payload.facts,
        conversationHistory=payload.conversationHistory,
        spacedRetrievalState=payload.spacedRetrievalState,
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


@router.delete("/{person_id}", status_code=204)
async def delete_person(person_id: str) -> None:
    collection = get_people_collection()
    result = await collection.delete_one({"personId": person_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")
