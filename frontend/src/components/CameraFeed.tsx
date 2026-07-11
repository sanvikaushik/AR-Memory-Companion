"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadFaceModels,
  mapBoxToElementPercent,
  startDetectionLoop,
} from "@/lib/faceDetection";
import type { Person, TrackedFace } from "@/lib/types";

type CameraFeedProps = {
  onFaces: (faces: TrackedFace[]) => void;
  /** Used to label recognized ovals with a person's name. */
  people?: Person[];
};

type OverlayFace = {
  trackId: number;
  status: TrackedFace["status"];
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Webcam + live multi-face oval overlays (face-api.js TinyFaceDetector).
 * Renders one labeled oval per tracked face.
 */
export default function CameraFeed({ onFaces, people = [] }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFacesRef = useRef(onFaces);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [overlays, setOverlays] = useState<OverlayFace[]>([]);

  onFacesRef.current = onFaces;

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of people) map.set(p.personId, p.name);
    return map;
  }, [people]);
  const nameByIdRef = useRef(nameById);
  nameByIdRef.current = nameById;

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

        stopLoop = startDetectionLoop(video, (faces) => {
          const mapped: OverlayFace[] = faces.map((face) => {
            const box = mapBoxToElementPercent(face.box, video);
            const name = face.personId
              ? nameByIdRef.current.get(face.personId)
              : undefined;
            return {
              trackId: face.trackId,
              status: face.status,
              label:
                face.status === "known"
                  ? name ?? "Recognized"
                  : face.status === "unknown"
                    ? "Unknown"
                    : "…",
              ...box,
            };
          });
          setOverlays(mapped);
          onFacesRef.current(faces);
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
      {overlays.map((face) => (
        <div
          key={face.trackId}
          className={`face-oval face-oval--${face.status}`}
          style={{
            left: `${face.left}%`,
            top: `${face.top}%`,
            width: `${face.width}%`,
            height: `${face.height}%`,
          }}
          aria-hidden
        >
          <span className="face-label">{face.label}</span>
        </div>
      ))}
      {overlays.length > 0 && (
        <span className="face-count">{overlays.length} face(s)</span>
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
