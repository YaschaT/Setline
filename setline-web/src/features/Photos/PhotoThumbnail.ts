// PhotoThumbnail.swift — a picture read at the size it is shown, not the size
// it was taken: a 12-megapixel photo decoded whole for a 350-point frame costs
// the memory and time that sliding between two pictures, or stepping through
// all of them, cannot spare.
//
// Web: the picture is a file in `FileManager.default` (IndexedDB-backed); the
// result is an object URL of the downscaled JPEG.
import { FileManager } from "../../core/Support/photos";

const cache = new Map<string, string>();

export const PhotoThumbnail = {
  /** The picture at `url`, upright, its longest side at most `maxPixels`. Undefined when there is no picture there. */
  async load(url: string, a: { maxPixels: number }): Promise<string | undefined> {
    const key = `${a.maxPixels}|${url}`;
    const known = cache.get(key);
    if (known) return known;
    let data: Uint8Array;
    try {
      data = FileManager.default.read(url);
    } catch {
      return undefined;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([data as BlobPart]), { imageOrientation: "from-image" });
    } catch {
      return undefined;
    }
    const scale = Math.min(1, a.maxPixels / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return undefined;
    const made = URL.createObjectURL(blob);
    cache.set(key, made);
    return made;
  },

  /** A picture removed from the device leaves no thumbnail behind. */
  forget(url: string): void {
    for (const [key, made] of [...cache]) {
      if (key.endsWith(`|${url}`)) {
        URL.revokeObjectURL(made);
        cache.delete(key);
      }
    }
  },
};
