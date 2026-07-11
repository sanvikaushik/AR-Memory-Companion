"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CameraFeed from "@/components/CameraFeed";
import HudCard from "@/components/HudCard";
import QuizScreen from "@/components/QuizScreen";
import SessionControls from "@/components/SessionControls";
import {
  HARDCODED_BY_GENDER,
  enrollPeople,
  type EstimatedGender,
} from "@/lib/faceDetection";
import { listPeople } from "@/lib/api";
import type { Person, TrackedFace } from "@/lib/types";

type View = "live" | "quiz";

/**
 * Live companion UX:
 * camera → boy/girl → show Ishaan / Sanvi HUD (LinkedIn info from DB).
 * Does NOT capture live photos — add profile + camera-roll photos on the HUD.
 */
export default function HomePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [recognizedPeople, setRecognizedPeople] = useState<Person[]>([]);
  const [recognitionHint, setRecognitionHint] = useState(
    "Looking for a face…",
  );
  const [view, setView] = useState<View>("live");
  const [apiStatus, setApiStatus] = useState("Connecting…");

  const peopleRef = useRef<Person[]>([]);
  const genderByTrackRef = useRef<Map<number, EstimatedGender>>(new Map());
  peopleRef.current = people;

  const activePerson = recognizedPeople[0] ?? null;

  const refreshPeople = useCallback(async () => {
    try {
      const list = await listPeople();
      setPeople(list);
      peopleRef.current = list;
      await enrollPeople(list);
      setApiStatus(
        list.length === 0
          ? "No people in DB yet"
          : `${list.length} profile(s) loaded`,
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

  const personForGender = useCallback(
    (gender: EstimatedGender, list: Person[]): Person | null => {
      const assumed = HARDCODED_BY_GENDER[gender];
      return (
        list.find((p) => p.personId === assumed.personId) ??
        list.find((p) => p.name === assumed.name) ??
        null
      );
    },
    [],
  );

  const onFaces = useCallback(
    (faces: TrackedFace[]) => {
      if (faces.length === 0) {
        setRecognizedPeople([]);
        setRecognitionHint("Looking for a face…");
        return;
      }

      const list = peopleRef.current;
      const matchedById = new Map<string, Person>();

      // Face-matcher hits (from manually enrolled photos).
      for (const face of faces) {
        if (face.status === "known" && face.personId) {
          const person = list.find((p) => p.personId === face.personId);
          if (person) matchedById.set(person.personId, person);
        }
      }

      // Boy/girl → Ishaan / Sanvi (no live photo capture).
      for (const face of faces) {
        const gender: EstimatedGender | null =
          face.gender ?? genderByTrackRef.current.get(face.trackId) ?? null;
        if (face.gender) {
          genderByTrackRef.current.set(face.trackId, face.gender);
        }
        if (!gender) continue;

        const person = personForGender(gender, list);
        if (person) {
          matchedById.set(person.personId, person);
        } else {
          const assumed = HARDCODED_BY_GENDER[gender];
          matchedById.set(assumed.personId, {
            personId: assumed.personId,
            name: assumed.name,
            relationship: assumed.relationship,
            headline: "",
            linkedinUrl: "",
            photo: "",
            photos: [],
            facts: [],
            conversationHistory: [],
            spacedRetrievalState: {},
          });
        }
      }

      const matched = Array.from(matchedById.values());
      if (matched.length > 0) {
        setRecognizedPeople(matched);
        setRecognitionHint(
          `Recognized ${matched.map((p) => p.name).join(", ")}`,
        );
      } else if (faces.some((f) => f.gender == null && f.status !== "known")) {
        setRecognitionHint("Detecting boy / girl…");
      } else {
        setRecognitionHint(`Tracking ${faces.length} face(s)…`);
      }
    },
    [personForGender],
  );

  if (view === "quiz" && activePerson) {
    return (
      <main className="app">
        <header className="app-header">
          <h1>AR Memory Companion</h1>
          <div className="toolbar">
            <button type="button" onClick={() => setView("live")}>
              Back to live
            </button>
          </div>
        </header>
        <QuizScreen person={activePerson} onDone={() => setView("live")} />
      </main>
    );
  }

  return (
    <div className="stage">
      <CameraFeed onFaces={onFaces} people={people} />

      <div className="top-bar">
        <div className="top-bar__info">
          <h1>AR Memory Companion</h1>
          <p className="top-bar__hint">{recognitionHint}</p>
          <p className="top-bar__status">{apiStatus}</p>
        </div>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setView("quiz")}
          disabled={!activePerson}
        >
          Open quiz
        </button>
      </div>

      <div className="hud-stack">
        {recognizedPeople.length > 0 ? (
          recognizedPeople.map((person) => (
            <HudCard
              key={person.personId}
              person={person}
            />
          ))
        ) : (
          <HudCard person={null} />
        )}
      </div>

      <div className="dock">
        <SessionControls
          personId={activePerson?.personId}
          personName={activePerson?.name}
          speakerNames={
            people.length > 0
              ? people.map((p) => p.name)
              : ["Ishaan Chandra", "Sanvi Kaushik"]
          }
        />
      </div>
    </div>
  );
}
