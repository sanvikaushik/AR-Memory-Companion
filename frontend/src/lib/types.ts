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
 * Emitted by the live detection loop.
 * Wearer UX: box + auto HUD overlay when matched to camera-roll enrollment.
 * No manual "add person" form in the live experience.
 */
export type FaceDetectionEvent =
  | { status: "known"; personId: string; box: FaceBox }
  | { status: "unknown"; snapshot: string; box: FaceBox };

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
