"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SeedPhotoSlideshow from "@/components/SeedPhotoSlideshow";
import {
  getTrackDescriptor,
  loadFaceModels,
  mapBoxToElementPercent,
  startDetectionLoop,
} from "@/lib/faceDetection";
import {
  findSeedPhotosForFace,
  loadSeedPhotoIndex,
  type SeedPhotoHit,
} from "@/lib/seedPhotos";
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

type LockedAlbum = {
  trackId: number;
  personName: string;
  hits: SeedPhotoHit[];
  faceLeft: number;
  faceTop: number;
  faceHeight: number;
};

/**
 * Webcam + live multi-face oval overlays.
 * After a face is identified, matching seed photos play one-at-a-time on the left.
 */
export default function CameraFeed({ onFaces, people = [] }: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFacesRef = useRef(onFaces);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [seedStatus, setSeedStatus] = useState("Indexing seed photos…");
  const [overlays, setOverlays] = useState<OverlayFace[]>([]);
  const [album, setAlbum] = useState<LockedAlbum | null>(null);
  const lockedHitsRef = useRef<Map<number, SeedPhotoHit[]>>(new Map());

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

        try {
          await loadSeedPhotoIndex((done, total) => {
            if (!cancelled) {
              setSeedStatus(
                total === 0
                  ? "No photos in backend/seed"
                  : `Indexing seed photos ${done}/${total}…`,
              );
            }
          });
          if (!cancelled) setSeedStatus("");
        } catch (err) {
          console.warn("[CameraFeed] seed index failed", err);
          if (!cancelled) setSeedStatus("Seed photo index unavailable");
        }

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
          const activeIds = new Set(faces.map((f) => f.trackId));
          for (const id of [...lockedHitsRef.current.keys()]) {
            if (!activeIds.has(id)) lockedHitsRef.current.delete(id);
          }

          const mapped: OverlayFace[] = faces.map((face) => {
            const box = mapBoxToElementPercent(face.box, video);
            const name = face.personId
              ? nameByIdRef.current.get(face.personId)
              : undefined;
            const label =
              name ??
              (face.gender === "female"
                ? "Sanvi Kaushik"
                : face.gender === "male"
                  ? "Ishaan Chandra"
                  : face.status);

            // Lock seed matches once we have a solid live descriptor.
            const descriptor = getTrackDescriptor(face.trackId);
            if (descriptor && !lockedHitsRef.current.has(face.trackId)) {
              const hits = findSeedPhotosForFace(descriptor);
              if (hits.length > 0) {
                lockedHitsRef.current.set(face.trackId, hits);
              }
            }

            return {
              trackId: face.trackId,
              status: face.status,
              label,
              left: box.x * 100,
              top: box.y * 100,
              width: box.width * 100,
              height: box.height * 100,
            };
          });
          setOverlays(mapped);

          // Prefer the first face that has locked seed hits (usually Ishaan/Sanvi).
          const primary =
            mapped.find((f) => lockedHitsRef.current.has(f.trackId)) ??
            mapped[0] ??
            null;
          if (primary && lockedHitsRef.current.has(primary.trackId)) {
            setAlbum({
              trackId: primary.trackId,
              personName: primary.label,
              hits: lockedHitsRef.current.get(primary.trackId) ?? [],
              faceLeft: primary.left,
              faceTop: primary.top,
              faceHeight: primary.height,
            });
          } else {
            setAlbum(null);
          }

          onFacesRef.current(faces);
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not start camera",
          );
          setLoadingModels(false);
        }
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
      {album && album.hits.length > 0 && (
        <SeedPhotoSlideshow
          hits={album.hits}
          faceLeft={album.faceLeft}
          faceTop={album.faceTop}
          faceHeight={album.faceHeight}
          personName={album.personName}
        />
      )}
      {overlays.length > 0 && (
        <span className="face-count">{overlays.length} face(s)</span>
      )}
      {loadingModels && (
        <p className="camera-status">
          {seedStatus || "Loading face models…"}
        </p>
      )}
      {!ready && !error && !loadingModels && (
        <p className="camera-status">Starting camera…</p>
      )}
      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}
