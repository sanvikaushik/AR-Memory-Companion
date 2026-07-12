"use client";

import { useEffect, useState } from "react";
import {
  getIndexedSeedPhotos,
  loadSeedPhotoIndex,
  type IndexedSeedPhoto,
} from "@/lib/seedPhotos";
import type { Person } from "@/lib/types";

type PhotoAlbumProps = {
  people: Person[];
  onBack?: () => void;
};

function guessWho(photo: IndexedSeedPhoto, people: Person[]): string {
  // Prefer people who have descriptors that match faces in the photo.
  let bestName = "Look around to find them";
  let best = Number.POSITIVE_INFINITY;
  for (const person of people) {
    const refs = [
      ...(person.descriptors ?? []),
      ...(person.descriptor && person.descriptor.length
        ? [person.descriptor]
        : []),
    ];
    for (const face of photo.descriptors) {
      for (const ref of refs) {
        if (ref.length !== face.length) continue;
        let sum = 0;
        for (let i = 0; i < ref.length; i++) {
          const d = ref[i] - face[i];
          sum += d * d;
        }
        const dist = Math.sqrt(sum);
        if (dist < best && dist < 0.62) {
          best = dist;
          bestName = person.name;
        }
      }
    }
  }
  if (bestName !== "Look around to find them") {
    return `This may be ${bestName}`;
  }
  if (photo.descriptors.length > 0) {
    return "Someone you know may be in this photo";
  }
  return "Look around to find them";
}

/** Calm browser for backend/seed camera-roll photos. */
export default function PhotoAlbum({ people }: PhotoAlbumProps) {
  const [photos, setPhotos] = useState<IndexedSeedPhoto[]>([]);
  const [status, setStatus] = useState("Loading photos…");
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await loadSeedPhotoIndex((done, total) => {
          if (!cancelled) {
            setStatus(
              total === 0
                ? "No photos in backend/seed yet"
                : `Loading photos ${done}/${total}…`,
            );
          }
        });
        if (!cancelled) {
          setPhotos(list.length ? list : getIndexedSeedPhotos());
          setStatus(list.length ? "" : "No photos in backend/seed yet");
        }
      } catch {
        if (!cancelled) setStatus("Could not load seed photos");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status && photos.length === 0) {
    return (
      <section className="mode-panel">
        <h2>Photo memories</h2>
        <p className="mode-panel__lead">{status}</p>
      </section>
    );
  }

  const photo = photos[active];

  if (viewer && photo) {
    return (
      <section className="mode-panel album-viewer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.filename} className="album-viewer__img" />
        <p className="album-viewer__who">{guessWho(photo, people)}</p>
        <div className="album-viewer__nav">
          <button
            type="button"
            className="big-btn"
            disabled={active <= 0}
            onClick={() => setActive((i) => Math.max(0, i - 1))}
          >
            Previous
          </button>
          <button type="button" className="ghost-btn" onClick={() => setViewer(false)}>
            Grid
          </button>
          <button
            type="button"
            className="big-btn"
            disabled={active >= photos.length - 1}
            onClick={() => setActive((i) => Math.min(photos.length - 1, i + 1))}
          >
            Next
          </button>
        </div>
        <p className="muted">
          {active + 1} / {photos.length}
        </p>
      </section>
    );
  }

  return (
    <section className="mode-panel">
      <h2>Photo memories</h2>
      <p className="mode-panel__lead">
        Tap a photo from your camera roll. Take your time.
      </p>
      <div className="album-grid">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="album-grid__item"
            onClick={() => {
              setActive(i);
              setViewer(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.filename} />
          </button>
        ))}
      </div>
    </section>
  );
}
