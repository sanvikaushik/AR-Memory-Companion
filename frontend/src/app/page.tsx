"use client";

import { useCallback, useEffect, useState } from "react";
import BackgroundHandTracker from "@/components/BackgroundHandTracker";
import CameraFeed from "@/components/CameraFeed";
import Flashcards from "@/components/Flashcards";
import HudCard from "@/components/HudCard";
import ModeNav, { type AppMode } from "@/components/ModeNav";
import PhotoAlbum from "@/components/PhotoAlbum";
import PointQuizGame from "@/components/PointQuizGame";
import QuizScreen from "@/components/QuizScreen";
import { listCacheWho } from "@/lib/api";
import { enrollPeople } from "@/lib/faceDetection";
import { loadCacheWhoIndex } from "@/lib/cacheWho";
import type { FingerTip } from "@/lib/handTracking";
import type { Person, TrackedFace } from "@/lib/types";

/** Fully hands-free wearable companion — point to navigate, no clicks. */
export default function HomePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [recognizedPeople, setRecognizedPeople] = useState<Person[]>([]);
  const [recognitionHint, setRecognitionHint] = useState(
    "Looking for friends…",
  );
  const [mode, setMode] = useState<AppMode>("live");
  const [apiStatus, setApiStatus] = useState("Connecting…");
  const [tip, setTip] = useState<FingerTip | null>(null);

  const activePerson = recognizedPeople[0] ?? null;
  const needsBackgroundHands =
    mode === "cards" || mode === "album" || mode === "quiz";

  const refreshCacheWho = useCallback(async () => {
    try {
      const profiles = await listCacheWho();
      const indexed = await loadCacheWhoIndex();
      const usable = indexed.filter((p) => p.descriptors.length > 0);
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
          : usable.length === 0
            ? `Cache_who loaded but no faces found in photos (${profiles.length})`
            : `${usable.length} Cache_who profile(s) ready`,
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
    <div className="stage stage--handsfree">
      {needsBackgroundHands && (
        <BackgroundHandTracker active onTip={setTip} />
      )}

      {mode === "live" && (
        <div className="stage__camera">
          <CameraFeed
            onFaces={onFaces}
            onMatchedPeople={onMatchedPeople}
            onTip={setTip}
          />
        </div>
      )}

      {mode === "live" && (
        <>
          <div className="top-bar">
            <div className="top-bar__info">
              <h1>Memory Companion</h1>
              <p className="top-bar__hint">{recognitionHint}</p>
              <p className="top-bar__status">{apiStatus}</p>
              <p className="top-bar__status">
                Point at bottom tabs to switch modes — no tapping needed
              </p>
            </div>
          </div>

          <div className="hud-stack">
            {recognizedPeople.length > 0 ? (
              recognizedPeople.map((person) => (
                <HudCard
                  key={person.personId}
                  person={person}
                  present={recognizedPeople}
                  calm
                />
              ))
            ) : (
              <HudCard person={null} calm />
            )}
          </div>
        </>
      )}

      {mode === "game" && (
        <div className="mode-overlay mode-overlay--game">
          <PointQuizGame people={people} onTip={setTip} />
        </div>
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
                Looking for Cache_who friends…
              </p>
            </section>
          )}
        </div>
      )}

      {/* Finger cursor for non-game modes */}
      {tip && mode !== "game" && (
        <div
          className="handsfree-cursor"
          style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}
        />
      )}

      <ModeNav mode={mode} onChange={setMode} tip={tip} />
    </div>
  );
}
