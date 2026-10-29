// Port of ios/SetlineCore/Tests/SetlineCoreTests/CheckInStoreTests.swift.
//
// Progress photos stay on the phone, and on the phone they belong to one
// account.
//
// Before, the app kept one list of photos for the whole phone, so an account
// that signed in after another saw the other's photos. Each account now keeps
// its own folder, by user id; the old list moves, once, to the account it can
// be shown to belong to, and is otherwise left exactly where it was.
//
// The "disk" is `FileManager.default`, an in-memory file system here; each
// test gets a container folder of its own, as the Swift tests get a fresh
// temporary directory.
import { beforeEach, afterEach, test } from "node:test";
import { BodyMetric } from "../../src/core/Domain/Model";
import { CheckIn, CheckInGallery, CheckInGallery_Span } from "../../src/core/Photos/CheckIn";
import { CheckInStore, CheckInStore_UnownedPhotos } from "../../src/core/Photos/CheckInStore";
import { PhotoOwner } from "../../src/core/Photos/PhotoOwner";
import { appendingPathComponent, FileManager } from "../../src/core/Support/photos";
import { dropFirstChars, utf8 } from "../../src/core/Support/nutrition";
import { dec, uuid } from "../../src/core/Support/swift";
import { assertEqual, assertFalse, assertNotEqual, assertTrue } from "../helpers";

let container = "";

beforeEach(() => {
  container = `/tmp/CheckInStoreTests-${uuid()}`;
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

const store = (owner: PhotoOwner, adopts = true) => new CheckInStore({ owner, mayAdoptUnownedPhotos: adopts, container });

const root = () => appendingPathComponent(container, "CheckIns");
const unownedIndex = () => appendingPathComponent(root(), "check-ins.json");
const claim = () => appendingPathComponent(root(), "unowned-claimed-by.txt");

/** The phone-wide list as the app wrote it before photos had owners. */
const unowned: { record: CheckIn; bytes: Uint8Array }[] = [
  { record: CheckIn.make({ id: "checkin-1751699400000", date: "2026-07-05", fileName: "checkin-1751699400000.jpg" }), bytes: utf8("july") },
  { record: CheckIn.make({ id: "checkin-1757145600000", date: "2026-09-06", fileName: "checkin-1757145600000.jpg" }), bytes: utf8("september") },
  { record: CheckIn.make({ id: "checkin-1759305600000", date: "2026-10-01", fileName: "checkin-1759305600000.jpg" }), bytes: utf8("october") },
];

const unownedRecords = unowned.map((item) => item.record);

function seedUnownedPhotos(): void {
  FileManager.default.createDirectory(root());
  for (const item of unowned) {
    FileManager.default.write(appendingPathComponent(root(), item.record.fileName), item.bytes);
  }
  FileManager.default.write(unownedIndex(), utf8(JSON.stringify(unownedRecords.map(CheckIn.encode))));
}

const exists = (path: string) => FileManager.default.fileExists(path);

function unownedLeftIntact(): boolean {
  return exists(unownedIndex()) && unowned.every((item) => exists(appendingPathComponent(root(), item.record.fileName)));
}

// MARK: - The steps, in order

/**
 * 1. The photos kept for the whole phone move to the account that owns
 *    them: the same records, dates and pictures — and gone from where
 *    they were.
 */
test("testUnownedPhotosMoveToTheAccountThatOwnsThem", async () => {
  seedUnownedPhotos();
  const photos = store(a);

  const outcome = await photos.migrateUnownedPhotos();
  const loaded = await photos.load();

  assertEqual(outcome, CheckInStore_UnownedPhotos.moved(3));
  assertEqual(loaded, unownedRecords, "same ids, dates and file names, in the same order");
  for (const item of unowned) {
    assertEqual(FileManager.default.read(photos.url({ for: item.record })), item.bytes, "the picture itself, in full");
    assertFalse(exists(appendingPathComponent(root(), item.record.fileName)), "the original goes once copied");
  }
  assertFalse(exists(unownedIndex()));
  assertFalse(exists(claim()));
  assertTrue(photos.url({ for: unownedRecords[0] }).includes(`/CheckIns/accounts/${a.id}/`));
});

/** 2. A relaunch is a new store for the same account: the photos are there. */
test("testTheyAreStillThereAfterARelaunch", async () => {
  seedUnownedPhotos();
  await store(a).load();

  const relaunched = await store(a).load();

  assertEqual(relaunched, unownedRecords);
});

/**
 * 3–6. Signing out deletes nothing; another account sees none of A's
 *      photos and keeps its own; back on A, A's photos return without B's.
 */
test("testEachAccountSeesOnlyItsOwnPhotos", async () => {
  seedUnownedPhotos();
  await store(a).load();

  // Signing out drops the store and nothing else. B may even be allowed
  // to take unowned photos: there are none left to take.
  const second = store(b);
  const seenByB = await second.load();
  assertEqual(seenByB, [], "B sees none of A's photos");

  const added = await second.add(utf8("b"), { on: new Date(1_759_600_000 * 1000) });
  const afterAdding = await second.load();
  assertEqual(added.length, 1);
  assertEqual(afterAdding.length, 1, "B's photo is B's");
  assertTrue(second.url({ for: added[0] }).includes(`/CheckIns/accounts/${b.id}/`));

  const backOnA = await store(a).load();
  assertEqual(backOnA, unownedRecords, "A's photos return");
  assertFalse(backOnA.some((c) => c.id === added[0].id), "and B's photo is not among them");
  assertTrue(exists(second.url({ for: added[0] })), "B's photo is still on the phone");
});

/**
 * 7. Running the move again — after it finished, or after it was cut
 *    short before the originals were removed — duplicates nothing.
 */
test("testRunningTheMoveAgainDuplicatesNothing", async () => {
  seedUnownedPhotos();
  const photos = store(a);
  const first = await photos.migrateUnownedPhotos();
  const second = await photos.migrateUnownedPhotos();
  assertEqual(first, CheckInStore_UnownedPhotos.moved(3));
  assertEqual(second, CheckInStore_UnownedPhotos.none);

  // Cut short after the copy: the originals and the claim are still there.
  seedUnownedPhotos();
  FileManager.default.write(claim(), utf8(PhotoOwner.folder(a)));

  const resumed = await photos.migrateUnownedPhotos();
  const loaded = await photos.load();
  assertEqual(resumed, CheckInStore_UnownedPhotos.moved(3));
  assertEqual(loaded, unownedRecords, "no record twice");
  assertFalse(exists(unownedIndex()));
});

// MARK: - Ownership that cannot be shown

test("testWithoutShownOwnershipNothingMoves", async () => {
  seedUnownedPhotos();
  const photos = store(a, false);

  const outcome = await photos.migrateUnownedPhotos();
  const loaded = await photos.load();

  assertEqual(outcome, CheckInStore_UnownedPhotos.leftInPlace);
  assertEqual(loaded, [], "not shown to an account that cannot be shown to own them");
  assertTrue(unownedLeftIntact(), "and left exactly where they were");
  assertFalse(exists(claim()), "nor claimed");
});

/**
 * A move that was begun is finished by the account that began it, and
 * by no other — whatever that other may otherwise take.
 */
test("testAMoveBegunByOneAccountIsNeverFinishedByAnother", async () => {
  seedUnownedPhotos();
  FileManager.default.write(claim(), utf8(PhotoOwner.folder(a)));

  const byB = await store(b).migrateUnownedPhotos();
  const seenByB = await store(b).load();
  assertEqual(byB, CheckInStore_UnownedPhotos.claimedByAnother);
  assertEqual(seenByB, []);
  assertTrue(unownedLeftIntact());

  // A's claim stands even where A could no longer be shown to own them:
  // that was decided before anyone else used the phone.
  const byA = await store(a, false).migrateUnownedPhotos();
  assertEqual(byA, CheckInStore_UnownedPhotos.moved(3));
});

/**
 * A demo account never takes them, never sees them, and keeps its own
 * photos apart from any real account's — even one with the same id.
 */
test("testADemoAccountNeverTakesOrSeesThem", async () => {
  seedUnownedPhotos();
  const demo = store(PhotoOwner.demo(a.id), true);

  const outcome = await demo.migrateUnownedPhotos();
  const seen = await demo.load();
  assertEqual(outcome, CheckInStore_UnownedPhotos.leftInPlace);
  assertEqual(seen, []);
  assertTrue(unownedLeftIntact());

  // Not even when the claim names its folder.
  FileManager.default.write(claim(), utf8(PhotoOwner.folder(PhotoOwner.demo(a.id))));
  const named = await demo.migrateUnownedPhotos();
  assertEqual(named, CheckInStore_UnownedPhotos.leftInPlace);
  assertTrue(unownedLeftIntact());

  FileManager.default.removeItem(claim());
  await store(a).load();
  await demo.add(utf8("demo"), { on: new Date() });
  const demoCount = (await demo.load()).length;
  const accountCount = (await store(a).load()).length;
  assertEqual(demoCount, 1);
  assertEqual(accountCount, 3, "the demo's photo is not the account's");
  assertNotEqual(PhotoOwner.folder(PhotoOwner.demo(a.id)), PhotoOwner.folder(a));
});

/**
 * Nothing is removed before the copy is confirmed. Here the account's
 * folder cannot be made — a file stands in its place — so nothing moves
 * and nothing goes; once it can, the move finishes.
 */
test("testNothingIsRemovedBeforeTheCopyIsConfirmed", async () => {
  seedUnownedPhotos();
  const accounts = appendingPathComponent(root(), "accounts");
  FileManager.default.createDirectory(accounts);
  const blocker = appendingPathComponent(accounts, a.id);
  FileManager.default.write(blocker, utf8("not a folder"));
  const photos = store(a);

  const blocked = await photos.migrateUnownedPhotos();
  assertEqual(blocked, CheckInStore_UnownedPhotos.notYet);
  assertTrue(unownedLeftIntact(), "every original still there");
  assertTrue(exists(claim()), "the claim stays, so only A can finish");

  FileManager.default.removeItem(blocker);
  const finished = await photos.migrateUnownedPhotos();
  const loaded = await photos.load();
  assertEqual(finished, CheckInStore_UnownedPhotos.moved(3));
  assertEqual(loaded, unownedRecords);
});

/**
 * The weigh-in beside each photo, and what a comparison says, are what
 * they were: both are read from the photo's date, which is kept.
 */
test("testWeighInsAndComparisonsAreUnchangedByTheMove", async () => {
  const metrics = [
    BodyMetric.make({ id: "1", date: "2026-09-06", weight: 81 }),
    BodyMetric.make({ id: "2", date: "2026-10-01", weight: 82.4 }),
  ];
  const before = CheckInGallery.makeCheckIns(unownedRecords, { metrics });

  seedUnownedPhotos();
  const moved = await store(a).load();
  const after = CheckInGallery.makeCheckIns(moved, { metrics });

  const [september, october] = [unownedRecords[1].id, unownedRecords[2].id];
  assertEqual(after, before);
  assertEqual(CheckInGallery.comparison(after, september, october), CheckInGallery.comparison(before, september, october));
  assertEqual(CheckInGallery.comparison(after, september, october)?.span, CheckInGallery_Span.weeks(4));
  assertEqual(CheckInGallery.comparison(after, september, october)?.change, dec(82.4 - 81));
});

// MARK: - Who may take them

test("testOnlyTheOneRealAccountOnThePhoneMayTakeThem", () => {
  assertTrue(PhotoOwner.mayAdoptUnownedPhotos(a, { email: "a@setline.be", accountsOnDevice: [] }));
  assertTrue(PhotoOwner.mayAdoptUnownedPhotos(a, { email: "a@setline.be", accountsOnDevice: ["A@setline.be"] }));
  assertTrue(
    PhotoOwner.mayAdoptUnownedPhotos(a, {
      email: "a@setline.be",
      accountsOnDevice: ["a@setline.be", "demo@setline.be", "demo-b@setline.be"],
    }),
    "demo accounts do not count",
  );
  assertFalse(
    PhotoOwner.mayAdoptUnownedPhotos(a, { email: "a@setline.be", accountsOnDevice: ["a@setline.be", "b@gmail.com"] }),
    "another real account has used this phone: nobody can be shown to own them",
  );
  assertFalse(PhotoOwner.mayAdoptUnownedPhotos(PhotoOwner.demo(a.id), { email: "demo@setline.be", accountsOnDevice: [] }));
});

test("testAnIDCannotNameAFolderOutsideItsOwn", () => {
  assertEqual(PhotoOwner.folder(a), `accounts/${a.id}`);
  const odd = PhotoOwner.account("../../Library/Caches");
  assertTrue(PhotoOwner.folder(odd).startsWith("accounts/h-"));
  assertFalse(dropFirstChars(PhotoOwner.folder(odd), "accounts/".length).includes("/"));
  assertFalse(PhotoOwner.folder(odd).includes(".."));
  assertNotEqual(PhotoOwner.folder(PhotoOwner.account("")), "accounts/");
});
