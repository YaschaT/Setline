// Keychain.swift. The session token store. A browser has no keychain; the
// session lives in this site's localStorage, which only this site can read.
const PREFIX = "be.setline.app:";

export const Keychain = {
  set(value: string, key: string): void {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* private mode */
    }
  },
  get(key: string): string | undefined {
    try {
      return localStorage.getItem(PREFIX + key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};
