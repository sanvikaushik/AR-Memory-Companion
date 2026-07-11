export type ConversationEntry = {
  date: string;
  topics: string[];
  sessionId: string;
};

export type Person = {
  personId: string;
  name: string;
  relationship: string;
  photo: string;
  facts: string[];
  conversationHistory: ConversationEntry[];
  spacedRetrievalState: Record<string, unknown>;
  /**
   * 128-d face embedding captured at enrollment. Stored so recognition and
   * duplicate detection don't need to re-run detection on the photo each load.
   */
  descriptor?: number[];
  /**
   * Additional reference embeddings (different angles / lighting), grown via
   * online learning. Matching uses the nearest of these for angle robustness.
   */
  descriptors?: number[][];
};

export type PersonCreate = Omit<Person, "personId">;

export type PersonUpdate = Partial<Omit<Person, "personId">>;

/** Normalized face box relative to the video frame (0–1). */
export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Emitted by the live detection loop for a single face.
 * Wearer UX: box + auto HUD overlay when matched to camera-roll enrollment.
 * No manual "add person" form in the live experience.
 */
export type FaceDetectionEvent =
  | { status: "known"; personId: string; box: FaceBox }
  | { status: "unknown"; snapshot: string; box: FaceBox };

/**
 * One tracked face in a multi-face frame.
 *
 * `trackId` is a stable identity assigned by the IoU tracker so the UI can
 * animate a specific face across frames. Recognition (descriptor matching) is
 * throttled per track, so `status` may be "pending" until the first match runs.
 */
export type TrackedFace = {
  trackId: number;
  box: FaceBox;
  status: "known" | "unknown" | "pending";
  personId: string | null;
  /** Match distance (lower = closer); null until recognized. */
  distance: number | null;
  /** Base64 crop, only populated for unknown faces. */
  snapshot: string | null;
};

/** Callback for the multi-face detection loop. */
export type FacesCallback = (faces: TrackedFace[]) => void;

export type TranscribeResponse = {
  text: string;
  sessionId: string | null;
};

export type ExtractTopicsRequest = {
  transcript: string;
  personId?: string | null;
  sessionId?: string | null;
};

export type ExtractTopicsResponse = {
  topics: string[];
  facts: string[];
  sessionId: string | null;
};
