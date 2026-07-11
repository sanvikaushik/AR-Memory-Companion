"use client";

import { useState } from "react";
import type { Person } from "@/lib/types";

type QuizScreenProps = {
  person: Person;
  onDone?: () => void;
};

type Phase = "prompt" | "guess" | "reveal";

/**
 * Spaced retrieval quiz: show photo → guess name → reveal.
 * spacedRetrievalState updates will live here later.
 */
export default function QuizScreen({ person, onDone }: QuizScreenProps) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [guess, setGuess] = useState("");

  return (
    <section className="quiz-screen">
      <h2>Spaced retrieval</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={person.photo} alt="Who is this?" className="quiz-photo" />

      {phase === "prompt" && (
        <>
          <p>Who is this person?</p>
          <button type="button" onClick={() => setPhase("guess")}>
            I&apos;m ready to guess
          </button>
        </>
      )}

      {phase === "guess" && (
        <>
          <label>
            Your guess
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Name"
            />
          </label>
          <button type="button" onClick={() => setPhase("reveal")}>
            Reveal
          </button>
        </>
      )}

      {phase === "reveal" && (
        <>
          <p>
            <strong>{person.name}</strong> — {person.relationship}
          </p>
          <p className="muted">
            You guessed: {guess.trim() || "(blank)"}
          </p>
          <button type="button" onClick={onDone}>
            Done
          </button>
        </>
      )}
    </section>
  );
}
