"use client";

import { useEffect, useState } from "react";
import type { Person } from "@/lib/types";

type PhotoAlbumProps = {
  people: Person[];
};

/** Hands-free photo memories — slow auto slideshow. */
export default function PhotoAlbum({ people }: PhotoAlbumProps) {
  const photos = people.flatMap((p) =>
    (p.photos?.length ? p.photos : p.photo ? [p.photo] : []).map((url) => ({
      url,
      name: p.name,
      fact: p.facts?.[0] ?? p.headline ?? "",
    })),
  );

  const [active, setActive] = useState(0);

  useEffect(() => {
    if (photos.length === 0) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % photos.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [photos.length]);

  if (photos.length === 0) {
    return (
      <section className="mode-panel">
        <h2>Photo memories</h2>
        <p className="mode-panel__lead">
          Cache_who photos will appear here when profiles load.
        </p>
      </section>
    );
  }

  const photo = photos[active % photos.length];

  return (
    <section className="mode-panel album-viewer">
      <h2>Photo memories</h2>
      <p className="mode-panel__lead">Slideshow plays on its own</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.name}
        className="album-viewer__img"
      />
      <p className="album-caption">
        <strong>{photo.name}</strong>
        {photo.fact ? ` — ${photo.fact}` : ""}
      </p>
      <p className="muted">
        {active + 1} / {photos.length}
      </p>
    </section>
  );
}
