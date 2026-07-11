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

/** Emitted by the face detection loop for HUD / add-person flows. */
export type FaceDetectionEvent =
  | { status: "known"; personId: string }
  | { status: "unknown"; snapshot: string };

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
