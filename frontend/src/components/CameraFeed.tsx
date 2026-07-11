"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadFaceModels,
  mapBoxToElementPercent,
  startDetectionLoop,
} from "@/lib/faceDetection";
import type { FaceDetectionEvent } from "@/lib/types";

type CameraFeedProps = {
  onDetection: (event: FaceDetectionEvent) => void;
};

/**
 * Webcam + live oval face overlay (face-api.js TinyFaceDetector).
 */
export default function CameraFeed({ onDetection }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectionRef = useRef(onDetection);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [overlay, setOverlay] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  onDetectionRef.current = onDetection;

  useEffect(() => {
    let stopLoop: (() => void) | undefined;
    let stream: MediaStream | undefined;
    let cancelled = false;

    async function setup() {
      try {
        setLoadingModels(true);
        await loadFaceModels();
        if (cancelled) return;
        setLoadingModels(false);

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
        setReady(true);

        stopLoop = startDetectionLoop(video, (event) => {
          const mapped = mapBoxToElementPercent(event.box, video);
          setOverlay(mapped);
          onDetectionRef.current(event);
        });
      } catch (err) {
        setLoadingModels(false);
        setError(
          err instanceof Error ? err.message : "Could not access webcam",
        );
      }
    }

    void setup();

    return () => {
      cancelled = true;
      stopLoop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="camera-feed">
      <video ref={videoRef} playsInline muted className="camera-video" />
      {overlay && (
        <div
          className="face-oval"
          style={{
            left: `${overlay.left}%`,
            top: `${overlay.top}%`,
            width: `${overlay.width}%`,
            height: `${overlay.height}%`,
          }}
          aria-hidden
        />
      )}
      {loadingModels && (
        <p className="camera-status">Loading face models…</p>
      )}
      {!ready && !error && !loadingModels && (
        <p className="camera-status">Starting camera…</p>
      )}
      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}
