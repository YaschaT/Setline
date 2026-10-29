// Port of ios/SetlineCore/Tests/SetlineCoreTests/ProfileStoreTests.swift.
//
// The name and avatar stay on the phone, and on the phone each account keeps
// its own — the same rule as the progress photos. The "disk" is
// `FileManager.default`; each test gets a container folder of its own.
import { afterEach, beforeEach, test } from "node:test";
import { PhotoOwner } from "../../src/core/Photos/PhotoOwner";
import { ProfileStore } from "../../src/core/Photos/ProfileStore";
import { utf8 } from "../../src/core/Support/nutrition";
import { FileManager } from "../../src/core/Support/photos";
import { uuid } from "../../src/core/Support/swift";
import { assertEqual, assertNil } from "../helpers";

let container = "";

beforeEach(() => {
  container = `/tmp/ProfileStoreTests-${uuid()}`;
  FileManager.default.createDirectory(container);
});

afterEach(() => {
  try {
    FileManager.default.removeItem(container);
  } catch {
    // `try?`
  }
});

const a = PhotoOwner.account("2f1c9a4e-0b7d-4c55-9a51-0d6f3e8b1a72");
const b = PhotoOwner.account("8e3d0c61-5a29-4f0b-b4a7-6c2e9d1f0e35");

const store = (owner: PhotoOwner) => new ProfileStore({ owner, container });

test("testEachAccountKeepsItsOwnNameAndPhoto", () => {
  store(a).setName("Yascha Torfs");
  store(a).setPhoto(utf8("a"));

  assertEqual(store(a).name(), "Yascha Torfs");
  assertEqual(store(a).photo(), utf8("a"));
  assertNil(store(b).name());
  assertNil(store(b).photo());
  assertNil(store(PhotoOwner.demo(a.id)).name(), "a demo account never sees a real account's profile");
});

test("testAnEmptyNameRemovesTheName", () => {
  store(a).setName("Yascha");
  store(a).setName("   \n ");
  assertNil(store(a).name());
});

test("testANameIsKeptOnOneTrimmedLine", () => {
  store(a).setName("  Yascha\nTorfs  ");
  assertEqual(store(a).name(), "Yascha Torfs");
});

test("testRemovingThePhotoKeepsTheName", () => {
  store(a).setName("Yascha");
  store(a).setPhoto(utf8("a"));
  store(a).removePhoto();
  store(a).removePhoto();

  assertNil(store(a).photo());
  assertEqual(store(a).name(), "Yascha");
});

test("testTheGreetingUsesTheFirstName", () => {
  assertEqual(ProfileStore.firstName({ of: "Yascha Torfs" }), "Yascha");
  assertEqual(ProfileStore.firstName({ of: " Yascha " }), "Yascha");
  assertEqual(ProfileStore.firstName({ of: "yascha torfs" }), "Yascha");
  assertEqual(ProfileStore.firstName({ of: "élise" }), "Élise");
  assertNil(ProfileStore.firstName({ of: "  " }));
  assertNil(ProfileStore.firstName({ of: undefined }));
});

test("testTheInitialComesFromTheNameElseTheAddress", () => {
  assertEqual(ProfileStore.initial({ name: "yascha", email: "demo@setline.be" }), "Y");
  assertEqual(ProfileStore.initial({ name: undefined, email: "torfsyascha@gmail.com" }), "T");
  assertEqual(ProfileStore.initial({ name: " ", email: "1demo@setline.be" }), "D");
  assertNil(ProfileStore.initial({ name: undefined, email: undefined }));
});
