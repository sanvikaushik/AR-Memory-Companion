"""Serve and list photos from backend/seed for live face photo recall."""

from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/seed", tags=["seed"])

SEED_DIR = Path(__file__).resolve().parents[2] / "seed"
CACHE_DIR = SEED_DIR / ".web_cache"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
WEB_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


class SeedPhoto(BaseModel):
    id: str
    filename: str
    url: str


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
        # Skip cache folder files if any leaked to root.
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
    # Prevent path traversal.
    safe = Path(filename).name
    src = SEED_DIR / safe
    if not src.is_file() or src.suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(status_code=404, detail="Seed photo not found")
    web = _web_path_for(src)
    media = "image/jpeg" if web.suffix.lower() in {".jpg", ".jpeg"} else None
    return FileResponse(web, media_type=media)
