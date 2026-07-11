"use client";

import type { Person } from "@/lib/types";

type HudCardProps = {
  person: Person | null;
};

const hasPhoto = (photo: string) =>
  !!photo && !photo.startsWith("data:image/svg");

/** Profile overlay shown when a known face is recognized. */
export default function HudCard({ person }: HudCardProps) {
  if (!person) {
    return (
      <aside className="hud-card hud-card--empty">
        <p className="hud-card__hint">No match yet</p>
        <p className="muted">A profile appears when a saved face is recognized</p>
      </aside>
    );
  }

  return (
    <aside className="hud-card">
      <div className="hud-card__head">
        {hasPhoto(person.photo) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo} alt={person.name} className="hud-card__avatar" />
        ) : (
          <div className="hud-card__avatar hud-card__avatar--placeholder">
            {person.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="hud-card__title">
          <h2>{person.name}</h2>
          <p className="relationship">{person.relationship}</p>
        </div>
      </div>
      {person.facts.length > 0 ? (
        <ul>
          {person.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No facts yet</p>
      )}
    </aside>
  );
}
