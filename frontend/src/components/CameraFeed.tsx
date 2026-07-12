"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTrackDescriptor,
  loadFaceModels,
  mapBoxToElementPercent,
  startDetectionLoop,
} from "@/lib/faceDetection";
import {
  getCacheWhoIndex,
  loadCacheWhoIndex,
  matchCacheWho,
  type IndexedCacheWho,
} from "@/lib/cacheWho";
import type { Person, TrackedFace } from "@/lib/types";
import {
  detectIndexTip,
  loadHandLandmarker,
  type FingerTip,
} from "@/lib/handTracking";

type CameraFeedProps = {
  onFaces: (faces: TrackedFace[]) => void;
  onMatchedPeople?: (people: Person[]) => void;
  onTip?: (tip: FingerTip | null) => void;
};

type OverlayFace = {
  trackId: number;
  known: boolean;
  name: string;
  relationship: string;
  headline: string;
  fact: string;
  left: number;
  top: number;
  size: number;
};

function profileToPerson(profile: IndexedCacheWho): Person {
  const appearanceSummary =
    typeof profile.appearance?.summary === "string"
      ? profile.appearance.summary
      : "";
  return {
    personId: profile.personId,
    name: profile.fullName || profile.name,
    relationship: profile.relationship || "friend",
    headline: profile.headline,
    linkedinUrl: "",
    photo: profile.imageUrl,
    photos: [profile.imageUrl],
    facts: profile.facts,
    cues: [
      ...(appearanceSummary ? [appearanceSummary] : []),
      ...profile.cues,
    ],
    comfortTips: [],
    conversationHistory: [],
    spacedRetrievalState: {},
    descriptors: profile.descriptors,
    descriptor: profile.descriptors[0] ?? [],
  };
}

/**
 * Webcam + face circles.
 * Matches live faces only against backend/seed/Cache_who.
 * No match → "Unknown person".
 */
export default function CameraFeed({
  onFaces,
  onMatchedPeople,
  onTip,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFacesRef = useRef(onFaces);
  const onMatchedRef = useRef(onMatchedPeople);
  const onTipRef = useRef(onTip);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [indexStatus, setIndexStatus] = useState("Loading Cache_who…");
  const [overlays, setOverlays] = useState<OverlayFace[]>([]);
  const lockedPersonRef = useRef<Map<number, string>>(new Map());
  const [camRetry, setCamRetry] = useState(0);

  onFacesRef.current = onFaces;
  onMatchedRef.current = onMatchedPeople;
  onTipRef.current = onTip;

  useEffect(() => {
    let stopLoop: (() => void) | undefined;
    let stream: MediaStream | undefined;
    let cancelled = false;

    async function openCamera(): Promise<MediaStream> {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
    }

    function friendlyCamError(err: unknown): string {
      const name = err instanceof DOMException ? err.name : "";
      const msg = err instanceof Error ? err.message : String(err);
      if (
        name === "NotReadableError" ||
        /Could not start video source/i.test(msg)
      ) {
        return (
          "Camera is busy. Close the Cursor browser preview (or any other tab/app using the webcam), then tap Retry."
        );
      }
      if (name === "NotAllowedError" || /Permission/i.test(msg)) {
        return "Camera permission blocked in Edge. Allow camera for localhost, then tap Retry.";
      }
      return msg || "Could not start camera";
    }

    async function setup() {
      try {
        setError(null);
        setReady(false);
        setLoadingModels(true);
        await loadFaceModels();
        try {
          await loadHandLandmarker();
        } catch (err) {
          console.warn("[CameraFeed] hands unavailable", err);
        }
        if (cancelled) return;

        try {
          await loadCacheWhoIndex((done, total) => {
            if (!cancelled) {
              setIndexStatus(
                total === 0
                  ? "No Cache_who profiles found"
                  : `Indexing Cache_who ${done}/${total}…`,
              );
            }
          });
          if (!cancelled) setIndexStatus("");
        } catch (err) {
          console.warn("[CameraFeed] Cache_who index failed", err);
          if (!cancelled) setIndexStatus("Cache_who unavailable");
        }

        if (cancelled) return;
        setLoadingModels(false);

        stream = await openCamera();
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        stopLoop = startDetectionLoop(video, (faces) => {
          onTipRef.current?.(detectIndexTip(video, true));

          const matchedPeople = new Map<string, Person>();

          const mapped: OverlayFace[] = faces.map((face) => {
            const mappedBox = mapBoxToElementPercent(face.box, video);
            const size = Math.max(mappedBox.width, mappedBox.height) * 0.38;
            const cx = mappedBox.left + mappedBox.width / 2;
            const cy = mappedBox.top + mappedBox.height / 2;
            const left = cx - size / 2;
            const top = cy - size / 2;

            const descriptor = getTrackDescriptor(face.trackId);
            const hit = matchCacheWho(descriptor);

            if (hit) {
              lockedPersonRef.current.set(face.trackId, hit.profile.personId);
            }

            let profile: IndexedCacheWho | null = hit?.profile ?? null;
            if (!profile) {
              const lockedId = lockedPersonRef.current.get(face.trackId);
              if (lockedId) {
                profile =
                  getCacheWhoIndex().find((p) => p.personId === lockedId) ??
                  null;
              }
            }

            if (profile) {
              matchedPeople.set(profile.personId, profileToPerson(profile));
              lockedPersonRef.current.set(face.trackId, profile.personId);
            }

            if (!profile) {
              return {
                trackId: face.trackId,
                known: false,
                name: "Unknown person",
                relationship: "",
                headline: "",
                fact: "",
                left,
                top,
                size,
              };
            }

            const appearance =
              typeof profile.appearance?.summary === "string"
                ? profile.appearance.summary
                : "";

            return {
              trackId: face.trackId,
              known: true,
              name: profile.fullName || profile.name,
              relationship: profile.relationship,
              headline: profile.headline,
              fact: appearance || profile.facts[0] || profile.cues[0] || "",
              left,
              top,
              size,
            };
          });

          const activeIds = new Set(faces.map((f) => f.trackId));
          for (const id of [...lockedPersonRef.current.keys()]) {
            if (!activeIds.has(id)) lockedPersonRef.current.delete(id);
          }

          setOverlays(mapped);
          onMatchedRef.current?.(Array.from(matchedPeople.values()));

          const enriched: TrackedFace[] = faces.map((face) => {
            const overlay = mapped.find((o) => o.trackId === face.trackId);
            const personId = lockedPersonRef.current.get(face.trackId) ?? null;
            return {
              ...face,
              status: overlay?.known ? "known" : "unknown",
              personId: overlay?.known ? personId : null,
            };
          });
          onFacesRef.current(enriched);
        });
      } catch (err) {
        if (!cancelled) {
          setError(friendlyCamError(err));
          setLoadingModels(false);
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;
      stopLoop?.();
      stream?.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [camRetry]);

  // Hands-free: auto-retry camera if it fails.
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setCamRetry((n) => n + 1), 3500);
    return () => window.clearTimeout(id);
  }, [error]);

  return (
    <div className="camera-feed">
      <video ref={videoRef} playsInline muted className="camera-video" />
      {overlays.map((face) => (
        <div
          key={face.trackId}
          className={`face-circle ${face.known ? "face-circle--known" : "face-circle--unknown"}`}
          style={{
            left: `${face.left}%`,
            top: `${face.top}%`,
            width: `${face.size}%`,
            height: `${face.size}%`,
          }}
          aria-hidden
        >
          <div className="face-forehead">
            <p className="face-forehead__name">{face.name}</p>
            {face.relationship ? (
              <p className="face-forehead__meta">Your {face.relationship}</p>
            ) : null}
            {face.headline ? (
              <p className="face-forehead__meta">{face.headline}</p>
            ) : null}
            {face.fact ? (
              <p className="face-forehead__fact">{face.fact}</p>
            ) : null}
          </div>
        </div>
      ))}
      {overlays.length > 0 && (
        <span className="face-count">{overlays.length} face(s)</span>
      )}
      {loadingModels && (
        <p className="camera-status">
          {indexStatus || "Loading face models…"}
        </p>
      )}
      {!ready && !error && !loadingModels && (
        <p className="camera-status">Starting camera…</p>
      )}
      {error && (
        <div className="camera-error-box">
          <p className="camera-error">{error}</p>
          <p className="muted">Retrying automatically…</p>
        </div>
      )}
    </div>
  );
}
