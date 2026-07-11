"""
Seed MongoDB people from backend/seed/people.json + photo files.

Usage (from backend/, venv active, .env with MONGODB_URI set):

    python -m scripts.seed_people

Re-running upserts by name (updates photo/facts if the name already exists).
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")

SEED_DIR = BACKEND_ROOT / "seed"
PEOPLE_JSON = SEED_DIR / "people.json"


def photo_to_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if not mime or not mime.startswith("image/"):
        mime = "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def main() -> None:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise SystemExit("MONGODB_URI is not set in backend/.env")

    db_name = os.getenv("MONGODB_DB_NAME", "ar_memory_companion")

    if not PEOPLE_JSON.exists():
        raise SystemExit(f"Missing {PEOPLE_JSON}")

    entries = json.loads(PEOPLE_JSON.read_text())
    if not isinstance(entries, list) or not entries:
        raise SystemExit("people.json must be a non-empty list")

    client = MongoClient(uri)
    collection = client[db_name]["people"]
    seeded = 0

    try:
        for entry in entries:
            name = entry["name"].strip()
            relationship = entry["relationship"].strip()
            facts = entry.get("facts") or []
            photo_file = entry["photoFile"]
            photo_path = SEED_DIR / photo_file

            if not photo_path.exists():
                raise SystemExit(
                    f"Photo not found: {photo_path}\n"
                    f"Add the file to backend/seed/ and retry."
                )

            photo = photo_to_data_url(photo_path)
            existing = collection.find_one({"name": name})

            if existing:
                collection.update_one(
                    {"personId": existing["personId"]},
                    {
                        "$set": {
                            "relationship": relationship,
                            "photo": photo,
                            "facts": facts,
                        }
                    },
                )
                print(f"updated: {name} ({existing['personId']})")
            else:
                doc = {
                    "personId": str(uuid.uuid4()),
                    "name": name,
                    "relationship": relationship,
                    "photo": photo,
                    "facts": facts,
                    "conversationHistory": [],
                    "spacedRetrievalState": {},
                }
                collection.insert_one(doc)
                print(f"created: {name} ({doc['personId']})")

            seeded += 1
    finally:
        client.close()

    print(f"done — {seeded} people in seed file are in MongoDB")
    print("Reload the frontend so it re-indexes faces from GET /api/people")


if __name__ == "__main__":
    main()
