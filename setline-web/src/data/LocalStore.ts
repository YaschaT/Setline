// LocalStore.swift. The device's copy of the training state, and the app's
// source of truth while offline: one row per account, holding what this
// device shows plus the changes it still has to send.
//
// iOS keeps the rows in SwiftData; here they live in IndexedDB. The rows are
// read into memory once at launch (`LocalStore.open()`), so reads are as
// immediate as on iOS, and every write goes to memory first and IndexedDB
// right after.
import { LegacyState } from "../core/Legacy/LegacyState";

export interface StoredState {
  /** The account this data belongs to, so one account never inherits another's sessions. */
  ownerEmail: string;
  /** What this device shows: the last stored state it knows, with its own pending changes applied on top. */
  blob: string;
  updatedAt: number;
  /** Set while this device holds changes the account does not have yet. */
  hasPendingChanges: boolean;
  /** Those changes, oldest first, encoded as the Swift `StateChange.encoder` writes them. */
  pendingChanges?: string;
  /** When a row from before recorded changes still held unsynced work. */
  recoverySince?: number;
  lastSyncedAt?: number;
}

const DB = "setline";
const STORE = "storedState";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "ownerEmail" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class LocalStore {
  private constructor(
    private readonly db: IDBDatabase | undefined,
    private readonly rows: Map<string, StoredState>,
  ) {}

  static async open(): Promise<LocalStore> {
    try {
      const db = await openDB();
      const rows = await new Promise<StoredState[]>((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result as StoredState[]);
        request.onerror = () => reject(request.error);
      });
      return new LocalStore(db, new Map(rows.map((r) => [r.ownerEmail, r])));
    } catch {
      // No IndexedDB (private mode): the app still works, for this visit only.
      return new LocalStore(undefined, new Map());
    }
  }

  private row(email: string): StoredState | undefined {
    return this.rows.get(email.toLowerCase());
  }

  private persist(row: StoredState): void {
    this.rows.set(row.ownerEmail, row);
    if (!this.db) return;
    try {
      this.db.transaction(STORE, "readwrite").objectStore(STORE).put(row);
    } catch {
      /* quota or closed: memory still holds it for this visit */
    }
  }

  /** Every account this device keeps data for. */
  accountEmails(): string[] {
    return [...this.rows.keys()];
  }

  load(email: string): LegacyState | undefined {
    const row = this.row(email);
    if (!row) return undefined;
    try {
      return LegacyState.fromData(row.blob);
    } catch {
      return undefined;
    }
  }

  /** The encoded pending changes, or undefined. */
  pendingChangesData(email: string): string | undefined {
    return this.row(email)?.pendingChanges;
  }

  lastSyncedAt(email: string): Date | undefined {
    const at = this.row(email)?.lastSyncedAt;
    return at === undefined ? undefined : new Date(at);
  }

  /** Unsynced work saved before changes were recorded, if this device has any. Marked once. */
  unrecordedWork(email: string): { state: LegacyState; savedAt: Date } | undefined {
    const row = this.row(email);
    if (!row) return undefined;
    let state: LegacyState;
    try {
      state = LegacyState.fromData(row.blob);
    } catch {
      return undefined;
    }
    if (row.recoverySince !== undefined) return { state, savedAt: new Date(row.recoverySince) };
    if (!row.hasPendingChanges || row.pendingChanges !== undefined) return undefined;
    this.persist({ ...row, recoverySince: row.updatedAt });
    return { state, savedAt: new Date(row.updatedAt) };
  }

  /** Saves what the device shows and the changes it still has to send. */
  save(state: LegacyState, pending: { encoded: string; count: number }, email: string): void {
    this.write(state, pending, undefined, email);
  }

  /** After a sync: the stored state as the account now has it, plus any changes made while the sync ran. */
  markSynced(state: LegacyState, pending: { encoded: string; count: number }, at: Date, email: string): void {
    this.write(state, pending, at, email);
  }

  private write(state: LegacyState, pending: { encoded: string; count: number }, syncedAt: Date | undefined, email: string): void {
    const existing = this.row(email);
    const lowered = email.toLowerCase();
    const row: StoredState = existing
      ? {
          ...existing,
          blob: LegacyState.encoded(state),
          updatedAt: Date.now(),
          hasPendingChanges: pending.count > 0,
          pendingChanges: pending.encoded,
          ...(syncedAt ? { lastSyncedAt: syncedAt.getTime(), recoverySince: undefined } : {}),
        }
      : {
          ownerEmail: lowered,
          blob: LegacyState.encoded(state),
          updatedAt: Date.now(),
          hasPendingChanges: pending.count > 0,
          pendingChanges: pending.encoded,
          lastSyncedAt: syncedAt?.getTime(),
        };
    this.persist(row);
  }
}
