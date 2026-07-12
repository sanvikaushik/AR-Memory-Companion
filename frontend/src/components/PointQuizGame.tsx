"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadFaceModels,
  mapBoxToElementPercent,
  toPaddedFaceBox,
} from "@/lib/faceDetection";
import {
  detectIndexTip,
  loadHandLandmarker,
  tipToCorner,
  type CornerId,
  type FingerTip,
} from "@/lib/handTracking";
import type { Person } from "@/lib/types";

type PointQuizGameProps = {
  people: Person[];
  onTip?: (tip: FingerTip | null) => void;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  correct: CornerId;
  options: Record<CornerId, string>;
};

const HOLD_MS = 5000;
const CORNERS: CornerId[] = ["tl", "tr", "bl", "br"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeOptions(correctLabel: string, wrongs: string[]): {
  correct: CornerId;
  options: Record<CornerId, string>;
} {
  const corners = shuffle(CORNERS);
  const correct = corners[0];
  const options = { tl: "", tr: "", bl: "", br: "" } as Record<CornerId, string>;
  const pool = shuffle(wrongs.filter((w) => w !== correctLabel));
  options[correct] = correctLabel;
  let i = 0;
  for (const c of CORNERS) {
    if (c === correct) continue;
    options[c] = pool[i++] ?? `Option ${i}`;
  }
  return { correct, options };
}

/** Friendly made-up personal trivia (no LinkedIn / job stuff). */
const PERSONAL: Record<
  string,
  { name: string; first: string; bits: { prompt: string; answer: string; wrongs: string[] }[] }
> = {
  "ishaan-chandra": {
    name: "Ishaan Chandra",
    first: "Ishaan",
    bits: [
      {
        prompt: "Who always brings you a snack when they visit?",
        answer: "Ishaan",
        wrongs: ["Sanvi", "Alex", "Jordan"],
      },
      {
        prompt: "Whose favorite drink is hot chocolate with marshmallows?",
        answer: "Ishaan",
        wrongs: ["Sanvi", "Sam", "Riley"],
      },
      {
        prompt: "Who tells the same silly joke about pigeons?",
        answer: "Ishaan",
        wrongs: ["Sanvi", "Taylor", "Morgan"],
      },
      {
        prompt: "Who wears thin glasses and a silver chain?",
        answer: "Ishaan",
        wrongs: ["Sanvi", "Chris", "Jamie"],
      },
      {
        prompt: "What does Ishaan love to drink?",
        answer: "Hot chocolate",
        wrongs: ["Mango ice cream", "Lemonade", "Espresso only"],
      },
    ],
  },
  "sanvi-kaushik": {
    name: "Sanvi Kaushik",
    first: "Sanvi",
    bits: [
      {
        prompt: "Who parks sunglasses on top of their head?",
        answer: "Sanvi",
        wrongs: ["Ishaan", "Alex", "Jordan"],
      },
      {
        prompt: "Whose favorite dessert is mango ice cream?",
        answer: "Sanvi",
        wrongs: ["Ishaan", "Sam", "Riley"],
      },
      {
        prompt: "Who makes special playlists for car rides with you?",
        answer: "Sanvi",
        wrongs: ["Ishaan", "Taylor", "Morgan"],
      },
      {
        prompt: "Who gives the warmest hello at the door?",
        answer: "Sanvi",
        wrongs: ["Ishaan", "Chris", "Jamie"],
      },
      {
        prompt: "What dessert does Sanvi love most?",
        answer: "Mango ice cream",
        wrongs: ["Hot chocolate", "Apple pie", "Plain crackers"],
      },
    ],
  },
};

function buildQuestions(people: Person[]): QuizQuestion[] {
  const ids =
    people.length > 0
      ? people.map((p) => p.personId)
      : Object.keys(PERSONAL);

  const questions: QuizQuestion[] = [];

  for (const id of ids) {
    const pack = PERSONAL[id];
    if (!pack) continue;
    for (const bit of pack.bits) {
      const { correct, options } = makeOptions(bit.answer, bit.wrongs);
      questions.push({
        id: `${id}-${bit.prompt.slice(0, 24)}`,
        prompt: bit.prompt,
        correct,
        options,
      });
    }
  }

  // Shared cozy questions
  {
    const { correct, options } = makeOptions("Ishaan & Sanvi", [
      "Only Ishaan",
      "Only Sanvi",
      "Neither of them",
    ]);
    questions.push({
      id: "both-friends",
      prompt: "Who are your good friends visiting today?",
      correct,
      options,
    });
  }

  {
    const { correct, options } = makeOptions("Smile and say their name", [
      "Look away quietly",
      "Ask who they are loudly",
      "Leave the room",
    ]);
    questions.push({
      id: "what-to-do",
      prompt: "When a friend walks in, what helps most?",
      correct,
      options,
    });
  }

  return shuffle(questions);
}

type FaceHead = { left: number; top: number; width: number; height: number };

/** Camera quiz: question above head, answers in corners, 5s finger dwell. */
export default function PointQuizGame({ people, onTip }: PointQuizGameProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTipRef = useRef(onTip);
  onTipRef.current = onTip;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading models…");
  const [questions, setQuestions] = useState<QuizQuestion[]>(() =>
    buildQuestions(people),
  );
  const [qIndex, setQIndex] = useState(0);
  const [head, setHead] = useState<FaceHead | null>(null);
  const [tip, setTip] = useState<FingerTip | null>(null);
  const [hover, setHover] = useState<CornerId | null>(null);
  const [holdMs, setHoldMs] = useState(0);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [picked, setPicked] = useState<CornerId | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const hoverRef = useRef<CornerId | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const question = questions[qIndex % Math.max(questions.length, 1)] ?? null;
  const questionRef = useRef(question);
  questionRef.current = question;
  const lastFaceAtRef = useRef(0);

  useEffect(() => {
    setQuestions(buildQuestions(people));
    setQIndex(0);
  }, [people]);

  const holdProgress = useMemo(
    () => Math.min(1, holdMs / HOLD_MS),
    [holdMs],
  );

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    let raf = 0;

    async function setup() {
      try {
        setLoading(true);
        setStatus("Loading face + hand models…");
        await Promise.all([loadFaceModels(), loadHandLandmarker()]);
        if (cancelled) return;

        setStatus("Starting camera…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setReady(true);
        setLoading(false);
        setStatus("");

        const api = await import("face-api.js");
        const options = new api.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.45,
        });

        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2) {
            raf = requestAnimationFrame(() => void tick());
            return;
          }

          let finger = null as ReturnType<typeof detectIndexTip>;
          try {
            finger = detectIndexTip(v, false);
          } catch (err) {
            console.warn("[PointQuizGame] tip detect", err);
          }
          setTip(finger);
          onTipRef.current?.(finger);

          const q = questionRef.current;
          if (!lockedRef.current) {
            const corner = tipToCorner(finger, 0.34);
            const now = performance.now();
            if (corner) {
              if (hoverRef.current !== corner) {
                hoverRef.current = corner;
                holdStartRef.current = now;
                setHover(corner);
                setHoldMs(0);
              } else if (holdStartRef.current != null) {
                const elapsed = now - holdStartRef.current;
                setHoldMs(elapsed);
                if (elapsed >= HOLD_MS && q) {
                  lockedRef.current = true;
                  const ok = corner === q.correct;
                  setPicked(corner);
                  setResult(ok ? "correct" : "wrong");
                  setScore((s) => ({
                    right: s.right + (ok ? 1 : 0),
                    total: s.total + 1,
                  }));
                }
              }
            } else {
              hoverRef.current = null;
              holdStartRef.current = null;
              setHover(null);
              setHoldMs(0);
            }
          }

          const now = performance.now();
          if (now - lastFaceAtRef.current > 220) {
            lastFaceAtRef.current = now;
            try {
              const detections = await api.detectAllFaces(v, options);
              if (detections.length > 0) {
                const box = detections[0].box;
                const padded = toPaddedFaceBox(
                  {
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                  },
                  v.videoWidth,
                  v.videoHeight,
                );
                const mapped = mapBoxToElementPercent(padded, v);
                setHead({
                  left: mapped.left,
                  top: mapped.top,
                  width: mapped.width,
                  height: mapped.height,
                });
              } else {
                setHead(null);
              }
            } catch {
              /* ignore */
            }
          }

          raf = requestAnimationFrame(() => void tick());
        };

        raf = requestAnimationFrame(() => void tick());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start game");
          setLoading(false);
        }
      }
    }

    void setup();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, []);

  // Reset dwell when question changes
  useEffect(() => {
    lockedRef.current = false;
    hoverRef.current = null;
    holdStartRef.current = null;
    setHover(null);
    setHoldMs(0);
    setResult(null);
    setPicked(null);
  }, [qIndex]);

  // Hands-free: auto-advance after answering.
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => {
      lockedRef.current = false;
      setQIndex((i) => i + 1);
    }, 2800);
    return () => window.clearTimeout(id);
  }, [result]);

  if (!question) {
    return (
      <section className="mode-panel">
        <h2>Point Quiz</h2>
        <p className="mode-panel__lead">No questions available yet.</p>
      </section>
    );
  }

  return (
    <div className="point-quiz">
      <video
        ref={videoRef}
        playsInline
        muted
        className="point-quiz__video"
      />

      {/* Corner answers */}
      {CORNERS.map((id) => {
        const active = hover === id || picked === id;
        const isCorrectCorner = !!result && id === question.correct;
        const isWrongPick = result === "wrong" && picked === id;
        return (
          <div
            key={id}
            className={[
              "point-quiz__option",
              `point-quiz__option--${id}`,
              active ? "point-quiz__option--active" : "",
              isCorrectCorner ? "point-quiz__option--correct" : "",
              isWrongPick ? "point-quiz__option--wrong" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="point-quiz__option-label">{question.options[id]}</span>
            {active && !result && (
              <span
                className="point-quiz__hold"
                style={{ ["--hold" as string]: String(holdProgress) }}
              >
                {Math.ceil((HOLD_MS - holdMs) / 1000)}
              </span>
            )}
          </div>
        );
      })}

      {/* Question above head */}
      <div
        className="point-quiz__prompt"
        style={
          head
            ? {
                left: `${head.left + head.width / 2}%`,
                top: `${Math.max(2, head.top - 2)}%`,
              }
            : undefined
        }
        data-anchored={head ? "yes" : "no"}
      >
        <p className="point-quiz__prompt-text">{question.prompt}</p>
        <p className="point-quiz__hint">
          Point at an answer for 5 seconds
        </p>
      </div>

      {/* Finger cursor */}
      {tip && (
        <div
          className="point-quiz__finger"
          style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}
        />
      )}

      <div className="point-quiz__hud">
        <span>
          Score {score.right}/{score.total}
        </span>
        <span>
          Q {qIndex + 1}/{questions.length}
        </span>
      </div>

      {result && (
        <div className={`point-quiz__result point-quiz__result--${result}`}>
          <p>
            {result === "correct"
              ? "Nice — that is right!"
              : "Not quite — next question coming…"}
          </p>
          <p className="muted">Continuing automatically…</p>
        </div>
      )}

      {loading && <p className="camera-status">{status || "Loading…"}</p>}
      {error && <p className="camera-error">{error}</p>}
      {!ready && !error && !loading && (
        <p className="camera-status">Starting camera…</p>
      )}
    </div>
  );
}
