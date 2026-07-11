"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadFaceModels,
  startDetectionLoop,
} from "@/lib/faceDetection";
import type { FaceDetectionEvent } from "@/lib/types";

type CameraFeedProps = {
  onDetection: (event: FaceDetectionEvent) => void;
};

/**
 * Webcam video + face-api.js detection loop (stubbed).
 * Wire real detection in lib/faceDetection.ts.
 */
export default function CameraFeed({ onDetection }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopLoop: (() => void) | undefined;
    let stream: MediaStream | undefined;

    async function setup() {
      try {
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        stopLoop = startDetectionLoop(video, onDetection);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not access webcam",
        );
      }
    }

    void setup();

    return () => {
      stopLoop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetection]);

  return (
    <div className="camera-feed">
      <video ref={videoRef} playsInline muted className="camera-video" />
      {!ready && !error && <p className="camera-status">Starting camera…</p>}
      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}
