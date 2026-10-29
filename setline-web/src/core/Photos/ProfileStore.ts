import {
  componentsSeparatedByNewlines,
  dropFirstChars,
  graphemes,
  isLetterChar,
  isWhitespaceChar,
  prefixChars,
  splitChars,
  trimmingWhitespaces,
  utf8,
} from "../Support/nutrition";
import { appendingPathComponent, FileManager } from "../Support/photos";
import { PhotoOwner } from "./PhotoOwner";

function cleaned(text: string): string | undefined {
  const trimmed = trimmingWhitespaces(componentsSeparatedByNewlines(text).join(" "));
  return trimmed === "" ? undefined : prefixChars(trimmed, 60);
}

/**
 * The name and picture an account shows on this phone: the greeting and the
 * avatar on Training, and the head of Account.
 *
 * Like the check-in photos they stay in the app's own container, apart for
 * every account (`PhotoOwner.folder`), and are never uploaded or written into
 * the shared account state — there is nowhere on the server to keep them.
 * Signing out closes them; nothing is deleted.
 *
 * On the web the container is `FileManager.default` (see Support/photos.ts).
 */
export class ProfileStore {
  readonly owner: PhotoOwner;
  private readonly directory: string;

  constructor(a: { owner: PhotoOwner; container?: string }) {
    const base = a.container ?? "/";
    this.owner = a.owner;
    this.directory = appendingPathComponent(appendingPathComponent(base, "Profile"), PhotoOwner.folder(a.owner));
  }

  private get nameFile(): string { return appendingPathComponent(this.directory, "name.txt"); }
  private get photoFile(): string { return appendingPathComponent(this.directory, "photo.jpg"); }

  /** The name as it was typed, or nil when none was. */
  name(): string | undefined {
    let text: string;
    try {
      const data = FileManager.default.read(this.nameFile);
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return undefined;
    }
    return cleaned(text);
  }

  /** Keeps a name; an empty one removes it. */
  setName(name: string): void {
    const value = cleaned(name);
    if (value === undefined) {
      this.remove(this.nameFile);
      return;
    }
    FileManager.default.createDirectory(this.directory);
    FileManager.default.write(this.nameFile, utf8(value));
  }

  photo(): Uint8Array | undefined {
    try {
      return FileManager.default.read(this.photoFile);
    } catch {
      return undefined;
    }
  }

  setPhoto(data: Uint8Array): void {
    FileManager.default.createDirectory(this.directory);
    FileManager.default.write(this.photoFile, data);
  }

  removePhoto(): void {
    this.remove(this.photoFile);
  }

  /**
   * "Yascha" from "Yascha Torfs" — or from "yascha torfs", typed on a
   * keyboard that did not capitalise it: what the greeting calls you.
   */
  static firstName(a: { of: string | undefined }): string | undefined {
    const name = a.of === undefined ? undefined : cleaned(a.of);
    const first = name === undefined ? undefined : splitChars(name, isWhitespaceChar)[0];
    if (first === undefined) return undefined;
    return prefixChars(first, 1).toUpperCase() + dropFirstChars(first);
  }

  /**
   * The letter on an avatar without a picture: the name's, else the
   * address's, else none.
   */
  static initial(a: { name: string | undefined; email: string | undefined }): string | undefined {
    const source = (a.name === undefined ? undefined : cleaned(a.name)) ?? a.email;
    const letter = source === undefined ? undefined : graphemes(source).find(isLetterChar);
    return letter === undefined ? undefined : letter.toUpperCase();
  }

  private remove(file: string): void {
    if (!FileManager.default.fileExists(file)) return;
    FileManager.default.removeItem(file);
  }
}
