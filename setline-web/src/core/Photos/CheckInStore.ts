import { Schedule } from "../Engine/Schedule";
import { trimmingWhitespacesAndNewlines, utf8 } from "../Support/nutrition";
import { appendingPathComponent, FileManager } from "../Support/photos";
import { CheckIn } from "./CheckIn";
import { PhotoOwner } from "./PhotoOwner";

/** What `migrateUnownedPhotos()` found, and did. */
export type CheckInStore_UnownedPhotos =
  /** There are none, or they have moved already. */
  | { kind: "none" }
  /** They stay where they are: this owner cannot be shown to own them. */
  | { kind: "leftInPlace" }
  /** Another account claimed them first. They move to it, not here. */
  | { kind: "claimedByAnother" }
  /** Moved into this owner's folder. */
  | { kind: "moved"; value: number }
  /**
   * Not moved this time, and nothing removed: the copy could not be
   * confirmed. The next attempt starts where this one stopped.
   */
  | { kind: "notYet" };

export const CheckInStore_UnownedPhotos = {
  none: { kind: "none" } as CheckInStore_UnownedPhotos,
  leftInPlace: { kind: "leftInPlace" } as CheckInStore_UnownedPhotos,
  claimedByAnother: { kind: "claimedByAnother" } as CheckInStore_UnownedPhotos,
  moved(value: number): CheckInStore_UnownedPhotos { return { kind: "moved", value }; },
  notYet: { kind: "notYet" } as CheckInStore_UnownedPhotos,
};

function encodeIndex(checkIns: CheckIn[]): Uint8Array {
  return utf8(JSON.stringify(checkIns.map(CheckIn.encode)));
}

function decodeIndex(data: Uint8Array): CheckIn[] {
  const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  if (!Array.isArray(json)) throw new Error("typeMismatch");
  return json.map(CheckIn.decode);
}

/**
 * Check-in photos, kept in the app's own container and nowhere else — and
 * within it, apart for every account.
 *
 * The handoff is explicit about this: "Foto's blijven op je toestel tenzij je
 * sync aanzet." There is no sync to turn on, so nothing here is ever uploaded,
 * and none of it goes into the shared account state.
 *
 * Each owner has a folder (`PhotoOwner.folder`) holding its pictures and the
 * list of them. Before photos had owners, the app kept one list for the whole
 * phone at the top of the same place; `migrateUnownedPhotos()` moves it, once,
 * into the folder of the account it can be shown to belong to.
 *
 * On the web the "disk" is `FileManager.default` (see Support/photos.ts),
 * which the app backs with persistent browser storage.
 */
export class CheckInStore {
  readonly owner: PhotoOwner;
  /** Where every owner's folder lives, and where the unowned photos were kept. */
  private readonly root: string;
  private readonly directory: string;
  private readonly index: string;
  private readonly mayAdopt: boolean;

  // iOS serialises every store's disk work behind one `NSLock`, so one
  // account's two stores — after signing out and straight back in — never
  // write over each other. Here each call's disk work runs synchronously,
  // start to finish, which gives the same guarantee.

  /**
   * `mayAdoptUnownedPhotos` is `PhotoOwner.mayAdoptUnownedPhotos(…)`: whether
   * this owner can be shown to own the photos kept before they had owners.
   * `container` defaults to the app's own storage root.
   */
  constructor(a: { owner: PhotoOwner; mayAdoptUnownedPhotos: boolean; container?: string }) {
    const base = a.container ?? "/";
    this.owner = a.owner;
    this.root = appendingPathComponent(base, "CheckIns");
    this.directory = appendingPathComponent(this.root, PhotoOwner.folder(a.owner));
    this.index = appendingPathComponent(this.directory, "check-ins.json");
    this.mayAdopt = a.mayAdoptUnownedPhotos;
  }

  /** This owner's photos, and no one else's. */
  async load(): Promise<CheckIn[]> {
    // Usually done at sign-in already; if that was cut short, now.
    this.migrate();
    return this.stored();
  }

  /**
   * Writes the picture, then the record, so a half-written check-in is a
   * file nobody references rather than a record pointing at nothing.
   */
  async add(data: Uint8Array, a: { on: Date }): Promise<CheckIn[]> {
    FileManager.default.createDirectory(this.directory);

    const id = `checkin-${Math.trunc(Date.now())}`;
    const checkIn = CheckIn.make({ id, date: Schedule.dateKey(a.on), fileName: `${id}.jpg` });
    FileManager.default.write(this.url({ for: checkIn }), data);

    const all = this.stored();
    all.push(checkIn);
    this.save(all);
    return all;
  }

  async remove(checkIn: CheckIn): Promise<CheckIn[]> {
    const remaining = this.stored().filter((c) => c.id !== checkIn.id);
    this.save(remaining);
    try {
      FileManager.default.removeItem(this.url({ for: checkIn }));
    } catch {
      // `try?`: a picture already gone is fine.
    }
    return remaining;
  }

  url(a: { for: CheckIn }): string {
    return appendingPathComponent(this.directory, a.for.fileName);
  }

  // MARK: - The photos kept before they had owners

  /**
   * Moves the photos the app kept for the whole phone into this account's
   * folder — when this account may have them — and only then removes them
   * from where they were.
   *
   * Safe to run any number of times. The claim is written before anything
   * is copied, so a move that is interrupted can only ever be finished by
   * the account that began it. Every picture is copied through a temporary
   * file and compared, the account's list is read back from disk, and only
   * when every photo is there in full do the originals go. A record is
   * added to the account's list once, however often this runs. Dates are
   * kept as they were, so each photo still sits beside its day's weigh-in.
   */
  async migrateUnownedPhotos(): Promise<CheckInStore_UnownedPhotos> {
    return this.migrate();
  }

  private get unownedIndex(): string { return appendingPathComponent(this.root, "check-ins.json"); }
  private get claim(): string { return appendingPathComponent(this.root, "unowned-claimed-by.txt"); }

  private migrate(): CheckInStore_UnownedPhotos {
    const files = FileManager.default;
    if (!files.fileExists(this.unownedIndex)) return CheckInStore_UnownedPhotos.none;
    // A demo account never takes them, whatever else is true.
    if (this.owner.kind !== "account") return CheckInStore_UnownedPhotos.leftInPlace;

    const folder = PhotoOwner.folder(this.owner);
    let claimedBy: string | undefined;
    try {
      claimedBy = trimmingWhitespacesAndNewlines(new TextDecoder("utf-8", { fatal: true }).decode(files.read(this.claim)));
    } catch {
      claimedBy = undefined;
    }
    if (claimedBy !== undefined && claimedBy !== "") {
      if (claimedBy !== folder) return CheckInStore_UnownedPhotos.claimedByAnother;
    } else {
      if (!this.mayAdopt) return CheckInStore_UnownedPhotos.leftInPlace;
      try {
        files.write(this.claim, utf8(folder));
      } catch {
        return CheckInStore_UnownedPhotos.notYet;
      }
    }

    // Unreadable on either side: change nothing rather than guess.
    let unowned: CheckIn[];
    let mine: CheckIn[];
    try {
      unowned = decodeIndex(files.read(this.unownedIndex));
      mine = this.readIndex();
    } catch {
      return CheckInStore_UnownedPhotos.notYet;
    }

    try {
      files.createDirectory(this.directory);
      const moved: CheckIn[] = [];
      for (const record of unowned) {
        const source = appendingPathComponent(this.root, record.fileName);
        const target = this.url({ for: record });
        if (files.fileExists(source)) {
          // A copy from an earlier attempt is kept when it matches.
          if (!(files.contentsEqual(source, target))) {
            this.copy(source, target);
          }
        } else if (!files.fileExists(target)) {
          // No picture anywhere: a record `load()` never showed.
          continue;
        }
        moved.push(record);
        if (!mine.some((c) => c.id === record.id)) mine.push(record);
      }
      this.save(mine);

      const confirmed = this.readIndex();
      for (const record of moved) {
        const source = appendingPathComponent(this.root, record.fileName);
        const target = this.url({ for: record });
        const ok =
          confirmed.some((c) => c.id === record.id) &&
          files.fileExists(target) &&
          (!files.fileExists(source) || files.contentsEqual(source, target));
        if (!ok) return CheckInStore_UnownedPhotos.notYet;
      }

      // Confirmed: the originals go, pictures first, then the list, and
      // the claim last.
      for (const record of unowned) {
        try {
          files.removeItem(appendingPathComponent(this.root, record.fileName));
        } catch {
          // `try?`
        }
      }
      files.removeItem(this.unownedIndex);
      try {
        files.removeItem(this.claim);
      } catch {
        // `try?`
      }
      return CheckInStore_UnownedPhotos.moved(moved.length);
    } catch {
      return CheckInStore_UnownedPhotos.notYet;
    }
  }

  /**
   * Through a temporary file, so a copy cut short is never taken for a
   * finished one.
   */
  private copy(source: string, target: string): void {
    const files = FileManager.default;
    const partial = `${target}.partial`;
    try {
      files.removeItem(partial);
    } catch {
      // `try?`
    }
    files.copyItem(source, partial);
    if (files.fileExists(target)) files.removeItem(target);
    files.moveItem(partial, target);
  }

  // MARK: - The owner's list

  /** The records whose picture is still there. */
  private stored(): CheckIn[] {
    // A record whose picture is gone is not a check-in any more.
    let records: CheckIn[];
    try {
      records = this.readIndex();
    } catch {
      records = [];
    }
    const kept: CheckIn[] = [];
    for (const record of records) if (FileManager.default.fileExists(this.url({ for: record }))) kept.push(record);
    return kept;
  }

  /**
   * No list yet is an empty one; a list that cannot be read is an error, so
   * it is never written over.
   */
  private readIndex(): CheckIn[] {
    if (!FileManager.default.fileExists(this.index)) return [];
    return decodeIndex(FileManager.default.read(this.index));
  }

  private save(checkIns: CheckIn[]): void {
    FileManager.default.createDirectory(this.directory);
    FileManager.default.write(this.index, encodeIndex(checkIns));
    // iOS also marks the root as excluded from backup; a browser has no
    // such flag, and nothing here is ever backed up or uploaded.
  }
}
