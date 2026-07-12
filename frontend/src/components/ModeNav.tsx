"use client";

type AppMode = "live" | "cards" | "album" | "quiz";

type ModeNavProps = {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  quizDisabled?: boolean;
};

const MODES: { id: AppMode; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "cards", label: "Cards" },
  { id: "album", label: "Photos" },
  { id: "quiz", label: "Quiz" },
];

/** Big bottom navigation for wearable / dementia-friendly use. */
export default function ModeNav({ mode, onChange, quizDisabled }: ModeNavProps) {
  return (
    <nav className="mode-nav" aria-label="App modes">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`mode-nav__btn ${mode === item.id ? "mode-nav__btn--active" : ""}`}
          disabled={item.id === "quiz" && quizDisabled}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export type { AppMode };
