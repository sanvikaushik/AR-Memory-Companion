import type {
  ConversationMemory,
  ExtractTopicsRequest,
  ExtractTopicsResponse,
  Person,
  PersonCreate,
  PersonUpdate,
  TranscribeResponse,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail || res.statusText}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function listPeople(): Promise<Person[]> {
  return request<Person[]>("/api/people");
}

export async function getPerson(personId: string): Promise<Person> {
  return request<Person>(`/api/people/${personId}`);
}

export async function createPerson(payload: PersonCreate): Promise<Person> {
  return request<Person>("/api/people", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePerson(
  personId: string,
  payload: PersonUpdate,
): Promise<Person> {
  return request<Person>(`/api/people/${personId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deletePerson(personId: string): Promise<void> {
  return request<void>(`/api/people/${personId}`, { method: "DELETE" });
}

/** Append a learned reference descriptor (new angle) to an enrolled person. */
export async function appendDescriptor(
  personId: string,
  descriptor: number[],
): Promise<void> {
  return request<void>(`/api/people/${personId}/descriptors`, {
    method: "POST",
    body: JSON.stringify({ descriptor }),
  });
}

/** Append a camera-roll photo (and optional face descriptor) to a person. */
export async function appendPhoto(
  personId: string,
  photo: string,
  descriptor: number[] = [],
): Promise<Person> {
  return request<Person>(`/api/people/${personId}/photos`, {
    method: "POST",
    body: JSON.stringify({ photo, descriptor }),
  });
}

export type SeedPhotoMeta = {
  id: string;
  filename: string;
  url: string;
};

/** List photos available under backend/seed (browser-ready URLs). */
export async function listSeedPhotos(): Promise<SeedPhotoMeta[]> {
  const photos = await request<SeedPhotoMeta[]>("/api/seed/photos");
  return photos.map((p) => ({
    ...p,
    url: `${API_BASE}${p.url}`,
  }));
}

/** Boy → Ishaan Chandra, girl → Sanvi Kaushik (fixed DB records). */
export async function assignHardcodedFace(
  gender: "male" | "female",
  payload: {
    photo: string;
    descriptor?: number[];
    descriptors?: number[][];
  },
): Promise<Person> {
  return request<Person>(`/api/people/hardcoded/${gender}`, {
    method: "POST",
    body: JSON.stringify({
      photo: payload.photo,
      descriptor: payload.descriptor ?? [],
      descriptors: payload.descriptors ?? [],
    }),
  });
}

export async function transcribeAudio(
  audio: Blob,
  sessionId?: string,
  speakers?: string[],
  person?: { personId?: string | null; personName?: string | null },
): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("audio", audio, "recording.webm");
  if (sessionId) {
    form.append("sessionId", sessionId);
  }
  if (speakers?.length) {
    form.append("speakers", JSON.stringify(speakers));
  }
  if (person?.personId) {
    form.append("personId", person.personId);
  }
  if (person?.personName) {
    form.append("personName", person.personName);
  }
  return request<TranscribeResponse>("/api/transcribe", {
    method: "POST",
    body: form,
  });
}

export async function listConversations(
  personId?: string,
): Promise<ConversationMemory[]> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  return request<ConversationMemory[]>(`/api/conversations${qs}`);
}

export async function extractTopics(
  payload: ExtractTopicsRequest,
): Promise<ExtractTopicsResponse> {
  return request<ExtractTopicsResponse>("/api/extract-topics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
