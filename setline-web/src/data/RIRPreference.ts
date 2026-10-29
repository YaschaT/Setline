// RIRPreference.swift. Whether the set sheet asks for reps in reserve on every
// set, or — the default, addendum 11R — only on an exercise's last prescribed
// set. How the app asks, not what the account holds, so it stays on the device.
import { UserDefaults } from "../design/swiftui";

const key = "setline.rir.everySet";

export const RIRPreference = {
  get everySet(): boolean {
    return UserDefaults.get<boolean>(key) ?? false;
  },
  set everySet(value: boolean) {
    UserDefaults.set(key, value);
  },
};
