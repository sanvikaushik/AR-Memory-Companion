"use client";

import { useCallback, useEffect, useState } from "react";
import CameraFeed from "@/components/CameraFeed";
import Flashcards from "@/components/Flashcards";
import HudCard from "@/components/HudCard";
import ModeNav, { type AppMode } from "@/components/ModeNav";
import PhotoAlbum from "@/components/PhotoAlbum";
import QuizScreen from "@/components/QuizScreen";
import SessionControls from "@/components/SessionControls";
import { listCacheWho } from "@/lib/api";
import { enrollPeople } from "@/lib/faceDetection";
import { loadCacheWhoIndex } from "@/lib/cacheWho";
import type { Person, TrackedFace } from "@/lib/types";

/** Wearable dementia companion: live AR + Cache_who identity + cards/photos/quiz. */
export default function HomePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [recognizedPeople, setRecognizedPeople] = useState<Person[]>([]);
  const [recognitionHint, setRecognitionHint] = useState(
    "Looking for friends…",
  );
  const [mode, setMode] = useState<AppMode>("live");
  const [apiStatus, setApiStatus] = useState("Connecting…");
  const [calm, setCalm] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);

  const activePerson = recognizedPeople[0] ?? null;

  const refreshCacheWho = useCallback(async () => {
    try {
      const profiles = await listCacheWho();
      const indexed = await loadCacheWhoIndex();
      const list: Person[] = indexed.map((p) => ({
        personId: p.personId,
        name: p.fullName || p.name,
        relationship: p.relationship || "friend",
        headline: p.headline,
        linkedinUrl: "",
        photo: p.imageUrl,
        photos: [p.imageUrl],
        facts: p.facts,
        cues: p.cues,
        comfortTips: [],
        conversationHistory: [],
        spacedRetrievalState: {},
        descriptors: p.descriptors,
        descriptor: p.descriptors[0] ?? [],
      }));
      setPeople(list);
      await enrollPeople(list);
      setApiStatus(
        profiles.length === 0
          ? "Add JSON + photos in backend/seed/Cache_who"
          : `${profiles.length} Cache_who profile(s) ready`,
      );
    } catch (err) {
      setApiStatus(
        err instanceof Error
          ? `API error: ${err.message}`
          : "Failed to reach backend",
      );
    }
  }, []);

  useEffect(() => {
    void refreshCacheWho();
  }, [refreshCacheWho]);

  const onFaces = useCallback((faces: TrackedFace[]) => {
    if (faces.length === 0) {
      setRecognitionHint("Looking for friends…");
      return;
    }
    const known = faces.filter((f) => f.status === "known" && f.personId);
    if (known.length === 0) {
      setRecognitionHint(
        faces.length === 1
          ? "Unknown person"
          : `${faces.length} unknown people`,
      );
      return;
    }
    setRecognitionHint(
      known.length === 1
        ? "Friend recognized"
        : `${known.length} friends recognized`,
    );
  }, []);

  const onMatchedPeople = useCallback((matched: Person[]) => {
    setRecognizedPeople(matched);
    if (matched.length === 1) {
      setRecognitionHint(`${matched[0].name} is with you`);
    } else if (matched.length > 1) {
      setRecognitionHint(
        `${matched.map((p) => p.name.split(" ")[0]).join(" & ")} are with you`,
      );
    }
  }, []);

  return (
    <div className={`stage ${calm ? "stage--calm" : ""}`}>
      {mode === "live" && (
        <div className="stage__camera">
          <CameraFeed onFaces={onFaces} onMatchedPeople={onMatchedPeople} />
        </div>
      )}

      {mode === "live" && (
        <>
          <div className="top-bar">
            <div className="top-bar__info">
              <h1>Memory Companion</h1>
              <p className="top-bar__hint">{recognitionHint}</p>
              {!calm && <p className="top-bar__status">{apiStatus}</p>}
            </div>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setCalm((c) => !c)}
            >
              {calm ? "More detail" : "Calm view"}
            </button>
          </div>

          <div className="hud-stack">
            {recognizedPeople.length > 0 ? (
              recognizedPeople.map((person) => (
                <HudCard
                  key={person.personId}
                  person={person}
                  present={recognizedPeople}
                  calm={calm}
                />
              ))
            ) : (
              <HudCard person={null} calm={calm} />
            )}
          </div>

          <div className={`dock ${calm && !sessionOpen ? "dock--collapsed" : ""}`}>
            {calm && !sessionOpen ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSessionOpen(true)}
              >
                Conversation
              </button>
            ) : (
              <>
                {calm && (
                  <button
                    type="button"
                    className="ghost-btn dock__hide"
                    onClick={() => setSessionOpen(false)}
                  >
                    Hide
                  </button>
                )}
                <SessionControls
                  personId={activePerson?.personId}
                  personName={activePerson?.name}
                  speakerNames={
                    people.length > 0
                      ? people.map((p) => p.name)
                      : ["Ishaan Chandra", "Sanvi Kaushik"]
                  }
                />
              </>
            )}
          </div>
        </>
      )}

      {mode === "cards" && (
        <div className="mode-overlay">
          <Flashcards
            people={people}
            activePerson={activePerson ?? people[0] ?? null}
          />
        </div>
      )}

      {mode === "album" && (
        <div className="mode-overlay">
          <PhotoAlbum people={people} />
        </div>
      )}

      {mode === "quiz" && (
        <div className="mode-overlay">
          {activePerson || people[0] ? (
            <QuizScreen
              person={activePerson ?? people[0]}
              onDone={() => setMode("live")}
            />
          ) : (
            <section className="mode-panel">
              <h2>Quiz</h2>
              <p className="mode-panel__lead">
                Cache_who profiles will appear when the backend is ready.
              </p>
            </section>
          )}
        </div>
      )}

      <ModeNav
        mode={mode}
        onChange={setMode}
        quizDisabled={!(activePerson || people[0])}
      />
    </div>
  );
}
