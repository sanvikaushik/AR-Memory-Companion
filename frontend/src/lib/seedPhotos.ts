/**
 * Index faces found in backend/seed photos and match them to a live face.
 */
import { listSeedPhotos, type SeedPhotoMeta } from "./api";
import { descriptorFromImage, loadFaceModels } from "./faceDetection";

export type SeedPhotoHit = {
  id: string;
  filename: string;
  url: string;
  distance: number;
};

export type IndexedSeedPhoto = SeedPhotoMeta & {
  descriptors: number[][];
};

const MATCH_DISTANCE = 0.62;

let indexPromise: Promise<IndexedSeedPhoto[]> | null = null;
let indexed: IndexedSeedPhoto[] = [];

function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Detect every face descriptor in a seed photo (multi-face frames included).
 */
async function descriptorsInPhoto(url: string): Promise<number[][]> {
  try {
    const api = await import("face-api.js");
    await loadFaceModels();
    const img = await api.fetchImage(url);
    const options = new api.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.4,
    });
    const results = await api
      .detectAllFaces(img, options)
      .withFaceLandmarks()
      .withFaceDescriptors();
    return results.map((r) => Array.from(r.descriptor));
  } catch (err) {
    console.warn("[seedPhotos] failed to index", url, err);
    return [];
  }
}

/** Load + face-index all seed photos once (cached). */
export async function loadSeedPhotoIndex(
  onProgress?: (done: number, total: number) => void,
): Promise<IndexedSeedPhoto[]> {
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    await loadFaceModels();
    const photos = await listSeedPhotos();
    const out: IndexedSeedPhoto[] = [];
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      onProgress?.(i, photos.length);
      // Prefer multi-face detect; fall back to single if empty.
      let descriptors = await descriptorsInPhoto(photo.url);
      if (descriptors.length === 0) {
        const one = await descriptorFromImage(photo.url);
        if (one) descriptors = [one];
      }
      out.push({ ...photo, descriptors });
    }
    onProgress?.(photos.length, photos.length);
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

/** Seed photos whose frames contain a face matching this live descriptor. */
export function findSeedPhotosForFace(
  descriptor: number[] | null | undefined,
  limit = 24,
): SeedPhotoHit[] {
  if (!descriptor || descriptor.length === 0 || indexed.length === 0) {
    return [];
  }

  const hits: SeedPhotoHit[] = [];
  for (const photo of indexed) {
    let best = Number.POSITIVE_INFINITY;
    for (const ref of photo.descriptors) {
      if (ref.length !== descriptor.length) continue;
      best = Math.min(best, euclidean(descriptor, ref));
    }
    if (best <= MATCH_DISTANCE) {
      hits.push({
        id: photo.id,
        filename: photo.filename,
        url: photo.url,
        distance: best,
      });
    }
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, limit);
}

export function seedIndexSize(): number {
  return indexed.length;
}

export function getIndexedSeedPhotos(): IndexedSeedPhoto[] {
  return indexed;
}
