"use client";

import { useEffect, useMemo, useState } from "react";
import { listConversations } from "@/lib/api";
import type { ConversationMemory, Person } from "@/lib/types";

type FlashcardsProps = {
  people: Person[];
  activePerson: Person | null;
};

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

/** Simple memory flashcards from past chats and profile facts. */
export default function Flashcards({ people, activePerson }: FlashcardsProps) {
  const pool = people.length
    ? people
    : ([
        { personId: "ishaan-chandra", name: "Ishaan Chandra", facts: [] },
        { personId: "sanvi-kaushik", name: "Sanvi Kaushik", facts: [] },
      ] as Person[]);

  const [selectedId, setSelectedId] = useState(
    activePerson?.personId ?? pool[0]?.personId ?? "",
  );
  const [memories, setMemories] = useState<ConversationMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (activePerson?.personId) setSelectedId(activePerson.personId);
  }, [activePerson?.personId]);

  const person = useMemo(
    () => pool.find((p) => p.personId === selectedId) ?? pool[0] ?? null,
    [pool, selectedId],
  );

  useEffect(() => {
    if (!person?.personId) return;
    let cancelled = false;
    setLoading(true);
    void listConversations(person.personId)
      .then((list) => {
        if (!cancelled) {
          setMemories(list);
          setIdx(0);
          setFlipped(false);
        }
      })
      .catch(() => {
        if (!cancelled) setMemories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [person?.personId]);

  const cards = useMemo(() => {
    const out: { q: string; a: string }[] = [];
    for (const m of memories) {
      for (const cue of m.cues ?? []) {
        out.push({ q: cue, a: m.summary || m.facts[0] || person?.name || "" });
      }
      for (const fact of m.facts ?? []) {
        out.push({
          q: `What do you remember about ${firstName(person?.name ?? "")}?`,
          a: fact,
        });
      }
    }
    if (out.length === 0 && person) {
      for (const f of person.facts?.slice(0, 6) ?? []) {
        if (f.toLowerCase().startsWith("linkedin:")) continue;
        out.push({
          q: `What do you know about ${firstName(person.name)}?`,
          a: f,
        });
      }
    }
    return out;
  }, [memories, person]);

  if (!person) {
    return (
      <section className="mode-panel">
        <h2>Flashcards</h2>
        <p className="mode-panel__lead">Waiting for friend profiles…</p>
      </section>
    );
  }

  const card = cards.length > 0 ? cards[idx % cards.length] : null;

  return (
    <section className="mode-panel">
      <h2>Flashcards</h2>
      <p className="mode-panel__lead">
        Tap a card to flip. Practice remembering {firstName(person.name)}.
      </p>

      <div className="prep-person-picker">
        {pool.map((p) => (
          <button
            key={p.personId}
            type="button"
            className={`chip-btn ${p.personId === person.personId ? "chip-btn--active" : ""}`}
            onClick={() => setSelectedId(p.personId)}
          >
            {firstName(p.name)}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && !card && (
        <p className="muted">No cards yet for this person.</p>
      )}

      {card && (
        <div className="flash-stage">
          <button
            type="button"
            className={`flash-card ${flipped ? "flash-card--flipped" : ""}`}
            onClick={() => setFlipped((f) => !f)}
          >
            <span className="flash-card__label">
              {flipped ? "Answer" : "Prompt"}
            </span>
            <p>{flipped ? card.a : card.q}</p>
            <span className="muted">Tap to flip</span>
          </button>
          <button
            type="button"
            className="big-btn"
            onClick={() => {
              setFlipped(false);
              setIdx((i) => i + 1);
            }}
          >
            Next card
          </button>
        </div>
      )}
    </section>
  );
}
