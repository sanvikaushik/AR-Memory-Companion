/**
 * MediaPipe Hand Landmarker — index fingertip for point-to-answer quiz.
 */
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

/** Index fingertip landmark index. */
export const INDEX_TIP = 8;

export type FingerTip = {
  /** 0–1 relative to video frame (MediaPipe coords; origin top-left). */
  x: number;
  y: number;
};

let landmarker: HandLandmarker | null = null;
let loadPromise: Promise<HandLandmarker> | null = null;
let lastVideoTime = -1;

export async function loadHandLandmarker(): Promise<HandLandmarker> {
  if (landmarker) return landmarker;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    return landmarker;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

/**
 * Detect the foremost index fingertip in the current video frame.
 * Returns null when no hand is visible.
 */
export function detectIndexTip(
  video: HTMLVideoElement,
  mirrorX = true,
): FingerTip | null {
  if (!landmarker || video.readyState < 2) return null;

  const t = video.currentTime;
  if (t === lastVideoTime) {
    // Still return last frame's logic by re-detecting — MediaPipe needs new timestamps.
  }
  lastVideoTime = t;

  const result = landmarker.detectForVideo(video, performance.now());
  const hands = result.landmarks;
  if (!hands || hands.length === 0) return null;

  // Prefer the tip closest to a screen edge (most likely "pointing at a corner").
  let best: NormalizedLandmark | null = null;
  let bestEdgeScore = -1;
  for (const hand of hands) {
    const tip = hand[INDEX_TIP];
    if (!tip) continue;
    const edgeScore =
      Math.min(tip.x, 1 - tip.x, tip.y, 1 - tip.y) * -1 +
      (tip.x < 0.35 || tip.x > 0.65 || tip.y < 0.35 || tip.y > 0.65
        ? 1
        : 0);
    if (!best || edgeScore > bestEdgeScore) {
      best = tip;
      bestEdgeScore = edgeScore;
    }
  }
  if (!best) return null;

  // Selfie cameras feel mirrored; flip X so pointing at a visual corner matches.
  const x = mirrorX ? 1 - best.x : best.x;
  return { x, y: best.y };
}

export type CornerId = "tl" | "tr" | "bl" | "br";

/** Which screen corner the fingertip is in (null = center / none). */
export function tipToCorner(
  tip: FingerTip | null,
  edge = 0.32,
): CornerId | null {
  if (!tip) return null;
  const left = tip.x <= edge;
  const right = tip.x >= 1 - edge;
  const top = tip.y <= edge;
  const bottom = tip.y >= 1 - edge;
  if (top && left) return "tl";
  if (top && right) return "tr";
  if (bottom && left) return "bl";
  if (bottom && right) return "br";
  return null;
}
