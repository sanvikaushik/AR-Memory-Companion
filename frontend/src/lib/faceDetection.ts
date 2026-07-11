/**
 * Stub: face-api.js setup, enrollment, and matching.
 *
 * TODO: Load models, enroll known faces from Person.photo, run a detection
 * loop against the webcam video element, and emit FaceDetectionEvent values.
 */

import type { FaceDetectionEvent, Person } from "./types";

export type DetectionCallback = (event: FaceDetectionEvent) => void;

/** Placeholder — load face-api.js models here. */
export async function loadFaceModels(): Promise<void> {
  console.info("[faceDetection] loadFaceModels stub — not implemented");
}

/** Placeholder — build descriptor index from enrolled people. */
export async function enrollPeople(_people: Person[]): Promise<void> {
  console.info("[faceDetection] enrollPeople stub — not implemented");
}

/**
 * Placeholder detection loop.
 * Calls onDetect once with a dummy "unknown" event so UI wiring can be tested.
 */
export function startDetectionLoop(
  _video: HTMLVideoElement,
  onDetect: DetectionCallback,
): () => void {
  console.info("[faceDetection] startDetectionLoop stub");
  const timer = window.setTimeout(() => {
    onDetect({
      status: "unknown",
      // Tiny placeholder PNG so AddPersonForm can render a snapshot image
      snapshot:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect fill='%23667' width='120' height='120'/%3E%3Ctext x='60' y='68' text-anchor='middle' fill='white' font-size='14'%3Eunknown%3C/text%3E%3C/svg%3E",
    });
  }, 1500);

  return () => window.clearTimeout(timer);
}
