"use client";

import { useEffect, useState } from "react";
import type { SeedPhotoHit } from "@/lib/seedPhotos";

type SeedPhotoSlideshowProps = {
  hits: SeedPhotoHit[];
  /** Face oval position in % of the camera feed. */
  faceLeft: number;
  faceTop: number;
  faceHeight: number;
  personName: string;
};

const SLIDE_MS = 2800;

/** Cycles matching seed photos one at a time, to the left of the face. */
export default function SeedPhotoSlideshow({
  hits,
  faceLeft,
  faceTop,
  faceHeight,
  personName,
}: SeedPhotoSlideshowProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [hits.map((h) => h.id).join("|")]);

  useEffect(() => {
    if (hits.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % hits.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [hits.length, hits.map((h) => h.id).join("|")]);

  if (hits.length === 0) return null;

  const hit = hits[Math.min(index, hits.length - 1)];

  return (
    <div
      className="seed-slideshow"
      style={{
        left: `${Math.max(0, faceLeft)}%`,
        top: `${faceTop + faceHeight / 2}%`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={hit.id}
        src={hit.url}
        alt={`${personName} — ${hit.filename}`}
        className="seed-slideshow__img"
      />
      <div className="seed-slideshow__meta">
        <span>{personName}</span>
        <span>
          {index + 1} / {hits.length}
        </span>
      </div>
    </div>
  );
}
