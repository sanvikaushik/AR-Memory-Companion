/**
 * Live multi-face detection + matching (face-api.js TinyFaceDetector).
 *
 * Product flow:
 * 1. Enroll known people from camera-roll photos (Person.photos / Person.photo)
 *    into a FaceMatcher.
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

import { appendDescriptor } from "./api";
import type { FaceBox, Person, TrackedFace } from "./types";

export type FacesCallback = (faces: TrackedFace[]) => void;

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

/** How often to run recognition (descriptor matching) per frame batch (ms). */
const RECOGNIZE_EVERY_MS = 350;

/** Drop a track if we have not matched a detection to it for this long (ms). */
const TRACK_STALE_MS = 700;

/**
 * Keep showing a previously-recognized identity for this many consecutive
 * recognition misses before flipping to "unknown". Prevents a known face from
 * briefly turning "unknown" (and re-prompting enrollment) at an odd angle.
 */
const KNOWN_HYSTERESIS_MISSES = 6;

/** Min gap between persisting learned descriptors for one person (ms). */
const LEARN_PERSIST_MS = 900;

/**
 * Keep drawing a track for this long after its last detection, even on frames
 * where the detector momentarily misses it. Prevents overlays from flickering
 * on/off ("face found / no face found") between frames.
 */
const VISIBLE_GRACE_MS = 400;

/** Minimum IoU to consider a new detection the same face as an existing track. */
const IOU_MATCH_THRESHOLD = 0.25;

/** Expand detector box so oval covers forehead / chin / cheeks. */
const PAD_X = 0.22;
const PAD_Y = 0.32;

type FaceApi = typeof import("face-api.js");

type PixelBox = { x: number; y: number; width: number; height: number };

/** Hackathon mapping: boy → Ishaan Chandra, girl → Sanvi Kaushik. */
export type EstimatedGender = "male" | "female";

/** Min ageGenderNet confidence before we trust boy/girl assignment. */
const GENDER_CONFIDENCE = 0.88;

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
  gender: EstimatedGender | null;
  genderProbability: number | null;
  lastSeen: number;
  lastRecognizedAt: number;
  /** Consecutive recognition passes without a confident match (hysteresis). */
  missCount: number;
  /** Last time we persisted a learned descriptor for this person (throttle). */
  lastLearnedAt: number;
};

/** Max descriptor distance to treat two faces as the same person. */
const MATCH_DISTANCE = 0.6;
/**
 * When a confident match is this loose or looser (but still within
 * MATCH_DISTANCE), it's likely a new head angle — learn it so future frames at
 * that angle match cleanly.
 */
const AUGMENT_MIN_DISTANCE = 0.36;
/**
 * When a track has already been confidently identified, IoU continuity proves
 * it is still the same physical face. So even if a frame falls outside
 * MATCH_DISTANCE (a new/extreme angle), we still learn it — up to this sanity
 * cap — so that angle matches cleanly next time instead of reading "unknown".
 */
const RELEARN_MAX_DISTANCE = 0.85;
/** Cap reference descriptors per person to bound matching cost. */
const MAX_DESCRIPTORS_PER_PERSON = 48;

let faceapi: FaceApi | null = null;
let modelsLoaded = false;
let backendReady = false;
let faceMatcher: InstanceType<FaceApi["FaceMatcher"]> | null = null;
/**
 * Multiple reference descriptors per person (different angles / lighting).
 * Matching uses the nearest of these, which is what makes recognition robust
 * to head turns. Kept in memory so we can enroll + learn without a full reload.
 */
const descriptorsByPerson = new Map<string, Float32Array[]>();

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
    // Full (non-tiny) landmark model: more accurate alignment than the tiny
    // net, which keeps recognition descriptors stable as the head turns.
    api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    api.nets.ageGenderNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

function rebuildMatcher(api: FaceApi): void {
  const labeled = [];
  for (const [personId, descriptors] of descriptorsByPerson) {
    if (descriptors.length > 0) {
      labeled.push(new api.LabeledFaceDescriptors(personId, descriptors));
    }
  }
  faceMatcher =
    labeled.length > 0 ? new api.FaceMatcher(labeled, MATCH_DISTANCE) : null;
}

function addDescriptorsToStore(personId: string, descriptors: number[][]): void {
  const existing = descriptorsByPerson.get(personId) ?? [];
  for (const d of descriptors) {
    if (d.length > 0) existing.push(Float32Array.from(d));
  }
  // Keep the most recent references if we exceed the cap.
  if (existing.length > MAX_DESCRIPTORS_PER_PERSON) {
    existing.splice(0, existing.length - MAX_DESCRIPTORS_PER_PERSON);
  }
  descriptorsByPerson.set(personId, existing);
}

/**
 * Build matcher index from enrolled people.
 *
 * Prefers the stored `descriptors` set (multiple angles). Falls back to a
 * single stored `descriptor`, then to detecting from every stored photo.
 */
export async function enrollPeople(people: Person[]): Promise<void> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const api = await getFaceApi();
  const options = detectorOptions(api);
  descriptorsByPerson.clear();

  for (const person of people) {
    // Fast path: use the descriptor set stored at enrollment / learned online.
    const stored: number[][] = [];
    if (person.descriptors && person.descriptors.length > 0) {
      stored.push(...person.descriptors);
    }
    if (person.descriptor && person.descriptor.length > 0) {
      stored.push(person.descriptor);
    }
    if (stored.length > 0) {
      addDescriptorsToStore(person.personId, stored);
      continue;
    }

    // Fallback: detect descriptors from all stored camera-roll photos.
    const gallery = personPhotos(person);
    const fromPhotos: number[][] = [];
    for (const src of gallery) {
      try {
        const descriptor = await descriptorFromImageSrc(api, options, src);
        if (descriptor) fromPhotos.push(descriptor);
      } catch (err) {
        console.warn(`[faceDetection] enroll failed for ${person.personId}`, err);
      }
    }
    if (fromPhotos.length > 0) {
      addDescriptorsToStore(person.personId, fromPhotos);
    }
  }

  rebuildMatcher(api);
}

/** Unique photo gallery for a person (primary + photos[]). */
export function personPhotos(person: Person): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const src of [person.photo, ...(person.photos ?? [])]) {
    if (!src || src.startsWith("data:image/svg") || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

/** Detect a 128-d descriptor from an image data URL / remote URL. */
export async function descriptorFromImage(
  src: string,
): Promise<number[] | null> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }
  const api = await getFaceApi();
  return descriptorFromImageSrc(api, detectorOptions(api), src);
}

async function descriptorFromImageSrc(
  api: FaceApi,
  options: ReturnType<typeof detectorOptions>,
  src: string,
): Promise<number[] | null> {
  const img = await api.fetchImage(src);
  const detection = await api
    .detectSingleFace(img, options)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return Array.from(detection.descriptor);
}

/** Hackathon mapping: boy → Ishaan Chandra, girl → Sanvi Kaushik. */
export const HARDCODED_BY_GENDER: Record<
  EstimatedGender,
  { personId: string; name: string; relationship: string }
> = {
  male: {
    personId: "ishaan-chandra",
    name: "Ishaan Chandra",
    relationship: "friend",
  },
  female: {
    personId: "sanvi-kaushik",
    name: "Sanvi Kaushik",
    relationship: "friend",
  },
};

function genderFromNet(
  gender: string | undefined,
  probability: number | undefined,
): { gender: EstimatedGender; probability: number } | null {
  if (gender !== "male" && gender !== "female") return null;
  const p = typeof probability === "number" ? probability : 0;
  if (p < GENDER_CONFIDENCE) return null;
  return { gender, probability: p };
}

/**
 * Estimate binary gender from a face crop / photo.
 * Prefer live-frame gender from the detection loop when available.
 */
export async function estimateGender(
  src: string,
): Promise<EstimatedGender | null> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }
  try {
    const api = await getFaceApi();
    const img = await api.fetchImage(src);
    // Looser detector for tight face crops.
    const options = new api.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.3,
    });
    const result = await api
      .detectSingleFace(img, options)
      .withFaceLandmarks()
      .withAgeAndGender();
    if (!result) return null;
    const parsed = genderFromNet(result.gender, result.genderProbability);
    return parsed?.gender ?? null;
  } catch (err) {
    console.warn("[faceDetection] gender estimate failed", err);
    return null;
  }
}

/**
 * Add freshly-saved faces to the live matcher so the person is recognized
 * immediately (before the next full enrollment refresh).
 */
export function registerEnrolledDescriptors(
  personId: string,
  descriptors: number[][],
): void {
  if (!faceapi || descriptors.length === 0) return;
  addDescriptorsToStore(personId, descriptors);
  rebuildMatcher(faceapi);
}

/**
 * Teach an existing person a new reference descriptor (e.g. a new head angle).
 * Returns true if it was added (i.e. the person is known and under the cap).
 */
export function learnDescriptor(personId: string, descriptor: number[]): boolean {
  if (!faceapi || descriptor.length === 0) return false;
  const existing = descriptorsByPerson.get(personId);
  if (!existing) return false;
  if (existing.length >= MAX_DESCRIPTORS_PER_PERSON) return false;
  existing.push(Float32Array.from(descriptor));
  rebuildMatcher(faceapi);
  return true;
}

function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Nearest distance from `descriptor` to any of a person's reference
 * descriptors (Infinity if the person is unknown to the matcher).
 */
function distanceToPerson(personId: string, descriptor: number[]): number {
  const refs = descriptorsByPerson.get(personId);
  if (!refs || refs.length === 0) return Infinity;
  let min = Infinity;
  for (const ref of refs) {
    const d = euclidean(ref, descriptor);
    if (d < min) min = d;
  }
  return min;
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

/**
 * All recent descriptor samples for a track, used to enroll a person with
 * several reference embeddings at once (better angle coverage than one).
 */
export function getTrackDescriptors(trackId: number): number[][] {
  return trackDescriptorSamples.get(trackId)?.map((s) => [...s]) ?? [];
}

/** How many descriptor samples we have collected for a track so far. */
export function getTrackSampleCount(trackId: number): number {
  return trackDescriptorSamples.get(trackId)?.length ?? 0;
}

/** Exponential smoothing of a box toward a new observation (anti-jitter). */
function smoothBox(prev: PixelBox, next: PixelBox, alpha = 0.45): PixelBox {
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
    width: prev.width + (next.width - prev.width) * alpha,
    height: prev.height + (next.height - prev.height) * alpha,
  };
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
      // Smooth the box toward the new detection to remove per-frame jitter.
      const raw = smoothBox(track.rawBox, detections[d]);
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
        gender: null,
        genderProbability: null,
        lastSeen: now,
        lastRecognizedAt: 0,
        missCount: 0,
        lastLearnedAt: 0,
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

  /**
   * Tracks recently seen (within the grace window) as emittable values.
   * Using a grace window instead of "seen this exact frame" prevents overlays
   * from flickering when the detector misses a face on an occasional frame.
   */
  visible(now: number): TrackedFace[] {
    return this.tracks
      .filter((t) => now - t.lastSeen <= VISIBLE_GRACE_MS)
      .map((t) => ({
        trackId: t.id,
        box: t.box,
        status: t.status,
        personId: t.personId,
        distance: t.distance,
        snapshot: t.snapshot,
        gender: t.gender,
        genderProbability: t.genderProbability,
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
          .withFaceLandmarks()
          .withAgeAndGender()
          .withFaceDescriptors();
        if (cancelled) return;

        const rawBoxes = results.map((r) => r.detection.box as PixelBox);
        const pairs = tracker.associate(rawBoxes, now, video);

        // Teach a person a new reference descriptor (throttled + persisted).
        // Called both on loose confident matches and while holding identity
        // through an off-angle stretch, so the full range of angles is learned.
        const maybeLearn = (
          track: Track,
          personId: string,
          descriptor: number[],
          distance: number,
        ) => {
          if (
            distance >= AUGMENT_MIN_DISTANCE &&
            now - track.lastLearnedAt >= LEARN_PERSIST_MS &&
            learnDescriptor(personId, descriptor)
          ) {
            track.lastLearnedAt = now;
            void appendDescriptor(personId, descriptor).catch(() => {
              /* best-effort persistence; ignore transient API errors */
            });
          }
        };

        for (const { track, index } of pairs) {
          const result = results[index];
          const frameDescriptor = Array.from(result.descriptor);
          addDescriptorSample(track.id, frameDescriptor);

          const genderHit = genderFromNet(
            result.gender,
            result.genderProbability,
          );
          if (genderHit) {
            const prevP = track.genderProbability ?? 0;
            // Stick to first gender; only flip if the new read is much more sure.
            if (
              !track.gender ||
              (genderHit.gender === track.gender &&
                genderHit.probability >= prevP) ||
              genderHit.probability >= Math.max(0.92, prevP + 0.2)
            ) {
              track.gender = genderHit.gender;
              track.genderProbability = genderHit.probability;
            }
          }

          // Match on the CURRENT frame (the current pose), not an average of
          // recent frames — averaging blurs together different angles when the
          // head is moving and pushes the distance past the threshold.
          const best = faceMatcher
            ? faceMatcher.findBestMatch(Float32Array.from(frameDescriptor))
            : null;
          track.lastRecognizedAt = now;

          if (best && best.label !== "unknown") {
            // Confident match on this pose.
            track.status = "known";
            track.personId = best.label;
            track.distance = best.distance;
            track.snapshot = null;
            track.missCount = 0;
            maybeLearn(track, best.label, frameDescriptor, best.distance);
          } else if (
            track.personId &&
            track.missCount < KNOWN_HYSTERESIS_MISSES &&
            distanceToPerson(track.personId, frameDescriptor) <=
              RELEARN_MAX_DISTANCE
          ) {
            // No confident match, but this is the SAME continuously-tracked
            // face we already identified (IoU continuity) and it's still a
            // plausible distance away — it's just at a new angle. Hold the
            // identity AND learn this angle so it matches directly next time.
            const held = track.personId;
            const dist = distanceToPerson(held, frameDescriptor);
            track.status = "known";
            track.distance = dist;
            track.missCount += 1;
            maybeLearn(track, held, frameDescriptor, dist);
          } else {
            track.status = "unknown";
            track.personId = null;
            track.distance = best ? best.distance : null;
            track.missCount = 0;
            // No live photo capture — users add profile / camera-roll photos manually.
            track.snapshot = null;
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
