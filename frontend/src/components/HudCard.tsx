"use client";

import type { Person } from "@/lib/types";

type HudCardProps = {
  person: Person | null;
};

/** Fixed-position profile card overlay shown when a known face is recognized. */
export default function HudCard({ person }: HudCardProps) {
  if (!person) {
    return (
      <aside className="hud-card hud-card--empty">
        <p>No match</p>
        <p className="muted">HUD awaits a known face</p>
      </aside>
    );
  }

  return (
    <aside className="hud-card">
      <h2>{person.name}</h2>
      <p className="relationship">{person.relationship}</p>
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
