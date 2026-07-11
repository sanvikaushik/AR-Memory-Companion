"""Verify the MongoDB connection and (optionally) seed a sample person.

Usage (from backend/, venv activated):

    python seed.py            # ping the cluster + list people
    python seed.py --seed     # also insert a sample person if none exist
    python seed.py --reset    # delete all people, then seed one

Reads MONGODB_URI / MONGODB_DB_NAME from backend/.env.
"""

import argparse
import asyncio
import sys
import uuid

from app.db.mongo import close_client, get_client, get_people_collection


SAMPLE_PERSON = {
    "personId": str(uuid.uuid4()),
    "name": "Grace Ramirez",
    "relationship": "daughter",
    "photo": "",
    "facts": [
        "Lives in Austin, TX",
        "Loves gardening and jazz",
        "Has two kids: Mia and Leo",
    ],
    "conversationHistory": [],
    "spacedRetrievalState": {},
    "descriptor": [],
}


async def main(do_seed: bool, do_reset: bool) -> int:
    client = get_client()
    try:
        # Force a round-trip so we fail fast on a bad URI / network / auth.
        await client.admin.command("ping")
        print("MongoDB connection OK")
    except Exception as err:  # noqa: BLE001
        print(f"MongoDB connection FAILED: {err}")
        print(
            "Check MONGODB_URI in backend/.env, the DB user's password, and that "
            "Network Access allows your IP (0.0.0.0/0 for a hackathon)."
        )
        return 1

    people = get_people_collection()

    if do_reset:
        deleted = (await people.delete_many({})).deleted_count
        print(f"Reset: deleted {deleted} person(s)")

    count = await people.count_documents({})
    if (do_seed or do_reset) and count == 0:
        await people.insert_one(dict(SAMPLE_PERSON))
        print(f"Seeded sample person: {SAMPLE_PERSON['name']}")
        count = await people.count_documents({})

    print(f"people collection now has {count} document(s):")
    async for doc in people.find({}, {"_id": 0, "personId": 1, "name": 1}):
        print(f"  - {doc.get('name')} ({doc.get('personId')})")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify/seed MongoDB.")
    parser.add_argument("--seed", action="store_true", help="Insert a sample person if empty.")
    parser.add_argument("--reset", action="store_true", help="Delete all people, then seed one.")
    args = parser.parse_args()

    try:
        exit_code = asyncio.run(main(args.seed, args.reset))
    finally:
        asyncio.run(close_client())
    sys.exit(exit_code)
