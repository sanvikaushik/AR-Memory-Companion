import type {
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

export async function transcribeAudio(
  audio: Blob,
  sessionId?: string,
): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("audio", audio, "recording.webm");
  if (sessionId) {
    form.append("sessionId", sessionId);
  }
  return request<TranscribeResponse>("/api/transcribe", {
    method: "POST",
    body: form,
  });
}

export async function extractTopics(
  payload: ExtractTopicsRequest,
): Promise<ExtractTopicsResponse> {
  return request<ExtractTopicsResponse>("/api/extract-topics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
