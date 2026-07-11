"use client";

import { useCallback, useEffect, useState } from "react";
import CameraFeed from "@/components/CameraFeed";
import HudCard from "@/components/HudCard";
import QuizScreen from "@/components/QuizScreen";
import SessionControls from "@/components/SessionControls";
import { enrollPeople } from "@/lib/faceDetection";
import { listPeople } from "@/lib/api";
import type { FaceDetectionEvent, Person } from "@/lib/types";

type View = "live" | "quiz";

/**
 * Live companion UX:
 * camera → face oval → match against DB-enrolled photos → HUD overlay.
 * Enrollment is done via database seed (not this UI).
 */
export default function HomePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [recognitionHint, setRecognitionHint] = useState(
    "Looking for a face…",
  );
  const [view, setView] = useState<View>("live");
  const [apiStatus, setApiStatus] = useState("Connecting…");

  const refreshPeople = useCallback(async () => {
    try {
      const list = await listPeople();
      setPeople(list);
      await enrollPeople(list);
      setApiStatus(
        list.length === 0
          ? "No people in DB — run backend seed script"
          : `${list.length} face(s) loaded from DB`,
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
    void refreshPeople();
  }, [refreshPeople]);

  const onDetection = useCallback(
    (event: FaceDetectionEvent) => {
      if (event.status === "known") {
        const match = people.find((p) => p.personId === event.personId);
        setActivePerson(match ?? null);
        setRecognitionHint(
          match
            ? `Matched ${match.name}`
            : "Matched id not in local cache — reload page",
        );
      } else {
        setActivePerson(null);
        setRecognitionHint("Tracking face…");
      }
    },
    [people],
  );

  return (
    <main className="app">
      <header className="app-header">
        <h1>AR Memory Companion</h1>
        <p className="muted">{apiStatus}</p>
        <p className="muted">{recognitionHint}</p>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => setView(view === "live" ? "quiz" : "live")}
            disabled={!activePerson}
          >
            {view === "live" ? "Open quiz" : "Back to live"}
          </button>
        </div>
      </header>

      {view === "quiz" && activePerson ? (
        <QuizScreen person={activePerson} onDone={() => setView("live")} />
      ) : (
        <div className="live-layout">
          <CameraFeed onDetection={onDetection} />
          <HudCard person={activePerson} />
          <SessionControls personId={activePerson?.personId} />
        </div>
      )}
    </main>
  );
}
