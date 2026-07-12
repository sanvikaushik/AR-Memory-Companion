"use client";

import { useEffect, useRef } from "react";

/** Soft spoken greeting once per person appearance. */
export function useVoiceGreeting(
  personName: string | null | undefined,
  enabled = true,
): void {
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !personName) {
      if (!personName) lastSpokenRef.current = null;
      return;
    }
    if (lastSpokenRef.current === personName) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    lastSpokenRef.current = personName;
    const utter = new SpeechSynthesisUtterance(
      `${personName.split(" ")[0]} is here with you.`,
    );
    utter.rate = 0.9;
    utter.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [personName, enabled]);
}
