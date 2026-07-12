"use client";

import { useEffect, useRef } from "react";
import {
  detectIndexTip,
  loadHandLandmarker,
  type FingerTip,
} from "@/lib/handTracking";

type BackgroundHandTrackerProps = {
  onTip: (tip: FingerTip | null) => void;
  /** When false, release the camera. */
  active?: boolean;
};

/**
 * Invisible camera used only for finger pointing in non-camera modes.
 */
export default function BackgroundHandTracker({
  onTip,
  active = true,
}: BackgroundHandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTipRef = useRef(onTip);
  onTipRef.current = onTip;

  useEffect(() => {
    if (!active) {
      onTipRef.current(null);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | undefined;
    let raf = 0;

    async function setup() {
      try {
        await loadHandLandmarker();
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        const tick = () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2) {
            onTipRef.current(detectIndexTip(v, false));
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        console.warn("[BackgroundHandTracker]", err);
        onTipRef.current(null);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
      onTipRef.current(null);
    };
  }, [active]);

  return (
    <video
      ref={videoRef}
      playsInline
      muted
      className="handsfree-video"
      aria-hidden
    />
  );
}
