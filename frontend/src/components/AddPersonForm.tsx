"use client";

import { useState, type FormEvent } from "react";
import { createPerson } from "@/lib/api";
import type { Person } from "@/lib/types";

type AddPersonFormProps = {
  snapshot: string;
  /** Averaged 128-d embedding captured live; stored for recognition + dedup. */
  descriptor?: number[];
  /** Multiple reference embeddings (angles) captured live for robustness. */
  descriptors?: number[][];
  onCreated: (person: Person) => void;
  onCancel: () => void;
};

/**
 * New-face overlay. Starts as a compact card next to the detected face;
 * clicking it expands into a form to add name / relationship / facts.
 * The captured descriptors are saved so future sessions recognize this person.
 */
export default function AddPersonForm({
  snapshot,
  descriptor,
  descriptors,
  onCreated,
  onCancel,
}: AddPersonFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [factsText, setFactsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const facts = factsText
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
      const person = await createPerson({
        name,
        relationship,
        photo: snapshot,
        facts,
        conversationHistory: [],
        spacedRetrievalState: {},
        descriptor: descriptor ?? [],
        descriptors: descriptors ?? [],
      });
      onCreated(person);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create person");
    } finally {
      setBusy(false);
    }
  }

  if (!expanded) {
    return (
      <aside
        className="enroll-card"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={snapshot} alt="New face" className="enroll-card__avatar" />
        <div className="enroll-card__body">
          <h2>New person</h2>
          <p className="muted">Tap to add details</p>
        </div>
        <button
          type="button"
          className="enroll-card__dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </aside>
    );
  }

  return (
    <form className="add-person-form" onSubmit={handleSubmit}>
      <div className="enroll-card__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={snapshot} alt="New face" className="enroll-card__avatar" />
        <div>
          <h2>New person</h2>
          <p className="muted">Add their details</p>
        </div>
      </div>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Grace"
          autoFocus
          required
        />
      </label>
      <label>
        Relationship
        <input
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          required
          placeholder="e.g. daughter, neighbor"
        />
      </label>
      <label>
        Facts (one per line)
        <textarea
          value={factsText}
          onChange={(e) => setFactsText(e.target.value)}
          rows={3}
          placeholder="Lives in Austin&#10;Loves gardening"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setExpanded(false)}
          disabled={busy}
        >
          Back
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save person"}
        </button>
      </div>
    </form>
  );
}
