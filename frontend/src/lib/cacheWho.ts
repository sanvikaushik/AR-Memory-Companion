/**
 * Cache_who identity index: JSON profile + face photo → live match.
 */
import { listCacheWho, type CacheWhoProfile } from "./api";
import { descriptorFromImage, loadFaceModels } from "./faceDetection";

export type IndexedCacheWho = CacheWhoProfile & {
  descriptors: number[][];
};

const MATCH_DISTANCE = 0.58;

let indexPromise: Promise<IndexedCacheWho[]> | null = null;
let indexed: IndexedCacheWho[] = [];

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

/** Load Cache_who JSON + face-index each linked photo (cached). */
export async function loadCacheWhoIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<IndexedCacheWho[]> {
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    await loadFaceModels();
    const profiles = await listCacheWho();
    const out: IndexedCacheWho[] = [];
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      onProgress?.(i, profiles.length);
      const descriptors = await descriptorsInPhoto(profile.imageUrl);
      out.push({ ...profile, descriptors });
    }
    onProgress?.(profiles.length, profiles.length);
    indexed = out;
    return out;
  })();

  try {
    return await indexPromise;
  } catch (err) {
    indexPromise = null;
    throw err;
  }
}

export function getCacheWhoIndex(): IndexedCacheWho[] {
  return indexed;
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
