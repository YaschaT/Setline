// The web's disk for progress photos: `FileManager.default` (core
// Support/photos.ts) backed by IndexedDB, so check-ins stay on this device
// as they do on the iPhone and are never uploaded.
//
// The core's stores read and write synchronously, as FileManager does, so
// the files are held in memory (`MemoryFileStore`), read from IndexedDB once
// (`PhotoFiles.install()`), and every change is written back right after.
import { FileManager, MemoryFileStore } from "../core/Support/photos";

const DB = "setline-photos";
const STORE = "files";

function openDB(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const normalise = (path: string) => {
  const absolute = path.startsWith("/");
  return (absolute ? "/" : "") + path.split("/").filter((p) => p !== "" && p !== ".").join("/");
};

const parentOf = (path: string) => {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
};

/** A `MemoryFileStore` that writes every change through to IndexedDB. */
class PersistentFileStore extends MemoryFileStore {
  constructor(private readonly db: IDBDatabase | undefined) {
    super();
  }

  private put(path: string, data: Uint8Array): void {
    if (!this.db) return;
    try {
      this.db.transaction(STORE, "readwrite").objectStore(STORE).put(data.slice(), normalise(path));
    } catch {
      /* quota or closed: memory still holds it for this visit */
    }
  }

  private drop(paths: string[]): void {
    if (!this.db || paths.length === 0) return;
    try {
      const store = this.db.transaction(STORE, "readwrite").objectStore(STORE);
      for (const p of paths) store.delete(p);
    } catch {
      /* ignore */
    }
  }

  /** Fills memory from what IndexedDB holds, without writing anything back. */
  load(path: string, data: Uint8Array): void {
    super.createDirectory(parentOf(path));
    super.write(path, data);
  }

  override write(path: string, data: Uint8Array): void {
    super.write(path, data);
    this.put(path, data);
  }

  override removeItem(path: string): void {
    const p = normalise(path);
    const prefix = p.endsWith("/") ? p : `${p}/`;
    const gone = this.entries()
      .map(([key]) => key)
      .filter((key) => key === p || key.startsWith(prefix));
    super.removeItem(path);
    this.drop(gone);
  }

  override moveItem(from: string, to: string): void {
    super.moveItem(from, to);
    this.drop([normalise(from)]);
  }
}

let installing: Promise<void> | undefined;

export const PhotoFiles = {
  /**
   * Puts the persistent store in place of the in-memory one, once. Await it
   * before reading check-ins; calling it again returns the same promise.
   */
  install(): Promise<void> {
    installing ??= (async () => {
      const db = await openDB();
      const store = new PersistentFileStore(db);
      if (db) {
        const rows = await new Promise<[string, Uint8Array][]>((resolve) => {
          try {
            const out: [string, Uint8Array][] = [];
            const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) return resolve(out);
              const value = cursor.value as Uint8Array | ArrayBuffer;
              out.push([String(cursor.key), value instanceof Uint8Array ? value : new Uint8Array(value)]);
              cursor.continue();
            };
            request.onerror = () => resolve(out);
          } catch {
            resolve([]);
          }
        });
        for (const [path, data] of rows) {
          try {
            store.load(path, data);
          } catch {
            /* a path that no longer fits: skip it */
          }
        }
      }
      // Anything written before the store was ready (this visit only) moves over.
      const before = FileManager.default;
      if (before instanceof MemoryFileStore) {
        for (const [path, data] of before.entries()) {
          if (!store.fileExists(path)) {
            try {
              store.createDirectory(parentOf(path));
              store.write(path, data);
            } catch {
              /* skip */
            }
          }
        }
      }
      FileManager.default = store;
    })();
    return installing;
  },
};
