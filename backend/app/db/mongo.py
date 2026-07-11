import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=True)

_client: Optional[AsyncIOMotorClient] = None


def mongo_configured() -> bool:
    uri = (os.getenv("MONGODB_URI") or "").strip()
    if not uri:
        return False
    # Placeholder from .env.example
    if uri.startswith("mongodb+srv://user:password@"):
        return False
    return True


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError(
                "MONGODB_URI is not set. Copy .env.example to .env and fill it in.",
            )
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=4000)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    db_name = os.getenv("MONGODB_DB_NAME", "ar_memory_companion")
    return get_client()[db_name]


def get_people_collection():
    return get_db()["people"]


def get_conversations_collection():
    return get_db()["conversations"]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
