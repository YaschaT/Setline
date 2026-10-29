import { utf8 } from "../Support/nutrition";
import { sha256 } from "../Support/photos";

export type PhotoOwner_Kind = "account" | "demo";

export const PhotoOwner_Kind = {
  account: "account" as PhotoOwner_Kind,
  demo: "demo" as PhotoOwner_Kind,
  allCases: ["account", "demo"] as PhotoOwner_Kind[],
};

/**
 * Whose progress photos these are, on this device.
 *
 * Photos never leave the phone, and on the phone every account keeps them in
 * a folder of its own, named after its user id — the id Supabase gave the
 * account, which never changes, where an address can. An account that signs
 * in after another on the same phone sees only its own photos. A demo account
 * has a folder apart from every real account's.
 */
export interface PhotoOwner {
  kind: PhotoOwner_Kind;
  id: string;
}

export const PhotoOwner = {
  make(p: { kind: PhotoOwner_Kind; id: string }): PhotoOwner {
    return { kind: p.kind, id: p.id };
  },

  account(userID: string): PhotoOwner {
    return PhotoOwner.make({ kind: "account", id: userID });
  },

  demo(id: string): PhotoOwner {
    return PhotoOwner.make({ kind: "demo", id });
  },

  /**
   * The owner's folder, relative to where the photos are kept:
   * `accounts/<user id>`, or `demo/<id>`.
   */
  folder(self: PhotoOwner): string {
    return `${self.kind === "account" ? "accounts" : "demo"}/${PhotoOwner.pathSafe(self.id)}`;
  },

  /**
   * A user id is a UUID. Anything that is not a plain identifier is named
   * by its digest instead, so no id can point outside its own folder.
   */
  pathSafe(id: string): string {
    const plain = [...id].every((scalar) => /^[A-Za-z0-9-]$/.test(scalar));
    if (id !== "" && plain) return id;
    return "h-" + [...sha256(utf8(id))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },

  /**
   * Whether the photos the app kept before photos had owners can be given
   * to this account.
   *
   * They were taken by whoever used the phone, and the phone never noted
   * who. So only a real account takes them, and only while it is the one
   * real account this phone keeps training data for. Otherwise nobody
   * does, and they stay where they are, untouched. Demo accounts do not
   * count: their rows can outlive the debug build that wrote them.
   *
   * `accountsOnDevice` are the addresses the device's local store is kept
   * under — the only record of who has used this phone. The photos
   * themselves are filed by user id, never by address.
   */
  mayAdoptUnownedPhotos(self: PhotoOwner, a: { email: string; accountsOnDevice: string[] }): boolean {
    if (self.kind !== "account") return false;
    const own = a.email.toLowerCase();
    return a.accountsOnDevice.every((other) => {
      const address = other.toLowerCase();
      return address === own || PhotoOwner.isDemoAddress(address);
    });
  },

  /** `demo@setline.be`, and the further demo accounts `demo-<name>@setline.be`. */
  isDemoAddress(email: string): boolean {
    const address = email.toLowerCase();
    return address === "demo@setline.be" || (address.startsWith("demo-") && address.endsWith("@setline.be"));
  },
};
