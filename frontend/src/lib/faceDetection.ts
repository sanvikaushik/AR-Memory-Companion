/**
 * Live face detection + matching (face-api.js TinyFaceDetector).
 *
 * Product flow:
 * 1. Enroll known people from camera-roll photos (Person.photo) into a FaceMatcher.
 * 2. Live loop: detect face → padded oval box → match descriptors when possible.
 * 3. Emit FaceDetectionEvent for HUD overlay.
 */

import type { FaceBox, FaceDetectionEvent, Person } from "./types";

export type DetectionCallback = (event: FaceDetectionEvent) => void;

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";

/** How often to run recognition (ms). Box tracking stays more frequent. */
const RECOGNIZE_EVERY_MS = 400;

/** Expand detector box so oval covers forehead / chin / cheeks. */
const PAD_X = 0.22;
const PAD_Y = 0.32;

type FaceApi = typeof import("face-api.js");

let faceapi: FaceApi | null = null;
let modelsLoaded = false;
let faceMatcher: InstanceType<FaceApi["FaceMatcher"]> | null = null;

async function getFaceApi(): Promise<FaceApi> {
  if (!faceapi) {
    faceapi = await import("face-api.js");
  }
  return faceapi;
}

function detectorOptions(api: FaceApi) {
  return new api.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.45,
  });
}

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const api = await getFaceApi();
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    api.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

/**
 * Build matcher index from enrolled Person.photo values (camera roll / URLs).
 */
export async function enrollPeople(people: Person[]): Promise<void> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const api = await getFaceApi();
  const options = detectorOptions(api);
  const labeled = [];

  for (const person of people) {
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

  faceMatcher =
    labeled.length > 0 ? new api.FaceMatcher(labeled, 0.55) : null;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Expand + clamp a detector box into a face-covering oval region (0–1). */
export function toPaddedFaceBox(
  box: { x: number; y: number; width: number; height: number },
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

function cropSnapshot(video: HTMLVideoElement, box: FaceBox): string {
  const canvas = document.createElement("canvas");
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) {
    return "";
  }
  const sx = box.x * video.videoWidth;
  const sy = box.y * video.videoHeight;
  const sw = box.width * video.videoWidth;
  const sh = box.height * video.videoHeight;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/**
 * Continuous detection loop. Box updates often; recognition is throttled.
 */
export function startDetectionLoop(
  video: HTMLVideoElement,
  onDetect: DetectionCallback,
): () => void {
  let cancelled = false;
  let running = false;
  let lastRecognizeAt = 0;
  let lastPersonId: string | null = null;
  let rafId = 0;
  let timeoutId = 0;

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
      const shouldRecognize =
        !!faceMatcher && now - lastRecognizeAt >= RECOGNIZE_EVERY_MS;

      if (shouldRecognize) {
        lastRecognizeAt = now;
        const full = await api
          .detectSingleFace(video, options)
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        if (full && !cancelled) {
          const faceBox = toPaddedFaceBox(
            full.detection.box,
            video.videoWidth,
            video.videoHeight,
          );
          const best = faceMatcher.findBestMatch(full.descriptor);
          if (best.label !== "unknown") {
            lastPersonId = best.label;
            onDetect({
              status: "known",
              personId: best.label,
              box: faceBox,
            });
          } else {
            lastPersonId = null;
            onDetect({
              status: "unknown",
              box: faceBox,
              snapshot: cropSnapshot(video, faceBox),
            });
          }
        }
      } else {
        const detection = await api.detectSingleFace(video, options);
        if (detection && !cancelled) {
          const faceBox = toPaddedFaceBox(
            detection.box,
            video.videoWidth,
            video.videoHeight,
          );
          if (lastPersonId) {
            onDetect({
              status: "known",
              personId: lastPersonId,
              box: faceBox,
            });
          } else {
            onDetect({
              status: "unknown",
              box: faceBox,
              snapshot: "",
            });
          }
        }
      }
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
    window.cancelAnimationFrame(rafId);
    window.clearTimeout(timeoutId);
  };
}
