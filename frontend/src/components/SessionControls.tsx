"use client";

import { useRef, useState } from "react";
import { extractTopics, transcribeAudio } from "@/lib/api";

type SessionControlsProps = {
  personId?: string | null;
  onTopicsExtracted?: (topics: string[], facts: string[]) => void;
};

/**
 * Start/stop conversation recording.
 * Audio → /api/transcribe (Groq stub) → /api/extract-topics (Gemini stub).
 */
export default function SessionControls({
  personId,
  onTopicsExtracted,
}: SessionControlsProps) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("Idle");
  const [lastTopics, setLastTopics] = useState<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  async function startRecording() {
    setStatus("Requesting mic…");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    sessionIdRef.current = crypto.randomUUID();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setStatus("Transcribing (stub)…");
      try {
        const transcript = await transcribeAudio(
          blob,
          sessionIdRef.current ?? undefined,
        );
        setStatus("Extracting topics (stub)…");
        const extracted = await extractTopics({
          transcript: transcript.text,
          personId,
          sessionId: sessionIdRef.current,
        });
        setLastTopics(extracted.topics);
        onTopicsExtracted?.(extracted.topics, extracted.facts);
        setStatus(`Done — ${extracted.topics.length} topics`);
      } catch (err) {
        setStatus(
          err instanceof Error ? err.message : "Session processing failed",
        );
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setStatus("Recording…");
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="session-controls">
      <h3>Conversation session</h3>
      <p className="muted">{status}</p>
      {!recording ? (
        <button type="button" onClick={() => void startRecording()}>
          Start recording
        </button>
      ) : (
        <button type="button" onClick={stopRecording}>
          Stop &amp; process
        </button>
      )}
      {lastTopics.length > 0 && (
        <ul>
          {lastTopics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
