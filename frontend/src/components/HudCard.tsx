"use client";

import type { Person } from "@/lib/types";

type HudCardProps = {
  person: Person | null;
};

const hasPhoto = (photo: string) =>
  !!photo && !photo.startsWith("data:image/svg");

/** Profile overlay shown when a boy/girl face maps to Ishaan / Sanvi. */
export default function HudCard({ person }: HudCardProps) {
  if (!person) {
    return (
      <aside className="hud-card hud-card--empty">
        <p className="hud-card__hint">No match yet</p>
        <p className="muted">
          Point the camera at a face — boy → Ishaan, girl → Sanvi
        </p>
      </aside>
    );
  }

  const displayFacts = person.facts.filter(
    (f) => !f.toLowerCase().startsWith("linkedin:"),
  );

  return (
    <aside className="hud-card hud-card--profile">
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

      {person.linkedinUrl && (
        <a
          className="hud-card__linkedin"
          href={person.linkedinUrl}
          target="_blank"
          rel="noreferrer"
        >
          View LinkedIn profile
        </a>
      )}

      {displayFacts.length > 0 ? (
        <div className="hud-card__section">
          <h3 className="hud-card__section-title">About</h3>
          <ul>
            {displayFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">No facts yet</p>
      )}

      {person.conversationHistory.length > 0 && (
        <div className="hud-card__section">
          <h3 className="hud-card__section-title">Recent chats</h3>
          <ul className="hud-card__chats">
            {person.conversationHistory.slice(-3).reverse().map((entry) => (
              <li key={entry.sessionId}>
                <span className="hud-card__chat-date">
                  {entry.date.slice(0, 10)}
                </span>
                <span>
                  {entry.summary ||
                    (entry.topics.length > 0
                      ? entry.topics.join(", ")
                      : "Conversation")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
