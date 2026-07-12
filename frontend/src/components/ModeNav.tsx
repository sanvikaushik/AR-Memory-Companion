"use client";

import { useEffect, useRef, useState } from "react";
import type { FingerTip } from "@/lib/handTracking";

export type AppMode = "live" | "cards" | "album" | "quiz" | "game";

type ModeNavProps = {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  tip: FingerTip | null;
  /** Extra hint text under the nav. */
};

const MODES: { id: AppMode; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "game", label: "Point" },
  { id: "cards", label: "Cards" },
  { id: "album", label: "Photos" },
  { id: "quiz", label: "Quiz" },
];

const DWELL_MS = 2200;

/**
 * Map fingertip (0–1, mirrored) to a nav tab.
 * In Point game, only the center-bottom strip exits to Live (corners are answers).
 */
export function modeFromTip(
  tip: FingerTip | null,
  current: AppMode,
): AppMode | null {
  if (!tip || tip.y < 0.84) return null;
  if (current === "game") {
    if (tip.x > 0.32 && tip.x < 0.68) return "live";
    return null;
  }
  const idx = Math.min(MODES.length - 1, Math.floor(tip.x * MODES.length));
  return MODES[idx].id;
}

/** Hands-free bottom nav — point at a tab for ~2 seconds to switch. */
export default function ModeNav({ mode, onChange, tip }: ModeNavProps) {
  const [hover, setHover] = useState<AppMode | null>(null);
  const [holdMs, setHoldMs] = useState(0);
  const hoverRef = useRef<AppMode | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const lockedRef = useRef(false);

  useEffect(() => {
    const target = modeFromTip(tip, mode);
    const now = performance.now();

    if (!target) {
      hoverRef.current = null;
      holdStartRef.current = null;
      lockedRef.current = false;
      setHover(null);
      setHoldMs(0);
      return;
    }

    if (target === mode) {
      hoverRef.current = target;
      holdStartRef.current = null;
      setHover(target);
      setHoldMs(0);
      return;
    }

    if (hoverRef.current !== target) {
      hoverRef.current = target;
      holdStartRef.current = now;
      lockedRef.current = false;
      setHover(target);
      setHoldMs(0);
      return;
    }

    if (holdStartRef.current != null && !lockedRef.current) {
      const elapsed = now - holdStartRef.current;
      setHoldMs(elapsed);
      if (elapsed >= DWELL_MS) {
        lockedRef.current = true;
        onChange(target);
      }
    }
  }, [tip, mode, onChange]);

  const progress = Math.min(1, holdMs / DWELL_MS);

  return (
    <nav className="mode-nav mode-nav--handsfree" aria-label="App modes">
      {MODES.map((item) => {
        const isHover = hover === item.id && item.id !== mode;
        return (
          <div
            key={item.id}
            className={[
              "mode-nav__btn",
              mode === item.id ? "mode-nav__btn--active" : "",
              isHover ? "mode-nav__btn--dwell" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={mode === item.id ? "page" : undefined}
          >
            <span>{item.label}</span>
            {isHover && (
              <span
                className="mode-nav__dwell"
                style={{ ["--hold" as string]: String(progress) }}
              />
            )}
          </div>
        );
      })}
      <p className="mode-nav__hint">
        {mode === "game"
          ? "Point center-bottom for Live"
          : "Point at a tab for 2 seconds"}
      </p>
    </nav>
  );
}

export { MODES };
