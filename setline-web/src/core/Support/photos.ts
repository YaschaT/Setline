// What the Photos port needs from Apple's frameworks: CryptoKit's SHA-256
// (synchronous, as `PhotoOwner.folder` is), ImageIO's EXIF reading, and a
// file system to keep pictures in (`FileManager`), which the web backs with
// IndexedDB or localStorage by setting `FileManager.default`.

// MARK: - SHA-256 (CryptoKit `SHA256.hash(data:)`)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(data: Uint8Array): Uint8Array {
  const length = data.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

// MARK: - EXIF (ImageIO `kCGImagePropertyExifDictionary`)

/**
 * The EXIF `DateTimeOriginal` (0x9003) and `DateTimeDigitized` (0x9004) a
 * picture carries, read from a JPEG's APP1 segment, a PNG's eXIf chunk or a
 * bare TIFF. Undefined when the data is not a picture ImageIO would open in
 * those formats. (HEIC is not read on the web.)
 */
export function exifDates(data: Uint8Array): { original?: string; digitized?: string } | undefined {
  const tiff = exifTIFF(data);
  if (tiff === undefined) return undefined;
  if (tiff === null) return {};
  return readTIFF(tiff) ?? {};
}

/** The TIFF block holding EXIF, `null` for a picture without one, undefined for no picture. */
function exifTIFF(data: Uint8Array): Uint8Array | null | undefined {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan
      if (marker === 0xff) { i += 1; continue; }
      if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
      const size = (data[i + 2] << 8) | data[i + 3];
      if (size < 2 || i + 2 + size > data.length) return null;
      if (marker === 0xe1 && size >= 8) {
        const start = i + 4;
        const header = String.fromCharCode(...data.subarray(start, start + 6));
        if (header === "Exif\0\0") return data.subarray(start + 6, i + 2 + size);
      }
      i += 2 + size;
    }
    return null;
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length >= 8 && png.every((b, k) => data[k] === b)) {
    let i = 8;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    while (i + 8 <= data.length) {
      const size = view.getUint32(i);
      const type = String.fromCharCode(...data.subarray(i + 4, i + 8));
      if (i + 12 + size > data.length) return null;
      if (type === "eXIf") return data.subarray(i + 8, i + 8 + size);
      if (type === "IEND") return null;
      i += 12 + size;
    }
    return null;
  }
  if (data.length >= 8 && ((data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0) || (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0 && data[3] === 0x2a))) {
    return data;
  }
  return undefined;
}

function readTIFF(tiff: Uint8Array): { original?: string; digitized?: string } | undefined {
  if (tiff.length < 8) return undefined;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return undefined;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const entries = (ifd: number): Map<number, { type: number; count: number; at: number }> => {
    const map = new Map<number, { type: number; count: number; at: number }>();
    if (ifd + 2 > tiff.length) return map;
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const at = ifd + 2 + k * 12;
      if (at + 12 > tiff.length) break;
      map.set(u16(at), { type: u16(at + 2), count: u32(at + 4), at: at + 8 });
    }
    return map;
  };
  const ascii = (entry: { type: number; count: number; at: number } | undefined): string | undefined => {
    if (entry === undefined || entry.type !== 2) return undefined;
    const start = entry.count <= 4 ? entry.at : u32(entry.at);
    if (start + entry.count > tiff.length) return undefined;
    let text = "";
    for (let k = 0; k < entry.count; k++) {
      const byte = tiff[start + k];
      if (byte === 0) break;
      text += String.fromCharCode(byte);
    }
    return text;
  };
  const ifd0 = entries(u32(4));
  const pointer = ifd0.get(0x8769);
  if (pointer === undefined) return {};
  const exif = entries(u32(pointer.at));
  return { original: ascii(exif.get(0x9003)), digitized: ascii(exif.get(0x9004)) };
}

// MARK: - Files (`FileManager`)

export class FileError extends Error {
  constructor(readonly kind: "noSuchFile" | "fileExists" | "notADirectory" | "isADirectory", readonly path: string) {
    super(`${kind}: ${path}`);
  }
}

/**
 * The few `FileManager` / `Data` operations the photo stores use, with
 * their failure rules: writing needs the folder to exist, removing a file
 * that is not there throws, and a folder cannot be made where a file is.
 * Paths are `/`-separated.
 *
 * Synchronous, as `FileManager` is. The web keeps the files in a
 * `MemoryFileStore` it fills from persistent browser storage at launch and
 * writes back to after every change.
 */
export interface FileStore {
  fileExists(path: string): boolean;
  /** `Data(contentsOf:)`. Throws when there is no such file. */
  read(path: string): Uint8Array;
  /** `data.write(to:options: .atomic)`. Throws when the folder is missing. */
  write(path: string, data: Uint8Array): void;
  /** `createDirectory(at:withIntermediateDirectories: true)`. */
  createDirectory(path: string): void;
  /** `removeItem(at:)`, folders with everything in them. */
  removeItem(path: string): void;
  /** `copyItem(at:to:)`: throws when the target exists. */
  copyItem(from: string, to: string): void;
  /** `moveItem(at:to:)`: throws when the target exists. */
  moveItem(from: string, to: string): void;
  /** `contentsEqual(atPath:andPath:)`. */
  contentsEqual(a: string, b: string): boolean;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  if (i < 0) return "";
  return i === 0 ? "/" : path.slice(0, i);
}

function normalise(path: string): string {
  const absolute = path.startsWith("/");
  const parts = path.split("/").filter((p) => p !== "" && p !== ".");
  return (absolute ? "/" : "") + parts.join("/");
}

/** A file system held in memory: the tests' disk, and what the web keeps in front of IndexedDB. */
export class MemoryFileStore implements FileStore {
  private files = new Map<string, Uint8Array>();
  private directories = new Set<string>(["/", ""]);

  /** Every file, for writing them back to persistent storage. */
  entries(): [string, Uint8Array][] {
    return [...this.files].map(([path, data]) => [path, data.slice()]);
  }

  fileExists(path: string): boolean {
    const p = normalise(path);
    return this.files.has(p) || this.directories.has(p);
  }

  read(path: string): Uint8Array {
    const p = normalise(path);
    const data = this.files.get(p);
    if (data === undefined) throw new FileError(this.directories.has(p) ? "isADirectory" : "noSuchFile", p);
    return data.slice();
  }

  write(path: string, data: Uint8Array): void {
    const p = normalise(path);
    const parent = parentOf(p);
    if (!this.directories.has(parent)) throw new FileError(this.files.has(parent) ? "notADirectory" : "noSuchFile", p);
    if (this.directories.has(p)) throw new FileError("isADirectory", p);
    this.files.set(p, data.slice());
  }

  createDirectory(path: string): void {
    const p = normalise(path);
    const absolute = p.startsWith("/");
    let current = "";
    for (const part of p.split("/").filter((x) => x !== "")) {
      current = absolute || current !== "" ? `${current}/${part}` : part;
      if (this.files.has(current)) throw new FileError("fileExists", current);
      this.directories.add(current);
    }
  }

  removeItem(path: string): void {
    const p = normalise(path);
    if (this.files.delete(p)) return;
    if (!this.directories.has(p)) throw new FileError("noSuchFile", p);
    const prefix = p.endsWith("/") ? p : `${p}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(prefix)) this.files.delete(key);
    for (const key of [...this.directories]) if (key === p || key.startsWith(prefix)) this.directories.delete(key);
  }

  copyItem(from: string, to: string): void {
    const source = normalise(from);
    const target = normalise(to);
    const data = this.files.get(source);
    if (data === undefined) throw new FileError("noSuchFile", source);
    if (this.fileExists(target)) throw new FileError("fileExists", target);
    this.write(target, data);
  }

  moveItem(from: string, to: string): void {
    this.copyItem(from, to);
    this.files.delete(normalise(from));
  }

  contentsEqual(a: string, b: string): boolean {
    const x = this.files.get(normalise(a));
    const y = this.files.get(normalise(b));
    if (x === undefined || y === undefined) return false;
    return x.length === y.length && x.every((byte, i) => byte === y[i]);
  }
}

/** `FileManager.default`: the web sets its own persistent store here at launch. */
export const FileManager: { default: FileStore } = { default: new MemoryFileStore() };

/** `url.appendingPathComponent(component)`. */
export function appendingPathComponent(base: string, component: string): string {
  return base.endsWith("/") ? base + component : `${base}/${component}`;
}
