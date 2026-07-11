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
 * Enroll an unknown face detected in the live feed.
 * The captured descriptor is saved alongside the photo so future sessions
 * recognize this person and never create a duplicate record.
 */
export default function AddPersonForm({
  snapshot,
  descriptor,
  descriptors,
  onCreated,
  onCancel,
}: AddPersonFormProps) {
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

  return (
    <form className="add-person-form" onSubmit={handleSubmit}>
      <h2>Add person</h2>
      <p className="muted">Unknown face — enroll them in MongoDB</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={snapshot} alt="Face snapshot" className="snapshot" />
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save person"}
        </button>
      </div>
    </form>
  );
}
