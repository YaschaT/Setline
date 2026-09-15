import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

// The web half of the cross-client sync contract. The iOS half runs the same
// fixtures in SetlineCore (CrossClientSyncTests.swift).

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

const { mergeWebSnapshot } = await vite.ssrLoadModule("/lib/state-merge.ts");
const { createCloudState } = await vite.ssrLoadModule("/lib/cloud-state.ts");
const { refinishResults, refinishSession } = await vite.ssrLoadModule("/lib/refinish-session.ts");

const clone = (value) => JSON.parse(JSON.stringify(value));
const fixtureDir = path.join(root, "tests/fixtures/sync");
const readFixture = async (name) => JSON.parse(await readFile(path.join(fixtureDir, `${name}.json`), "utf8"));

test("every shared sync fixture: web steps", async () => {
  const files = (await readdir(fixtureDir)).filter((name) => name.endsWith(".json")).sort();
  assert.ok(files.length >= 10, "the shared fixtures are present");
  for (const file of files) {
    const fixture = JSON.parse(await readFile(path.join(fixtureDir, file), "utf8"));
    let state = null;
    fixture.steps.forEach((step, index) => {
      const remote = step.remote ?? state;
      if (step.client === "web") {
        const result = mergeWebSnapshot({
          remote: clone(remote),
          snapshot: clone(step.snapshot),
          ancestry: step.ancestry === null || step.ancestry === undefined ? null : clone(step.ancestry),
          now: step.now,
        });
        assert.deepStrictEqual(result, step.expected, `${file} step ${index + 1}: ${fixture.name}`);
      }
      state = step.expected;
    });
  }
});

// ---------------------------------------------------------------------------
// The save loop, against an in-memory row that behaves like the table.

function memoryTable(initial) {
  const table = { row: initial ? clone(initial) : null, updates: 0, inserts: 0, replaces: 0, failFetches: 0 };
  let beforeWrite = null;
  let keepHook = false;
  const runHook = () => {
    if (!beforeWrite) return;
    const hook = beforeWrite;
    if (!keepHook) beforeWrite = null;
    hook(table);
  };
  const backend = {
    async userId() {
      return "user-1";
    },
    async fetch() {
      if (table.failFetches > 0) {
        table.failFetches -= 1;
        return "error";
      }
      return table.row ? clone(table.row) : null;
    },
    async update(_userId, state, expectedVersion, nextVersion) {
      table.updates += 1;
      runHook();
      if (!table.row || table.row.version !== expectedVersion) return { status: "conflict" };
      table.row = { state: clone(state), version: nextVersion };
      return { status: "ok", version: nextVersion };
    },
    async insert(_userId, state, nextVersion) {
      table.inserts += 1;
      runHook();
      if (table.row) return { status: "conflict" };
      table.row = { state: clone(state), version: nextVersion };
      return { status: "ok", version: nextVersion };
    },
    async replace(_userId, state, nextVersion) {
      table.replaces += 1;
      table.row = { state: clone(state), version: nextVersion };
      return true;
    },
  };
  return {
    table,
    backend,
    /** Simulates another client writing between this client's read and its write. */
    interleave(hook, { always = false } = {}) {
      beforeWrite = hook;
      keepHook = always;
    },
  };
}

function memoryBaseStore(initial = {}) {
  const map = new Map(Object.entries(clone(initial)));
  return {
    map,
    read: (userId) => (map.has(userId) ? clone(map.get(userId)) : null),
    write: (userId, base) => map.set(userId, clone(base)),
    clear: (userId) => map.delete(userId),
  };
}

const at = (iso) => () => new Date(iso);

const set = (weight, reps) => ({ weight, reps, pausedReps: "", pauseSeconds: "", pauseEnabled: false });
const session = (id, date, extra = {}) => ({
  id, date, dayId: "push", dayLabel: "Push", completion: 100,
  results: [{ exerciseId: "flat-bench", name: "Flat bench press", sets: [set("100", "6")] }],
  ...extra,
});
const targets = (calories) => ({ calories, protein: 175, carbs: 350, fat: 70 });

test("a stale tab's save keeps an iOS workout, and survives a write landing mid-save", async () => {
  const loadedRow = {
    state: { planMode: "personal", targets: targets(2750), sessions: [session("web-1", "2026-09-10T17:00:00.000Z")], nutritionEntries: [] },
    version: "2026-09-14T12:00:00.000Z",
  };
  const { table, backend, interleave } = memoryTable(loadedRow);
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T20:00:00.000Z") });

  const loaded = await cloud.loadCloudState();
  const page = clone(loaded.state);

  // iOS logs a workout after the tab loaded…
  const iosWorkout = session("ios-1", "2026-09-14T17:00:00.000Z", { durationSeconds: 3000 });
  table.row = {
    state: { ...table.row.state, sessions: [iosWorkout, ...table.row.state.sessions], iosHiddenWarmups: ["pec-fly"] },
    version: "2026-09-14T18:00:00.000Z",
  };
  // …and writes again between the tab's read and its write.
  interleave((t) => {
    t.row = { state: { ...t.row.state, iosHiddenWarmups: ["pec-fly", "flat-bench"] }, version: "2026-09-14T19:59:59.000Z" };
  });

  page.nutritionEntries = [{ id: "n-1", date: "2026-09-14", meal: "Avondeten", name: "Kip", calories: 740, protein: 52, carbs: 80, fat: 14 }];
  assert.equal(await cloud.saveCloudState(page), true);

  assert.equal(table.updates, 2, "the first write conflicted and was retried");
  assert.deepStrictEqual(table.row.state.sessions.map((s) => s.id), ["ios-1", "web-1"]);
  assert.deepStrictEqual(table.row.state.iosHiddenWarmups, ["pec-fly", "flat-bench"]);
  assert.equal(table.row.state.nutritionEntries.length, 1);
});

test("a device copy is merged against what this browser last saved, not the row it just read", async () => {
  const lastSynced = {
    planMode: "personal",
    targets: targets(2750),
    sessions: [session("a", "2026-09-08T17:00:00.000Z"), session("b", "2026-09-10T17:00:00.000Z")],
  };
  const remote = {
    state: {
      planMode: "personal",
      targets: targets(2750),
      sessions: [
        session("ios-x", "2026-09-13T17:00:00.000Z", { durationSeconds: 2400 }),
        session("a", "2026-09-08T17:00:00.000Z"),
        session("b", "2026-09-10T17:00:00.000Z", { durationSeconds: 1800 }),
      ],
    },
    version: "2026-09-14T18:00:00.000Z",
  };
  const { table, backend } = memoryTable(remote);
  const baseStore = memoryBaseStore({ "user-1": { snapshot: lastSynced, version: "2026-09-12T10:00:00.000Z" } });
  const cloud = createCloudState({ backend, baseStore, now: at("2026-09-14T20:00:00.000Z") });

  await cloud.loadCloudState();
  // Offline since the last sync: deleted "a", logged "c", changed the targets.
  const deviceCopy = {
    updatedAt: "2026-09-14T19:00:00.000Z",
    planMode: "personal",
    targets: targets(2600),
    sessions: [session("b", "2026-09-10T17:00:00.000Z"), session("c", "2026-09-14T08:00:00.000Z")],
  };
  assert.equal(await cloud.saveCloudState(deviceCopy), true);

  const stored = table.row.state;
  assert.deepStrictEqual(stored.sessions.map((s) => s.id), ["ios-x", "b", "c"]);
  assert.equal(stored.sessions[1].durationSeconds, 1800, "iOS's field on b survives");
  assert.deepStrictEqual(stored.targets, targets(2600));
  assert.equal(stored.syncTombstones.sessions.a, "2026-09-14T20:00:00.000Z");
  assert.deepStrictEqual(baseStore.read("user-1").snapshot.sessions.map((s) => s.id), ["b", "c"]);

  // The page's next regular save of the same state has nothing to write.
  const { updatedAt, ...page } = deviceCopy;
  const writes = table.updates;
  assert.equal(await cloud.saveCloudState(page), true);
  assert.equal(table.updates, writes);
});

test("a device copy written before a reset puts nothing back", async () => {
  const { table, backend } = memoryTable({ state: { syncReset: { at: "2026-09-14T12:00:00.000Z" } }, version: "2026-09-14T12:00:00.000Z" });
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T13:00:00.000Z") });
  await cloud.loadCloudState();
  const ok = await cloud.saveCloudState({ updatedAt: "2026-09-14T11:00:00.000Z", sessions: [session("old", "2026-09-10T17:00:00.000Z")] });
  assert.equal(ok, true);
  assert.equal(table.updates + table.inserts, 0);
  assert.deepStrictEqual(table.row.state, { syncReset: { at: "2026-09-14T12:00:00.000Z" } });
});

test("without a successful read, a save can add but never overwrite or delete", async () => {
  const { table, backend } = memoryTable({
    state: { targets: targets(2600), sessions: [session("ios-4", "2026-09-14T16:00:00.000Z")] },
    version: "2026-09-14T18:00:00.000Z",
  });
  table.failFetches = 1;
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T20:00:00.000Z") });
  assert.equal(await cloud.loadCloudState(), null, "the read failed: unknown, not empty");

  // The page fell back to an older copy and saves it.
  const staleCopy = { targets: targets(2750), sessions: [session("web-6", "2026-09-13T17:00:00.000Z")] };
  assert.equal(await cloud.saveCloudState(staleCopy), true);
  assert.deepStrictEqual(table.row.state.targets, targets(2600));
  assert.deepStrictEqual(table.row.state.sessions.map((s) => s.id), ["web-6", "ios-4"]);
});

test("once a device copy fails to save, the row it replaced on screen is no longer its ancestor", async () => {
  const { table, backend } = memoryTable({
    state: {
      targets: targets(2750),
      sessions: [session("ios-x", "2026-09-14T17:00:00.000Z", { durationSeconds: 2400 }), session("a", "2026-09-08T17:00:00.000Z")],
    },
    version: "2026-09-14T18:00:00.000Z",
  });
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T20:00:00.000Z") });
  await cloud.loadCloudState();

  // The device copy is newer than the row, so the page keeps showing it — and
  // pushing it fails.
  const deviceCopy = {
    updatedAt: "2026-09-14T19:00:00.000Z",
    targets: targets(2600),
    sessions: [session("a", "2026-09-08T17:00:00.000Z"), session("b", "2026-09-12T17:00:00.000Z")],
  };
  table.failFetches = 1;
  assert.equal(await cloud.saveCloudState(deviceCopy), false);

  // The page's next save still lacks the iOS workout it never showed.
  const { updatedAt, ...page } = deviceCopy;
  page.sessions = [...page.sessions, session("c", "2026-09-14T08:00:00.000Z")];
  assert.equal(await cloud.saveCloudState(page), true);

  const stored = table.row.state;
  assert.deepStrictEqual(stored.sessions.map((s) => s.id), ["ios-x", "a", "b", "c"], "the iOS workout is not deleted");
  assert.equal(stored.syncTombstones, undefined, "and nothing is tombstoned");
  assert.deepStrictEqual(stored.targets, targets(2750), "without a provable ancestor it cannot overwrite either");
});

test("with no row at load, a row created before the first save is added to, not overwritten", async () => {
  const { table, backend, interleave } = memoryTable(null);
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T20:00:00.000Z") });
  assert.equal(await cloud.loadCloudState(), null);

  // The page shows an older copy from the D1 fallback. Before its first save
  // lands, another client creates the row.
  interleave((t) => {
    t.row = {
      state: { targets: targets(2600), sessions: [session("ios-1", "2026-09-14T17:00:00.000Z", { durationSeconds: 2400 })] },
      version: "2026-09-14T19:00:00.000Z",
    };
  });
  const fallbackCopy = { targets: targets(2750), sessions: [session("web-1", "2026-09-10T17:00:00.000Z")] };
  assert.equal(await cloud.saveCloudState(fallbackCopy), true);

  assert.equal(table.inserts, 1, "the insert found a row already there");
  assert.equal(table.updates, 1, "and the save was reapplied to it");
  assert.deepStrictEqual(table.row.state.targets, targets(2600));
  assert.deepStrictEqual(table.row.state.sessions.map((s) => s.id), ["web-1", "ios-1"]);
});

test("a reset is stored as an explicit marker, not a missing row", async () => {
  const { table, backend } = memoryTable({ state: { sessions: [session("s", "2026-09-10T17:00:00.000Z")] }, version: "2026-09-14T10:00:00.000Z" });
  const baseStore = memoryBaseStore({ "user-1": { snapshot: {}, version: "2026-09-14T10:00:00.000Z" } });
  const cloud = createCloudState({ backend, baseStore, now: at("2026-09-14T12:00:00.000Z") });
  assert.equal(await cloud.clearCloudState(), true);
  assert.deepStrictEqual(table.row.state, { syncReset: { at: "2026-09-14T12:00:00.000Z" } });
  assert.equal(baseStore.read("user-1"), null);
});

test("when every attempt conflicts, the save reports failure and writes nothing of its own", async () => {
  const { table, backend, interleave } = memoryTable({ state: { targets: targets(2750) }, version: "2026-09-14T10:00:00.000Z" });
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T12:00:00.000Z") });
  const loaded = await cloud.loadCloudState();
  let tick = 0;
  interleave((t) => {
    tick += 1;
    t.row = { state: { ...t.row.state, other: tick }, version: `2026-09-14T11:00:0${tick}.000Z` };
  }, { always: true });
  assert.equal(await cloud.saveCloudState({ ...loaded.state, targets: targets(2600) }), false);
  assert.equal(table.updates, 3);
  assert.deepStrictEqual(table.row.state.targets, targets(2750));
});

test("a first save for an account without a row creates it", async () => {
  const { table, backend } = memoryTable(null);
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-14T12:00:00.000Z") });
  assert.equal(await cloud.loadCloudState(), null);
  assert.equal(await cloud.saveCloudState({ planMode: "personal", sessions: [] }), true);
  assert.equal(table.inserts, 1);
  assert.deepStrictEqual(table.row.state, { planMode: "personal" });
});

// ---------------------------------------------------------------------------
// Finishing a day again on the web. app/page.tsx builds the session with
// lib/refinish-session.ts and saves it through the loop above.

const webSet = (weight, reps) => ({ weight, reps, pausedReps: "", pauseSeconds: "", pauseEnabled: false });
const row = (exerciseId, name, sets = []) => ({ exerciseId, name, sets });
const pushRows = (benchSets) => [
  row("flat-bench", "Flat bench press", benchSets),
  row("incline-bench", "Incline bench press"),
  row("pec-fly", "Pec fly"),
];

test("finishing an iOS-logged day again yields exactly the shared fixture's page state", async () => {
  const fixture = await readFixture("web-refinish-keeps-ios-exercises");
  const logged = clone(fixture.steps[0].expected.sessions[0]);
  const asLogged = clone(logged);

  const page = refinishSession(logged, {
    dayId: "push",
    dayLabel: "Push",
    completion: 33,
    rows: pushRows([webSet("102.5", "6"), webSet("102.5", "5")]),
  });

  assert.deepStrictEqual(page, fixture.steps[1].snapshot.sessions[0]);
  assert.deepStrictEqual(logged, asLogged, "the saved session itself is left as it was");
});

test("the save loop stores that re-finish with every exercise iOS logged intact", async () => {
  const fixture = await readFixture("web-refinish-keeps-ios-exercises");
  const { table, backend } = memoryTable({ state: fixture.steps[0].expected, version: "2026-09-15T18:30:00.000Z" });
  const cloud = createCloudState({ backend, baseStore: memoryBaseStore(), now: at("2026-09-15T20:00:00.000Z") });
  const loaded = await cloud.loadCloudState();

  // The page holds only its own keys, never iOS's.
  const { iosActiveSession, ...page } = clone(loaded.state);
  page.sessions = [
    refinishSession(page.sessions[0], {
      dayId: "push",
      dayLabel: "Push",
      completion: 33,
      rows: pushRows([webSet("102.5", "6"), webSet("102.5", "5")]),
    }),
  ];
  assert.equal(await cloud.saveCloudState(page), true);

  assert.deepStrictEqual(table.row.state, fixture.steps[1].expected);
});

test("a stale re-finish neither overwrites newer iOS sets nor replaces an exercise logged meanwhile", () => {
  const started = {
    id: "s", date: "2026-09-15T17:10:00.000Z", dayId: "push", dayLabel: "Push", completion: 60,
    results: [row("flat-bench", "Flat bench press", [webSet("100", "6")]), row("db-bench", "Dumbbell bench press", [webSet("34", "10")])],
  };
  // Since the tab loaded, iOS logged another dumbbell set and an incline bench press.
  const stored = {
    ...started,
    results: [
      row("flat-bench", "Flat bench press", [webSet("100", "6")]),
      row("db-bench", "Dumbbell bench press", [webSet("34", "10"), webSet("34", "9")]),
      row("incline-bench", "Incline bench press", [webSet("80", "8")]),
    ],
  };
  // The tab finishes the day again from its old copy: bench press typed, incline bench an empty planned row.
  const page = refinishSession(clone(started), {
    dayId: "push",
    dayLabel: "Push",
    completion: 50,
    rows: [row("flat-bench", "Flat bench press", [webSet("102.5", "5")]), row("incline-bench", "Incline bench press")],
  });

  const merged = mergeWebSnapshot({
    remote: { sessions: [stored] },
    snapshot: { sessions: [page] },
    ancestry: { sessions: [started] },
    now: "2026-09-15T20:00:00.000Z",
  });

  assert.deepStrictEqual(merged.sessions[0].results, [
    row("flat-bench", "Flat bench press", [webSet("102.5", "5")]),
    row("incline-bench", "Incline bench press", [webSet("80", "8")]),
    row("db-bench", "Dumbbell bench press", [webSet("34", "10"), webSet("34", "9")]),
  ]);
  assert.equal(merged.sessions[0].completion, 50);
});

test("a stale tab's re-finish matches the shared fixture in which the removed exercise stays removed", async () => {
  const fixture = await readFixture("web-edit-removal-is-not-resurrected");
  const staleCopy = clone(fixture.steps[1].ancestry.sessions[0]);

  const page = refinishSession(staleCopy, {
    dayId: "push",
    dayLabel: "Push",
    completion: 50,
    rows: [row("flat-bench", "Flat bench press", [webSet("105", "5"), webSet("105", "5")]), row("incline-bench", "Incline bench press")],
  });

  assert.deepStrictEqual(page, fixture.steps[1].snapshot.sessions[0]);
});

test("finishing again after an explicit edit removed an exercise does not bring it back", async () => {
  const fixture = await readFixture("web-edit-removal-is-not-resurrected");
  const edited = clone(fixture.steps[0].expected.sessions[0]);

  const page = refinishSession(edited, {
    dayId: "push",
    dayLabel: "Push",
    completion: 50,
    rows: [row("flat-bench", "Flat bench press"), row("incline-bench", "Incline bench press")],
  });

  assert.deepStrictEqual(page.results.map((result) => result.exerciseId), ["flat-bench", "incline-bench"]);
  assert.deepStrictEqual(page.results[0], edited.results[0], "the untouched exercise keeps exactly what was saved");
});

test("a typed exercise replaces every saved result for it; untouched and unplanned results stay as saved", () => {
  const saved = [
    { exerciseId: "flat-bench", name: "Flat bench press", sets: [webSet("100", "6")], note: "zwaar" },
    { exerciseId: "db-bench", name: "Dumbbell bench press", sets: [{ ...webSet("34", "10"), substitutedFrom: "flat-bench" }] },
    { exerciseId: "flat-bench", name: "Flat bench press", sets: [webSet("95", "8")] },
    { exerciseId: "pec-fly", name: "Pec fly", sets: [webSet("50", "12")] },
  ];

  const typed = refinishResults(saved, [row("flat-bench", "Flat bench press", [webSet("102.5", "5")]), row("pec-fly", "Pec fly")]);
  assert.deepStrictEqual(typed.map((result) => result.exerciseId), ["flat-bench", "pec-fly", "db-bench"]);
  assert.deepStrictEqual(typed[0].sets, [webSet("102.5", "5")], "both saved bench press results give way to what was typed");
  assert.equal(typed[1], saved[3], "left alone: the very result that was saved");
  assert.equal(typed[2], saved[1], "an exercise outside the plan stays");

  const untouched = refinishResults(saved, [row("flat-bench", "Flat bench press"), row("pec-fly", "Pec fly")]);
  assert.deepStrictEqual(untouched, [saved[0], saved[2], saved[3], saved[1]]);
});

test("iOS set counts survive a re-finish that leaves the results as they were, and go once they change", () => {
  const saved = {
    id: "s",
    date: "2026-09-15T17:10:00.000Z",
    dayId: "push",
    dayLabel: "Push",
    completion: 100,
    results: [row("flat-bench", "Flat bench press", [webSet("100", "6")])],
    iosPlannedSetCount: 3,
    iosCompletedSetCount: 1,
  };

  const again = refinishSession(saved, { dayId: "push", dayLabel: "Push", completion: 33, rows: [row("flat-bench", "Flat bench press")] });
  assert.equal(again.completion, 33);
  assert.equal(again.iosPlannedSetCount, 3);
  assert.equal(again.iosCompletedSetCount, 1);

  const retyped = refinishSession(saved, {
    dayId: "push",
    dayLabel: "Push",
    completion: 33,
    rows: [row("flat-bench", "Flat bench press", [webSet("100", "7")])],
  });
  assert.equal("iosPlannedSetCount" in retyped, false);
  assert.equal("iosCompletedSetCount" in retyped, false);
  assert.equal(saved.iosPlannedSetCount, 3, "the saved session itself is left as it was");
});
