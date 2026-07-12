/**
 * Cache_who identity index: JSON profile + face photo → live match.
 */
import { listCacheWho, type CacheWhoProfile } from "./api";
import { descriptorFromImage, loadFaceModels } from "./faceDetection";

export type IndexedCacheWho = CacheWhoProfile & {
  descriptors: number[][];
};

/** Align with faceDetection FaceMatcher threshold so Live labels stay in sync. */
const MATCH_DISTANCE = 0.6;

let indexPromise: Promise<IndexedCacheWho[]> | null = null;
let indexed: IndexedCacheWho[] = [];

/** Drop cached index so the next loadCacheWhoIndex() rebuilds descriptors. */
export function resetCacheWhoIndex(): void {
  indexPromise = null;
  indexed = [];
}

function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

async function descriptorsInPhoto(url: string): Promise<number[][]> {
  try {
    const api = await import("face-api.js");
    await loadFaceModels();
    const img = await api.fetchImage(url);
    const options = new api.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.35,
    });
    const results = await api
      .detectAllFaces(img, options)
      .withFaceLandmarks()
      .withFaceDescriptors();
    if (results.length > 0) {
      return results.map((r) => Array.from(r.descriptor));
    }
    const one = await descriptorFromImage(url);
    return one ? [one] : [];
  } catch (err) {
    console.warn("[cacheWho] failed to index", url, err);
    return [];
  }
}

async function buildIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<IndexedCacheWho[]> {
  await loadFaceModels();
  const profiles = await listCacheWho();
  const out: IndexedCacheWho[] = [];
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    onProgress?.(i, profiles.length);
    const descriptors = await descriptorsInPhoto(profile.imageUrl);
    if (descriptors.length === 0) {
      console.warn(
        `[cacheWho] no face descriptor for ${profile.personId} (${profile.imageUrl})`,
      );
    }
    out.push({ ...profile, descriptors });
  }
  onProgress?.(profiles.length, profiles.length);
  indexed = out;
  const withFaces = out.filter((p) => p.descriptors.length > 0).length;
  console.info(
    `[cacheWho] indexed ${withFaces}/${out.length} profile(s) with face descriptors`,
  );
  return out;
}

/** Load Cache_who JSON + face-index each linked photo (cached). */
export async function loadCacheWhoIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<IndexedCacheWho[]> {
  if (indexPromise) return indexPromise;

  indexPromise = buildIndex(onProgress);

  try {
    const out = await indexPromise;
    // Hot-reload can cache an empty index; rebuild once if every photo failed.
    const usable = out.some((p) => p.descriptors.length > 0);
    if (!usable && out.length > 0) {
      console.warn("[cacheWho] empty descriptor index — retrying once");
      resetCacheWhoIndex();
      indexPromise = buildIndex(onProgress);
      return await indexPromise;
    }
    return out;
  } catch (err) {
    indexPromise = null;
    throw err;
  }
}

export function getCacheWhoIndex(): IndexedCacheWho[] {
  return indexed;
}

export function profileFromCacheWhoId(
  personId: string | null | undefined,
): IndexedCacheWho | null {
  if (!personId) return null;
  return indexed.find((p) => p.personId === personId) ?? null;
}

/** Best Cache_who match for a live face descriptor, or null if unknown. */
export function matchCacheWho(
  descriptor: number[] | null | undefined,
): { profile: IndexedCacheWho; distance: number } | null {
  if (!descriptor || descriptor.length === 0 || indexed.length === 0) {
    return null;
  }

  let best: IndexedCacheWho | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const profile of indexed) {
    for (const ref of profile.descriptors) {
      if (ref.length !== descriptor.length) continue;
      const d = euclidean(descriptor, ref);
      if (d < bestDist) {
        bestDist = d;
        best = profile;
      }
    }
  }

  if (!best || bestDist > MATCH_DISTANCE) return null;
  return { profile: best, distance: bestDist };
}
