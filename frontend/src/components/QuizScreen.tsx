"use client";

import { useEffect, useState } from "react";
import {
  getIndexedSeedPhotos,
  loadSeedPhotoIndex,
} from "@/lib/seedPhotos";
import type { Person } from "@/lib/types";

type QuizScreenProps = {
  person: Person;
  onDone?: () => void;
};

type Phase = "prompt" | "guess" | "reveal";

/**
 * Spaced retrieval quiz: show photo → guess name → reveal.
 * Falls back to seed camera-roll photos when person.photo is empty.
 */
export default function QuizScreen({ person, onDone }: QuizScreenProps) {
  const [phase, setPhase] = useState<Phase>("prompt");
  const [guess, setGuess] = useState("");
  const [photoUrl, setPhotoUrl] = useState(person.photo || "");

  useEffect(() => {
    if (person.photo && !person.photo.startsWith("data:image/svg")) {
      setPhotoUrl(person.photo);
      return;
    }
    void loadSeedPhotoIndex().then(() => {
      const hits = getIndexedSeedPhotos().filter((p) => p.descriptors.length > 0);
      if (hits.length > 0) {
        setPhotoUrl(hits[Math.floor(Math.random() * hits.length)].url);
      }
    });
  }, [person.photo]);

  const first = person.name.split(" ")[0];
  const ok =
    guess.trim().toLowerCase() === person.name.toLowerCase() ||
    guess.trim().toLowerCase() === first.toLowerCase();

  return (
    <section className="mode-panel quiz-screen">
      <h2>Remember their name</h2>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Who is this?" className="quiz-photo" />
      ) : (
        <p className="muted">No photo yet — you can still practice the name.</p>
      )}

      {phase === "prompt" && (
        <>
          <p className="game-board__prompt">Who is this person?</p>
          <button type="button" className="big-btn" onClick={() => setPhase("guess")}>
            I&apos;m ready to guess
          </button>
        </>
      )}

      {phase === "guess" && (
        <>
          <label className="quiz-label">
            Your guess
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Type their name"
              autoFocus
            />
          </label>
          <button
            type="button"
            className="big-btn"
            onClick={() => setPhase("reveal")}
            disabled={!guess.trim()}
          >
            Check
          </button>
        </>
      )}

      {phase === "reveal" && (
        <>
          <p className={`quiz-result ${ok ? "quiz-result--ok" : ""}`}>
            {ok ? "Nice work!" : "That is okay — here is the name."}
          </p>
          <p className="game-board__prompt">{person.name}</p>
          {(person.cues?.[0] || person.facts[0]) && (
            <p className="hud-card__cue">{person.cues?.[0] || person.facts[0]}</p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setPhase("prompt");
                setGuess("");
              }}
            >
              Try again
            </button>
            {onDone && (
              <button type="button" className="big-btn" onClick={onDone}>
                Back to live
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
