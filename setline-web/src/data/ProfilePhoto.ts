// ProfilePhoto.swift. The avatar's picture, made from whatever the library
// hands over: the centred square at `side` pixels, as JPEG. Undefined when the
// data is not a picture.
export const ProfilePhoto = {
  async square(data: Blob, side = 512): Promise<Blob | undefined> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(data);
    } catch {
      return undefined;
    }
    const edge = Math.min(bitmap.width, bitmap.height);
    if (edge <= 0) return undefined;
    const scale = side / edge;
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), "image/jpeg", 0.85));
  },
};
