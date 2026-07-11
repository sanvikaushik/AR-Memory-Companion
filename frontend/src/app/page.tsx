"use client";

import { useCallback, useEffect, useState } from "react";
import AddPersonForm from "@/components/AddPersonForm";
import CameraFeed from "@/components/CameraFeed";
import HudCard from "@/components/HudCard";
import QuizScreen from "@/components/QuizScreen";
import SessionControls from "@/components/SessionControls";
import { createPerson, listPeople } from "@/lib/api";
import type { FaceDetectionEvent, Person } from "@/lib/types";

type View = "live" | "quiz";

const DUMMY_PERSON: Omit<Person, "personId"> = {
  name: "Alex Rivera",
  relationship: "grandchild",
  photo: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect fill='%234a6' width='120' height='120'/%3E%3Ctext x='60' y='68' text-anchor='middle' fill='white' font-size='40'%3EAR%3C/text%3E%3C/svg%3E",
  facts: ["Visits on Sundays", "Plays piano"],
  conversationHistory: [],
  spacedRetrievalState: {},
};

export default function HomePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [unknownSnapshot, setUnknownSnapshot] = useState<string | null>(null);
  const [view, setView] = useState<View>("live");
  const [apiMessage, setApiMessage] = useState<string>("Loading people…");
  const [busy, setBusy] = useState(false);

  const refreshPeople = useCallback(async () => {
    try {
      const list = await listPeople();
      setPeople(list);
      setApiMessage(`Loaded ${list.length} people from API`);
      setActivePerson((current) => current ?? list[0] ?? null);
    } catch (err) {
      setApiMessage(
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
        setUnknownSnapshot(null);
      } else {
        setUnknownSnapshot(event.snapshot);
      }
    },
    [people],
  );

  async function seedDummyPerson() {
    setBusy(true);
    try {
      const created = await createPerson(DUMMY_PERSON);
      setPeople((prev) => [...prev, created]);
      setActivePerson(created);
      setApiMessage(`Created dummy person ${created.personId}`);
    } catch (err) {
      setApiMessage(
        err instanceof Error ? err.message : "Failed to create dummy person",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>AR Memory Companion</h1>
        <p className="muted">{apiMessage}</p>
        <div className="toolbar">
          <button type="button" onClick={() => void refreshPeople()}>
            Refresh people
          </button>
          <button
            type="button"
            onClick={() => void seedDummyPerson()}
            disabled={busy}
          >
            Seed dummy person
          </button>
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
          {unknownSnapshot && (
            <AddPersonForm
              snapshot={unknownSnapshot}
              onCreated={(person) => {
                setPeople((prev) => [...prev, person]);
                setActivePerson(person);
                setUnknownSnapshot(null);
                setApiMessage(`Enrolled ${person.name}`);
              }}
              onCancel={() => setUnknownSnapshot(null)}
            />
          )}
        </div>
      )}

      {people.length > 0 && (
        <section className="people-list">
          <h2>People in DB</h2>
          <ul>
            {people.map((p) => (
              <li key={p.personId}>
                <button type="button" onClick={() => setActivePerson(p)}>
                  {p.name} ({p.relationship})
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
