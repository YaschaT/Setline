// PatchNotes — the store behind "What's new" and the dot on Settings. One
// list for both apps: public/patch-notes.json ships with the site, and the
// iPhone app reads the same file from the live site.
import { useEffect, useSyncExternalStore } from "react";

export interface PatchNote {
  id: string;
  /** `yyyy-MM-dd`. */
  date: string;
  title: string;
  items: string[];
}

const seenKey = "setline.patchNotes.seen";

const readSeen = (): string | undefined => {
  try {
    return localStorage.getItem(seenKey) ?? undefined;
  } catch {
    return undefined;
  }
};

let notes: PatchNote[] | undefined;
let seen = readSeen();
let loading: Promise<void> | undefined;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

export const PatchNotes = {
  /** Fetched once per launch; a failed fetch leaves the list empty and quiet. */
  load(): Promise<void> {
    loading ??= fetch("/patch-notes.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((json: { notes?: PatchNote[] } | undefined) => {
        notes = json?.notes ?? [];
        changed();
      })
      .catch(() => {
        loading = undefined;
      });
    return loading;
  },

  get notes(): PatchNote[] {
    return notes ?? [];
  },

  /** A newer update than the one last opened on this device. */
  get hasUnseen(): boolean {
    const latest = notes?.[0]?.id;
    return latest !== undefined && latest !== seen;
  },

  markSeen(): void {
    const latest = notes?.[0]?.id;
    if (latest === undefined || latest === seen) return;
    seen = latest;
    try {
      localStorage.setItem(seenKey, latest);
    } catch {
      /* private mode: the dot simply comes back next launch */
    }
    changed();
  },

  /** "30 October". */
  dateLabel(date: string): string {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  },
};

/** Re-renders when the notes arrive or are read; loads them on first use. */
export function usePatchNotes() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  useEffect(() => {
    void PatchNotes.load();
  }, []);
  return PatchNotes;
}
