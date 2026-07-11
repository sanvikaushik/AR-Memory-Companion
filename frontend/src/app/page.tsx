"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AddPersonForm from "@/components/AddPersonForm";
import CameraFeed from "@/components/CameraFeed";
import HudCard from "@/components/HudCard";
import QuizScreen from "@/components/QuizScreen";
import SessionControls from "@/components/SessionControls";
import {
  enrollPeople,
  findDuplicatePersonId,
  getTrackDescriptor,
  getTrackDescriptors,
  registerEnrolledDescriptors,
} from "@/lib/faceDetection";
import { listPeople } from "@/lib/api";
import type { Person, TrackedFace } from "@/lib/types";

type View = "live" | "quiz";

type PendingFace = {
  trackId: number;
  snapshot: string;
  descriptor: number[];
};

/** Cap how many enroll cards can be open at once. */
const MAX_PENDING = 6;

/**
 * Live companion UX:
 * camera → face ovals → match against enrolled faces → HUD overlays.
 * Multiple unknown faces can be enrolled in parallel; duplicates are never
 * saved twice.
 */
export default function HomePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [recognizedPeople, setRecognizedPeople] = useState<Person[]>([]);
  const [recognitionHint, setRecognitionHint] = useState(
    "Looking for a face…",
  );
  const [view, setView] = useState<View>("live");
  const [apiStatus, setApiStatus] = useState("Connecting…");
  const [pendingFaces, setPendingFaces] = useState<PendingFace[]>([]);

  // Mirrors used inside the per-frame callback to avoid stale closures.
  const pendingFacesRef = useRef<PendingFace[]>([]);
  const dismissedTracksRef = useRef<Set<number>>(new Set());
  pendingFacesRef.current = pendingFaces;

  const activePerson = recognizedPeople[0] ?? null;

  const refreshPeople = useCallback(async () => {
    try {
      const list = await listPeople();
      setPeople(list);
      await enrollPeople(list);
      setApiStatus(
        list.length === 0
          ? "No people in DB — enroll a face below"
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

  const onFaces = useCallback(
    (faces: TrackedFace[]) => {
      if (faces.length === 0) {
        setRecognizedPeople([]);
        setRecognitionHint("Looking for a face…");
        return;
      }

      const knownIds = new Set(
        faces
          .filter((f) => f.status === "known" && f.personId)
          .map((f) => f.personId as string),
      );
      const matched = people.filter((p) => knownIds.has(p.personId));
      setRecognizedPeople(matched);

      const unknownCount = faces.filter((f) => f.status === "unknown").length;
      const parts: string[] = [];
      if (matched.length > 0) {
        parts.push(`Recognized ${matched.map((p) => p.name).join(", ")}`);
      }
      if (unknownCount > 0) {
        parts.push(`${unknownCount} unknown`);
      }
      if (parts.length === 0) {
        parts.push(`Tracking ${faces.length} face(s)…`);
      }
      setRecognitionHint(parts.join(" · "));

      // Queue every new unknown face for enrollment (in parallel).
      const current = pendingFacesRef.current;
      const alreadyPending = new Set(current.map((p) => p.trackId));
      const additions: PendingFace[] = [];

      for (const face of faces) {
        if (current.length + additions.length >= MAX_PENDING) break;
        if (
          face.status !== "unknown" ||
          !face.snapshot ||
          alreadyPending.has(face.trackId) ||
          dismissedTracksRef.current.has(face.trackId)
        ) {
          continue;
        }
        const descriptor = getTrackDescriptor(face.trackId) ?? [];
        // Dedup: skip a face that already matches an enrolled person.
        if (descriptor.length > 0 && findDuplicatePersonId(descriptor) !== null) {
          dismissedTracksRef.current.add(face.trackId);
          continue;
        }
        additions.push({
          trackId: face.trackId,
          snapshot: face.snapshot,
          descriptor,
        });
      }

      if (additions.length > 0) {
        const next = [...current, ...additions];
        pendingFacesRef.current = next;
        setPendingFaces(next);
      }
    },
    [people],
  );

  const removePending = useCallback((trackId: number) => {
    const next = pendingFacesRef.current.filter((p) => p.trackId !== trackId);
    pendingFacesRef.current = next;
    setPendingFaces(next);
  }, []);

  const handleCreated = useCallback(
    (person: Person, trackId: number) => {
      dismissedTracksRef.current.add(trackId);
      const samples = getTrackDescriptors(trackId);
      const descriptors =
        samples.length > 0
          ? samples
          : (() => {
              const d = getTrackDescriptor(trackId);
              return d ? [d] : [];
            })();
      if (descriptors.length > 0) {
        registerEnrolledDescriptors(person.personId, descriptors);
      }
      setPeople((prev) =>
        prev.some((p) => p.personId === person.personId)
          ? prev
          : [...prev, person],
      );
      removePending(trackId);
    },
    [removePending],
  );

  const handleCancel = useCallback(
    (trackId: number) => {
      dismissedTracksRef.current.add(trackId);
      removePending(trackId);
    },
    [removePending],
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
          <CameraFeed onFaces={onFaces} people={people} />
          {pendingFaces.length > 0 && (
            <div className="enroll-list">
              {pendingFaces.map((face) => (
                <AddPersonForm
                  key={face.trackId}
                  snapshot={face.snapshot}
                  descriptor={
                    getTrackDescriptor(face.trackId) ?? face.descriptor
                  }
                  descriptors={getTrackDescriptors(face.trackId)}
                  onCreated={(person) => handleCreated(person, face.trackId)}
                  onCancel={() => handleCancel(face.trackId)}
                />
              ))}
            </div>
          )}
          <div className="hud-stack">
            {recognizedPeople.length > 0 ? (
              recognizedPeople.map((person) => (
                <HudCard key={person.personId} person={person} />
              ))
            ) : (
              <HudCard person={null} />
            )}
          </div>
          <SessionControls personId={activePerson?.personId} />
        </div>
      )}
    </main>
  );
}
