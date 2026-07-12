"use client";

import { useEffect, useMemo, useState } from "react";
import type { Person } from "@/lib/types";

type FlashcardsProps = {
  people: Person[];
  activePerson: Person | null;
};

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

/** Hands-free flashcards — auto flip and advance. */
export default function Flashcards({ people, activePerson }: FlashcardsProps) {
  const pool = people.length
    ? people
    : ([
        {
          personId: "ishaan-chandra",
          name: "Ishaan Chandra",
          facts: [
            "Ishaan always remembers to bring you a snack",
            "Ishaan’s favorite drink is hot chocolate",
          ],
        },
        {
          personId: "sanvi-kaushik",
          name: "Sanvi Kaushik",
          facts: [
            "Sanvi makes playlists for car rides",
            "Sanvi’s favorite dessert is mango ice cream",
          ],
        },
      ] as Person[]);

  const [personIdx, setPersonIdx] = useState(0);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!activePerson?.personId) return;
    const i = people.findIndex((p) => p.personId === activePerson.personId);
    if (i >= 0) setPersonIdx(i);
  }, [activePerson?.personId, people]);

  const person = pool[personIdx % pool.length] ?? null;

  const cards = useMemo(() => {
    if (!person) return [];
    const out: { q: string; a: string }[] = [];
    for (const f of person.facts ?? []) {
      out.push({
        q: `What do you remember about ${firstName(person.name)}?`,
        a: f,
      });
    }
    for (const c of person.cues ?? []) {
      out.push({ q: c, a: person.name });
    }
    if (out.length === 0) {
      out.push({
        q: `Who is your friend?`,
        a: person.name,
      });
    }
    return out;
  }, [person]);

  // Auto: show prompt → flip → next card → rotate person.
  useEffect(() => {
    if (cards.length === 0) return;
    setFlipped(false);
    const flipId = window.setTimeout(() => setFlipped(true), 3500);
    const nextId = window.setTimeout(() => {
      setFlipped(false);
      setIdx((i) => {
        const next = i + 1;
        if (next % cards.length === 0) {
          setPersonIdx((p) => p + 1);
        }
        return next;
      });
    }, 7000);
    return () => {
      window.clearTimeout(flipId);
      window.clearTimeout(nextId);
    };
  }, [idx, cards.length, personIdx]);

  if (!person) {
    return (
      <section className="mode-panel">
        <h2>Flashcards</h2>
        <p className="mode-panel__lead">Waiting for friend profiles…</p>
      </section>
    );
  }

  const card = cards[idx % cards.length] ?? null;

  return (
    <section className="mode-panel">
      <h2>Flashcards</h2>
      <p className="mode-panel__lead">
        About {firstName(person.name)} — cards flip by themselves
      </p>

      <div className="prep-person-picker">
        {pool.map((p, i) => (
          <span
            key={p.personId}
            className={`chip-btn ${i === personIdx % pool.length ? "chip-btn--active" : ""}`}
          >
            {firstName(p.name)}
          </span>
        ))}
      </div>

      {card && (
        <div className="flash-stage">
          <div
            className={`flash-card ${flipped ? "flash-card--flipped" : ""}`}
          >
            <span className="flash-card__label">
              {flipped ? "Answer" : "Prompt"}
            </span>
            <p>{flipped ? card.a : card.q}</p>
            <span className="muted">Watching — no tap needed</span>
          </div>
        </div>
      )}
    </section>
  );
}
