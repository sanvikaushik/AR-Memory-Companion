"use client";

import { useEffect, useMemo, useState } from "react";
import { useVoiceGreeting } from "@/hooks/useVoiceGreeting";
import type { Person } from "@/lib/types";

type HudCardProps = {
  person: Person | null;
  present?: Person[];
  calm?: boolean;
  voiceEnabled?: boolean;
};

const hasPhoto = (photo: string) =>
  !!photo && !photo.startsWith("data:image/svg");

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

/** Large dementia-friendly profile overlay. */
export default function HudCard({
  person,
  present = [],
  calm = false,
  voiceEnabled = true,
}: HudCardProps) {
  const [cueIndex, setCueIndex] = useState(0);
  useVoiceGreeting(person?.name, voiceEnabled && !!person);

  const cues = useMemo(() => {
    if (!person) return [];
    const fromCues = person.cues ?? [];
    const fromFacts = person.facts.filter(
      (f) => !f.toLowerCase().startsWith("linkedin:"),
    );
    const fromChat = person.conversationHistory
      .slice(-2)
      .map((c) => c.summary)
      .filter(Boolean) as string[];
    return [...fromCues, ...fromFacts, ...fromChat];
  }, [person]);

  useEffect(() => {
    setCueIndex(0);
    if (cues.length <= 1) return;
    const id = window.setInterval(() => {
      setCueIndex((i) => (i + 1) % cues.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [cues]);

  if (!person) {
    return (
      <aside className={`hud-card hud-card--empty ${calm ? "hud-card--calm" : ""}`}>
        <p className="hud-card__hint">Looking for friends…</p>
        <p className="muted">When someone appears, their name will show here</p>
      </aside>
    );
  }

  const displayFacts = person.facts.filter(
    (f) => !f.toLowerCase().startsWith("linkedin:"),
  );
  const cue = cues[cueIndex] ?? displayFacts[0] ?? "You know this person";

  return (
    <aside className={`hud-card hud-card--profile ${calm ? "hud-card--calm" : ""}`}>
      <p className="hud-card__eyebrow">This is</p>
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
          {person.headline ? (
            <p className="hud-card__headline">{person.headline}</p>
          ) : (
            <p className="relationship">{person.relationship}</p>
          )}
        </div>
      </div>

      <p className="hud-card__coach">
        Say their name: <strong>{firstName(person.name)}</strong>
      </p>

      <div className="hud-card__cue" key={cue}>
        {cue}
      </div>

      {present.length > 0 && (
        <div className="hud-card__presence">
          <span className="hud-card__section-title">With you now</span>
          <div className="presence-chips">
            {present.map((p) => (
              <span key={p.personId} className="presence-chip">
                {firstName(p.name)}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
