"use client";

import { useEffect, useState } from "react";
import type { Person } from "@/lib/types";

type QuizScreenProps = {
  person: Person;
  onDone?: () => void;
};

type Phase = "look" | "think" | "reveal";

/** Hands-free name practice — timed reveal, no typing. */
export default function QuizScreen({ person, onDone }: QuizScreenProps) {
  const [phase, setPhase] = useState<Phase>("look");
  const [round, setRound] = useState(0);

  const photoUrl =
    person.photo && !person.photo.startsWith("data:image/svg")
      ? person.photo
      : person.photos?.[0] ?? "";

  useEffect(() => {
    setPhase("look");
    const thinkId = window.setTimeout(() => setPhase("think"), 2500);
    const revealId = window.setTimeout(() => setPhase("reveal"), 5500);
    const nextId = window.setTimeout(() => {
      setRound((r) => {
        const n = r + 1;
        if (n >= 3) {
          window.setTimeout(() => onDone?.(), 0);
          return 0;
        }
        return n;
      });
    }, 9000);
    return () => {
      window.clearTimeout(thinkId);
      window.clearTimeout(revealId);
      window.clearTimeout(nextId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cycle on round/person only
  }, [round, person.personId]);

  return (
    <section className="mode-panel quiz-screen">
      <h2>Remember their name</h2>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Who is this?" className="quiz-photo" />
      ) : (
        <p className="muted">Photo loading…</p>
      )}

      {phase === "look" && (
        <p className="game-board__prompt">Look carefully…</p>
      )}
      {phase === "think" && (
        <p className="game-board__prompt">Who is this person?</p>
      )}
      {phase === "reveal" && (
        <p className="quiz-result quiz-result--ok">
          This is <strong>{person.name}</strong>
        </p>
      )}
      <p className="muted">Runs automatically — point at Live when you want to leave</p>
    </section>
  );
}
