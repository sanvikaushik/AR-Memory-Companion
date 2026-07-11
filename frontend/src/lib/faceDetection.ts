/**
 * Live multi-face detection + matching (face-api.js TinyFaceDetector).
 *
 * Product flow:
 * 1. Enroll known people from camera-roll photos (Person.photo) into a FaceMatcher.
 * 2. Live loop: detect ALL faces every frame → padded oval boxes → track them
 *    across frames (IoU) → run descriptor matching per track on a throttle.
 * 3. Emit an array of TrackedFace for HUD overlays + profile cards.
 *
 * Performance model (this is the "multithreading"):
 * - Inference runs on the TensorFlow.js WebGL backend, so the neural nets
 *   execute on the GPU in parallel with the CPU/render thread.
 * - The cheap detector pass (boxes only) runs frequently for smooth tracking;
 *   the expensive descriptor pass (recognition) is throttled, so adding more
 *   faces does not multiply main-thread cost every frame.
 */

import type { FaceBox, Person, TrackedFace } from "./types";

export type FacesCallback = (faces: TrackedFace[]) => void;

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

/** How often to run recognition (descriptor matching) per frame batch (ms). */
const RECOGNIZE_EVERY_MS = 500;

/** Drop a track if we have not matched a detection to it for this long (ms). */
const TRACK_STALE_MS = 700;

/** Minimum IoU to consider a new detection the same face as an existing track. */
const IOU_MATCH_THRESHOLD = 0.25;

/** Expand detector box so oval covers forehead / chin / cheeks. */
const PAD_X = 0.22;
const PAD_Y = 0.32;

type FaceApi = typeof import("face-api.js");

type PixelBox = { x: number; y: number; width: number; height: number };

type Track = {
  id: number;
  /** Padded, normalized oval box for rendering. */
  box: FaceBox;
  /** Raw detector box in video pixels, used for IoU association. */
  rawBox: PixelBox;
  status: TrackedFace["status"];
  personId: string | null;
  distance: number | null;
  snapshot: string | null;
  lastSeen: number;
  lastRecognizedAt: number;
};

/** Max descriptor distance to treat two faces as the same person. */
const MATCH_DISTANCE = 0.55;

let faceapi: FaceApi | null = null;
let modelsLoaded = false;
let backendReady = false;
let faceMatcher: InstanceType<FaceApi["FaceMatcher"]> | null = null;
/** Kept so we can add newly-enrolled faces live without a full re-enroll. */
let labeledDescriptors: InstanceType<FaceApi["LabeledFaceDescriptors"]>[] = [];

async function getFaceApi(): Promise<FaceApi> {
  if (!faceapi) {
    faceapi = await import("face-api.js");
  }
  return faceapi;
}

function detectorOptions(api: FaceApi) {
  // Larger input = better detection of smaller / further / off-angle faces and
  // steadier landmarks (which yields cleaner recognition descriptors).
  return new api.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
  });
}

/**
 * Prefer the WebGL (GPU) backend so inference runs off the CPU/render thread.
 * Falls back silently to whatever backend TF.js can initialize.
 */
async function ensureBackend(api: FaceApi): Promise<void> {
  if (backendReady) return;
  const tf = (api as unknown as { tf?: Record<string, unknown> }).tf;
  if (tf) {
    try {
      const getBackend = tf.getBackend as (() => string) | undefined;
      const setBackend = tf.setBackend as
        | ((name: string) => Promise<boolean>)
        | undefined;
      const ready = tf.ready as (() => Promise<void>) | undefined;
      if (getBackend?.() !== "webgl" && setBackend) {
        await setBackend("webgl");
      }
      await ready?.();
      console.info(
        `[faceDetection] TF.js backend: ${getBackend?.() ?? "unknown"}`,
      );
    } catch (err) {
      console.warn(
        "[faceDetection] WebGL backend unavailable, using default",
        err,
      );
    }
  }
  backendReady = true;
}

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const api = await getFaceApi();
  await ensureBackend(api);
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    api.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

function rebuildMatcher(api: FaceApi): void {
  faceMatcher =
    labeledDescriptors.length > 0
      ? new api.FaceMatcher(labeledDescriptors, MATCH_DISTANCE)
      : null;
}

/**
 * Build matcher index from enrolled people.
 *
 * Prefers a stored `descriptor` (fast, reliable) and only falls back to
 * re-detecting from the photo when no descriptor was saved.
 */
export async function enrollPeople(people: Person[]): Promise<void> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const api = await getFaceApi();
  const options = detectorOptions(api);
  const labeled: InstanceType<FaceApi["LabeledFaceDescriptors"]>[] = [];

  for (const person of people) {
    // Fast path: use the descriptor stored at enrollment time.
    if (person.descriptor && person.descriptor.length > 0) {
      labeled.push(
        new api.LabeledFaceDescriptors(person.personId, [
          Float32Array.from(person.descriptor),
        ]),
      );
      continue;
    }

    // Fallback: detect a descriptor from the stored photo.
    if (!person.photo || person.photo.startsWith("data:image/svg")) {
      continue;
    }
    try {
      const img = await api.fetchImage(person.photo);
      const detection = await api
        .detectSingleFace(img, options)
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!detection) continue;
      labeled.push(
        new api.LabeledFaceDescriptors(person.personId, [detection.descriptor]),
      );
    } catch (err) {
      console.warn(`[faceDetection] enroll failed for ${person.personId}`, err);
    }
  }

  labeledDescriptors = labeled;
  rebuildMatcher(api);
}

/**
 * Add a freshly-saved face to the live matcher so it is recognized
 * immediately (before the next full enrollment refresh).
 */
export function registerEnrolledDescriptor(
  personId: string,
  descriptor: number[],
): void {
  if (!faceapi || descriptor.length === 0) return;
  labeledDescriptors.push(
    new faceapi.LabeledFaceDescriptors(personId, [
      Float32Array.from(descriptor),
    ]),
  );
  rebuildMatcher(faceapi);
}

/**
 * Duplicate check: returns the personId of an already-enrolled face that
 * matches this descriptor, or null if it is a genuinely new face.
 */
export function findDuplicatePersonId(descriptor: number[]): string | null {
  if (!faceMatcher || descriptor.length === 0) return null;
  const best = faceMatcher.findBestMatch(Float32Array.from(descriptor));
  return best.label !== "unknown" ? best.label : null;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Expand + clamp a detector box into a face-covering oval region (0–1). */
export function toPaddedFaceBox(
  box: PixelBox,
  frameWidth: number,
  frameHeight: number,
): FaceBox {
  const padW = box.width * PAD_X;
  const padH = box.height * PAD_Y;
  const x = box.x - padW;
  const y = box.y - padH;
  const width = box.width + padW * 2;
  const height = box.height + padH * 2;

  // Prefer a slightly taller oval (faces read taller than wide on camera).
  const cx = x + width / 2;
  const cy = y + height / 2;
  const ovalW = Math.max(width, height * 0.85);
  const ovalH = Math.max(height, width * 1.15);

  const left = cx - ovalW / 2;
  const top = cy - ovalH / 2;

  return {
    x: clamp01(left / frameWidth),
    y: clamp01(top / frameHeight),
    width: clamp01(ovalW / frameWidth),
    height: clamp01(ovalH / frameHeight),
  };
}

/**
 * Map a video-frame-relative box onto the displayed element when
 * the video uses object-fit: cover (cropped).
 */
export function mapBoxToElementPercent(
  box: FaceBox,
  video: HTMLVideoElement,
): { left: number; top: number; width: number; height: number } {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const ew = video.clientWidth || 1;
  const eh = video.clientHeight || 1;
  const videoAspect = vw / vh;
  const elemAspect = ew / eh;

  let renderWidth: number;
  let renderHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAspect > elemAspect) {
    renderHeight = eh;
    renderWidth = eh * videoAspect;
    offsetX = (ew - renderWidth) / 2;
    offsetY = 0;
  } else {
    renderWidth = ew;
    renderHeight = ew / videoAspect;
    offsetX = 0;
    offsetY = (eh - renderHeight) / 2;
  }

  const absX = box.x * vw;
  const absY = box.y * vh;
  const absW = box.width * vw;
  const absH = box.height * vh;

  return {
    left: ((offsetX + (absX / vw) * renderWidth) / ew) * 100,
    top: ((offsetY + (absY / vh) * renderHeight) / eh) * 100,
    width: (((absW / vw) * renderWidth) / ew) * 100,
    height: (((absH / vh) * renderHeight) / eh) * 100,
  };
}

/** Rolling window of recent descriptors per track (noise reduction). */
const trackDescriptorSamples = new Map<number, number[][]>();
const MAX_DESCRIPTOR_SAMPLES = 8;

function addDescriptorSample(trackId: number, descriptor: number[]): void {
  const samples = trackDescriptorSamples.get(trackId) ?? [];
  samples.push(descriptor);
  if (samples.length > MAX_DESCRIPTOR_SAMPLES) {
    samples.shift();
  }
  trackDescriptorSamples.set(trackId, samples);
}

function meanDescriptor(samples: number[][]): number[] {
  const n = samples.length;
  if (n === 0) return [];
  const dims = samples[0].length;
  const mean = new Array<number>(dims).fill(0);
  for (const s of samples) {
    for (let i = 0; i < dims; i++) mean[i] += s[i];
  }
  for (let i = 0; i < dims; i++) mean[i] /= n;
  return mean;
}

/**
 * Averaged descriptor for a tracked face, used when enrolling a new person.
 * Averaging several frames reduces per-frame noise and improves match quality.
 */
export function getTrackDescriptor(trackId: number): number[] | null {
  const samples = trackDescriptorSamples.get(trackId);
  if (!samples || samples.length === 0) return null;
  return meanDescriptor(samples);
}

/** How many descriptor samples we have collected for a track so far. */
export function getTrackSampleCount(trackId: number): number {
  return trackDescriptorSamples.get(trackId)?.length ?? 0;
}

function cropSnapshot(video: HTMLVideoElement, box: FaceBox): string {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) {
    return "";
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const sx = box.x * video.videoWidth;
  const sy = box.y * video.videoHeight;
  const sw = box.width * video.videoWidth;
  const sh = box.height * video.videoHeight;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function iou(a: PixelBox, b: PixelBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Minimal IoU tracker: keeps stable ids for faces across frames so recognition
 * can be throttled per face and the UI can animate individual faces smoothly.
 */
class FaceTracker {
  private tracks: Track[] = [];
  private nextId = 1;

  /** Associate this frame's raw boxes with existing tracks; returns pairs. */
  associate(
    detections: PixelBox[],
    now: number,
    video: HTMLVideoElement,
  ): { track: Track; index: number }[] {
    const pairs: { track: Track; index: number }[] = [];
    const usedTracks = new Set<number>();
    const usedDetections = new Set<number>();

    // Greedy IoU matching, best overlaps first.
    const candidates: { d: number; t: number; score: number }[] = [];
    detections.forEach((det, d) => {
      this.tracks.forEach((track, t) => {
        const score = iou(det, track.rawBox);
        if (score >= IOU_MATCH_THRESHOLD) {
          candidates.push({ d, t, score });
        }
      });
    });
    candidates.sort((a, b) => b.score - a.score);

    for (const { d, t } of candidates) {
      if (usedDetections.has(d) || usedTracks.has(t)) continue;
      usedDetections.add(d);
      usedTracks.add(t);
      const track = this.tracks[t];
      const raw = detections[d];
      track.rawBox = raw;
      track.box = toPaddedFaceBox(raw, video.videoWidth, video.videoHeight);
      track.lastSeen = now;
      pairs.push({ track, index: d });
    }

    // Unmatched detections become new tracks.
    detections.forEach((raw, d) => {
      if (usedDetections.has(d)) return;
      const track: Track = {
        id: this.nextId++,
        rawBox: raw,
        box: toPaddedFaceBox(raw, video.videoWidth, video.videoHeight),
        status: "pending",
        personId: null,
        distance: null,
        snapshot: null,
        lastSeen: now,
        lastRecognizedAt: 0,
      };
      this.tracks.push(track);
      pairs.push({ track, index: d });
    });

    return pairs;
  }

  prune(now: number): void {
    const kept: Track[] = [];
    for (const t of this.tracks) {
      if (now - t.lastSeen <= TRACK_STALE_MS) {
        kept.push(t);
      } else {
        trackDescriptorSamples.delete(t.id);
      }
    }
    this.tracks = kept;
  }

  /** Tracks seen in the current frame, as emittable TrackedFace values. */
  visible(now: number): TrackedFace[] {
    return this.tracks
      .filter((t) => t.lastSeen === now)
      .map((t) => ({
        trackId: t.id,
        box: t.box,
        status: t.status,
        personId: t.personId,
        distance: t.distance,
        snapshot: t.snapshot,
      }));
  }

  reset(): void {
    for (const t of this.tracks) trackDescriptorSamples.delete(t.id);
    this.tracks = [];
  }
}

/**
 * Continuous multi-face detection loop.
 *
 * - Every tick: detect all faces (boxes) and update the tracker for smooth
 *   overlays regardless of how many faces are present.
 * - On a throttle: also compute descriptors for all faces and match each to an
 *   enrolled person, updating that face's track identity.
 */
export function startDetectionLoop(
  video: HTMLVideoElement,
  onFaces: FacesCallback,
): () => void {
  let cancelled = false;
  let running = false;
  let lastRecognizeAt = 0;
  let rafId = 0;
  let timeoutId = 0;
  const tracker = new FaceTracker();

  const scheduleNext = () => {
    if (cancelled) return;
    timeoutId = window.setTimeout(() => {
      rafId = window.requestAnimationFrame(() => {
        void tick();
      });
    }, 70);
  };

  const tick = async () => {
    if (cancelled) return;
    if (
      running ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !video.videoWidth
    ) {
      scheduleNext();
      return;
    }

    running = true;
    try {
      const api = await getFaceApi();
      const options = detectorOptions(api);
      const now = performance.now();
      // Run recognition on a throttle even when nobody is enrolled yet, so
      // brand-new faces are still flagged "unknown" and can be enrolled.
      const shouldRecognize = now - lastRecognizeAt >= RECOGNIZE_EVERY_MS;

      if (shouldRecognize) {
        lastRecognizeAt = now;
        const results = await api
          .detectAllFaces(video, options)
          .withFaceLandmarks(true)
          .withFaceDescriptors();
        if (cancelled) return;

        const rawBoxes = results.map((r) => r.detection.box as PixelBox);
        const pairs = tracker.associate(rawBoxes, now, video);

        for (const { track, index } of pairs) {
          addDescriptorSample(track.id, Array.from(results[index].descriptor));
          // Match against the averaged descriptor for a steadier decision.
          const averaged = Float32Array.from(
            meanDescriptor(trackDescriptorSamples.get(track.id) ?? []),
          );
          const best = faceMatcher
            ? faceMatcher.findBestMatch(averaged)
            : null;
          track.lastRecognizedAt = now;
          track.distance = best ? best.distance : null;
          if (best && best.label !== "unknown") {
            track.status = "known";
            track.personId = best.label;
            track.snapshot = null;
          } else {
            track.status = "unknown";
            track.personId = null;
            // Refresh the crop so the saved photo reflects the latest frame.
            track.snapshot = cropSnapshot(video, track.box);
          }
        }
      } else {
        const detections = await api.detectAllFaces(video, options);
        if (cancelled) return;
        const rawBoxes = detections.map((d) => d.box as PixelBox);
        tracker.associate(rawBoxes, now, video);
      }

      tracker.prune(now);
      onFaces(tracker.visible(now));
    } catch (err) {
      console.warn("[faceDetection] tick error", err);
    } finally {
      running = false;
      scheduleNext();
    }
  };

  rafId = window.requestAnimationFrame(() => {
    void tick();
  });

  return () => {
    cancelled = true;
    tracker.reset();
    window.cancelAnimationFrame(rafId);
    window.clearTimeout(timeoutId);
  };
}
