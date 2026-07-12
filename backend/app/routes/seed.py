"""Serve and list photos from backend/seed for live face photo recall."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/seed", tags=["seed"])

SEED_DIR = Path(__file__).resolve().parents[2] / "seed"
CACHE_DIR = SEED_DIR / ".web_cache"
CACHE_WHO_DIR = SEED_DIR / "Cache_who"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
WEB_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


class SeedPhoto(BaseModel):
    id: str
    filename: str
    url: str


class CacheWhoProfile(BaseModel):
    personId: str
    name: str
    fullName: str = ""
    image: str
    imageUrl: str
    gender: str = ""
    relationship: str = ""
    headline: str = ""
    appearance: dict[str, Any] = Field(default_factory=dict)
    facts: list[str] = Field(default_factory=list)
    cues: list[str] = Field(default_factory=list)


def _ensure_cache() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _web_path_for(src: Path) -> Path:
    """Return a browser-friendly path (convert HEIC → JPEG in cache)."""
    suffix = src.suffix.lower()
    if suffix in WEB_EXTS:
        return src
    if suffix not in {".heic", ".heif"}:
        raise HTTPException(status_code=415, detail=f"Unsupported type: {suffix}")

    _ensure_cache()
    digest = hashlib.sha1(f"{src.name}:{src.stat().st_mtime_ns}".encode()).hexdigest()[:12]
    out = CACHE_DIR / f"{src.stem}_{digest}.jpg"
    if out.is_file():
        return out

    try:
        from pillow_heif import register_heif_opener
        from PIL import Image

        register_heif_opener()
        with Image.open(src) as img:
            rgb = img.convert("RGB")
            rgb.thumbnail((1280, 1280))
            rgb.save(out, format="JPEG", quality=85)
    except Exception as err:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to convert {src.name}: {err}",
        ) from err
    return out


@router.get("/photos", response_model=list[SeedPhoto])
async def list_seed_photos() -> list[SeedPhoto]:
    if not SEED_DIR.is_dir():
        return []

    photos: list[SeedPhoto] = []
    for path in sorted(SEED_DIR.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTS:
            continue
        if path.name.startswith("."):
            continue
        photos.append(
            SeedPhoto(
                id=path.stem,
                filename=path.name,
                url=f"/api/seed/file/{path.name}",
            )
        )
    return photos


@router.get("/file/{filename}")
async def get_seed_file(filename: str):
    safe = Path(filename).name
    src = SEED_DIR / safe
    if not src.is_file() or src.suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(status_code=404, detail="Seed photo not found")
    web = _web_path_for(src)
    media = "image/jpeg" if web.suffix.lower() in {".jpg", ".jpeg"} else None
    return FileResponse(web, media_type=media)


@router.get("/cache-who", response_model=list[CacheWhoProfile])
async def list_cache_who() -> list[CacheWhoProfile]:
    """Identity cache: JSON profiles + linked photos under seed/Cache_who."""
    if not CACHE_WHO_DIR.is_dir():
        return []

    profiles: list[CacheWhoProfile] = []
    for path in sorted(CACHE_WHO_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        image = str(data.get("image") or "")
        if not image:
            continue
        image_path = CACHE_WHO_DIR / Path(image).name
        if not image_path.is_file():
            continue
        profiles.append(
            CacheWhoProfile(
                personId=str(data.get("personId") or path.stem),
                name=str(data.get("name") or path.stem),
                fullName=str(data.get("fullName") or data.get("name") or path.stem),
                image=image_path.name,
                imageUrl=f"/api/seed/cache-who/file/{image_path.name}",
                gender=str(data.get("gender") or ""),
                relationship=str(data.get("relationship") or ""),
                headline=str(data.get("headline") or ""),
                appearance=data.get("appearance") or {},
                facts=list(data.get("facts") or []),
                cues=list(data.get("cues") or []),
            )
        )
    return profiles


@router.get("/cache-who/file/{filename}")
async def get_cache_who_file(filename: str):
    safe = Path(filename).name
    src = CACHE_WHO_DIR / safe
    if not src.is_file() or src.suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(status_code=404, detail="Cache_who photo not found")
    web = _web_path_for(src)
    media = "image/jpeg" if web.suffix.lower() in {".jpg", ".jpeg"} else None
    return FileResponse(web, media_type=media)
