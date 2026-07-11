"use client";

import { useEffect, useRef, useState } from "react";
import { assignHardcodedFace } from "@/lib/api";
import {
  HARDCODED_BY_GENDER,
  estimateGender,
  registerEnrolledDescriptors,
  type EstimatedGender,
} from "@/lib/faceDetection";
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
 * Unknown-face card: estimates boy/girl, then assigns the face to the
 * hardcoded person (Ishaan Chandra / Sanvi Kaushik).
 */
export default function AddPersonForm({
  snapshot,
  descriptor,
  descriptors,
  onCreated,
  onCancel,
}: AddPersonFormProps) {
  const [status, setStatus] = useState("Detecting…");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const gender: EstimatedGender | null = await estimateGender(snapshot);
        const assumed = HARDCODED_BY_GENDER[gender ?? "male"];
        setStatus(`Saving as ${assumed.name}…`);

        const samples =
          descriptors && descriptors.length > 0
            ? descriptors
            : descriptor && descriptor.length > 0
              ? [descriptor]
              : [];
        const primary = samples[0] ?? descriptor ?? [];

        const person = await assignHardcodedFace(gender ?? "male", {
          photo: snapshot,
          descriptor: primary,
          descriptors: samples,
        });

        if (samples.length > 0) {
          registerEnrolledDescriptors(person.personId, samples);
        }
        onCreated(person);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save person");
        setStatus("Could not save");
      }
    })();
  }, [snapshot, descriptor, descriptors, onCreated]);

  return (
    <aside className="enroll-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={snapshot} alt="New face" className="enroll-card__avatar" />
      <div className="enroll-card__body">
        <h2>{status}</h2>
        <p className="muted">Boy → Ishaan Chandra · Girl → Sanvi Kaushik</p>
        {error && <p className="form-error">{error}</p>}
      </div>
      <button
        type="button"
        className="enroll-card__dismiss"
        onClick={onCancel}
        aria-label="Dismiss"
      >
        ×
      </button>
    </aside>
  );
}
