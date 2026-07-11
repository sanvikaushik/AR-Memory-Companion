"use client";

import { useRef, useState } from "react";
import { transcribeAudio } from "@/lib/api";
import type { SpeakerTakeaway, SpeakerTurn } from "@/lib/types";

type SessionControlsProps = {
  personId?: string | null;
  personName?: string | null;
  speakerNames?: string[];
  onTopicsExtracted?: (topics: string[], facts: string[]) => void;
};

/**
 * Start/stop conversation recording.
 * Audio → Whisper transcript → Groq LLM (who said what + what about) → memory store.
 */
export default function SessionControls({
  personId,
  personName,
  speakerNames,
  onTopicsExtracted,
}: SessionControlsProps) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string>("Idle");
  const [summary, setSummary] = useState("");
  const [lastTurns, setLastTurns] = useState<SpeakerTurn[]>([]);
  const [takeaways, setTakeaways] = useState<SpeakerTakeaway[]>([]);
  const [lastTopics, setLastTopics] = useState<string[]>([]);
  const [lastFacts, setLastFacts] = useState<string[]>([]);
  const [savedInfo, setSavedInfo] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  async function startRecording() {
    setStatus("Requesting mic…");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    sessionIdRef.current = crypto.randomUUID();
    setSummary("");
    setLastTurns([]);
    setTakeaways([]);
    setLastTopics([]);
    setLastFacts([]);
    setSavedInfo("");

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setStatus("Transcribing & analyzing conversation…");
      try {
        const known =
          speakerNames && speakerNames.length > 0
            ? speakerNames
            : ["Ishaan Chandra", "Sanvi Kaushik"];
        const result = await transcribeAudio(
          blob,
          sessionIdRef.current ?? undefined,
          known,
          { personId, personName },
        );
        setSummary(result.summary ?? "");
        setLastTurns(result.turns ?? []);
        setTakeaways(result.speakerTakeaways ?? []);
        setLastTopics(result.topics ?? []);
        setLastFacts(result.facts ?? []);
        onTopicsExtracted?.(result.topics ?? [], result.facts ?? []);
        if (result.saved) {
          setSavedInfo(
            result.storage === "mongodb"
              ? "Saved to MongoDB"
              : "Saved to local memory file",
          );
        } else {
          setSavedInfo("Analyzed (not saved)");
        }
        setStatus(
          `Done — ${(result.turns ?? []).length} turns, ${(result.topics ?? []).length} topics`,
        );
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
      {savedInfo && <p className="muted">{savedInfo}</p>}
      {!recording ? (
        <button type="button" onClick={() => void startRecording()}>
          Start recording
        </button>
      ) : (
        <button type="button" onClick={stopRecording}>
          Stop &amp; process
        </button>
      )}

      {summary && (
        <div className="session-summary">
          <h4>What they talked about</h4>
          <p>{summary}</p>
        </div>
      )}

      {lastTurns.length > 0 && (
        <div className="session-speakers">
          <h4>Who said what</h4>
          <ul className="speaker-turns">
            {lastTurns.map((turn, i) => (
              <li key={`${turn.speaker}-${i}`}>
                <span className="speaker-name">{turn.speaker}</span>
                <p>{turn.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {takeaways.length > 0 && (
        <div className="session-takeaways">
          <h4>Per person</h4>
          <ul className="speaker-takeaways">
            {takeaways.map((item) => (
              <li key={item.speaker}>
                <span className="speaker-name">{item.speaker}</span>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastTopics.length > 0 && (
        <div className="session-topics">
          <h4>Topics</h4>
          <ul>
            {lastTopics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {lastFacts.length > 0 && (
        <div className="session-facts">
          <h4>Facts mentioned</h4>
          <ul>
            {lastFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
