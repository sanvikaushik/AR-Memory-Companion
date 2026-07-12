export type ConversationEntry = {
  date: string;
  topics: string[];
  sessionId: string;
  summary?: string;
  personName?: string;
};

export type SpeakerTurn = {
  speaker: string;
  text: string;
};

export type SpeakerTakeaway = {
  speaker: string;
  points: string[];
};

export type ConversationMemory = {
  sessionId: string;
  personId: string;
  personName: string;
  date: string;
  place?: string | null;
  summary: string;
  topics: string[];
  facts: string[];
  turns: SpeakerTurn[];
  speakerTakeaways: SpeakerTakeaway[];
  cues: string[];
  emotionalTone?: string | null;
  openLoops?: string[];
};

/** Pre-conversation briefing aggregated from past transcripts. */
export type PrepBriefing = {
  personId: string;
  talkCount: number;
  lastSummary: string;
  lastPlace: string;
  lastTone: string;
  topics: string[];
  facts: string[];
  openLoops: string[];
  starters: string[];
  doNotForget: string[];
  safeTopics: string[];
  continuityLine: string;
};

export type Person = {
  personId: string;
  name: string;
  relationship: string;
  /** LinkedIn-style headline for the HUD overlay. */
  headline?: string;
  linkedinUrl?: string;
  /** Primary / HUD avatar (usually photos[0]). */
  photo: string;
  /** Camera-roll + enrollment crops stored as data URLs. */
  photos?: string[];
  facts: string[];
  /** Gentle recall prompts for the HUD / games. */
  cues?: string[];
  /** Short conversation starters. */
  comfortTips?: string[];
  conversationHistory: ConversationEntry[];
  spacedRetrievalState: Record<string, unknown>;
  descriptor?: number[];
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
  /** Live ageGenderNet estimate when available. */
  gender?: "male" | "female" | null;
  genderProbability?: number | null;
};

/** Callback for the multi-face detection loop. */
export type FacesCallback = (faces: TrackedFace[]) => void;

export type TranscribeResponse = {
  text: string;
  sessionId: string | null;
  turns: SpeakerTurn[];
  summary?: string;
  topics?: string[];
  facts?: string[];
  speakerTakeaways?: SpeakerTakeaway[];
  saved?: boolean;
  storage?: string | null;
};

export type ExtractTopicsRequest = {
  transcript: string;
  personId?: string | null;
  sessionId?: string | null;
  speakers?: string[];
};

export type ExtractTopicsResponse = {
  topics: string[];
  facts: string[];
  summary?: string;
  sessionId: string | null;
};
