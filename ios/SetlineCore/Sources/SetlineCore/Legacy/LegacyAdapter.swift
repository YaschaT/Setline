import Foundation

/// Reads the web app's blob into the typed domain, and writes typed changes
/// back into the blob without disturbing anything it does not own.
///
/// Both clients keep working while iOS is built: the blob stays the wire
/// format on `public.user_state`, and the typed model is what the app
/// reasons in. The one-way schema migration lands in a later phase, once.
public enum LegacyAdapter {

    // MARK: - Reading

    public static func sessions(from state: LegacyState) -> [TrainingSession] {
        guard let rows = state["sessions"]?.arrayValue else { return [] }
        return rows.compactMap(session(from:))
    }

    public static func session(from value: JSONValue) -> TrainingSession? {
        guard let object = value.objectValue,
              let id = object["id"]?.stringValue,
              let dateString = object["date"]?.stringValue,
              let date = isoDate(dateString)
        else { return nil }

        let kind: SessionKind = object["sessionType"]?.stringValue == "recovery" ? .recovery : .workout
        let results = (object["results"]?.arrayValue ?? []).compactMap(result(from:))
        let counts = setCounts(in: object)

        return TrainingSession(
            id: id,
            date: date,
            dayID: object["dayId"]?.stringValue ?? "",
            dayLabel: object["dayLabel"]?.stringValue ?? "",
            completion: object["completion"]?.intValue ?? 0,
            kind: kind,
            results: results,
            durationSeconds: object["durationSeconds"]?.intValue,
            note: object["note"]?.stringValue,
            plannedSetCount: counts?.planned,
            completedSetCount: counts?.completed
        )
    }

    /// Where iOS stores a session's exact set counts. The web app does not read
    /// them, and removes them whenever it rewrites the session's results, which
    /// they would then no longer describe.
    public static let plannedSetCountKey = "iosPlannedSetCount"
    public static let completedSetCountKey = "iosCompletedSetCount"

    /// Read only as a pair that holds together. Anything else counts as
    /// absent, so history falls back to the stored percentage rather than
    /// showing a count that cannot be right.
    static func setCounts(in object: [String: JSONValue]) -> (planned: Int, completed: Int)? {
        guard let planned = object[plannedSetCountKey]?.intValue,
              let completed = object[completedSetCountKey]?.intValue,
              planned > 0,
              (0...planned).contains(completed)
        else { return nil }
        return (planned, completed)
    }

    static func result(from value: JSONValue) -> ExerciseResult? {
        guard let object = value.objectValue,
              let exerciseID = object["exerciseId"]?.stringValue
        else { return nil }

        let name = object["name"]?.stringValue ?? ExerciseCatalog.exercise(exerciseID)?.name ?? exerciseID

        var sets: [LoggedSet] = []
        if let rows = object["sets"]?.arrayValue {
            for (index, row) in rows.enumerated() {
                if let set = loggedSet(from: row, index: index) { sets.append(set) }
            }
        } else if let set = loggedSet(from: value, index: 0) {
            // The oldest sessions stored a single weight/reps pair on the
            // result itself rather than a `sets` array.
            sets.append(set)
        }

        return ExerciseResult(exerciseID: exerciseID, name: name, sets: sets, note: object["note"]?.stringValue ?? "")
    }

    static func loggedSet(from value: JSONValue, index: Int) -> LoggedSet? {
        guard let object = value.objectValue else { return nil }

        let weight = object["weight"]?.decimalValue
        let reps = object["reps"]?.intValue ?? 0
        let pausedReps = object["pausedReps"]?.intValue ?? 0
        let pauseSeconds = object["pauseSeconds"]?.doubleValue
        let pauseEnabled = object["pauseEnabled"]?.boolValue ?? (pausedReps > 0 || (pauseSeconds ?? 0) > 0)
        // Only iOS writes an origin, and only on added sets. Everything else —
        // the web app's own unmarked "Extra set" rows included — reads as
        // prescribed (see `ProgressionEngine.prescribedSlots`).
        let origin = SetOrigin(rawValue: object["origin"]?.stringValue ?? "") ?? .prescribed

        // Nothing is dropped and nothing is summed.
        //
        // The web app's `completedReps()` returned `reps + pausedReps`, so a
        // paused rep and a normal rep became one number that then drove
        // progression, PR detection and the strength trend
        // (TRAINING_LOGIC §15 change 2). Addendum 16R states the same rule
        // from the design side: "Pauze-reps tellen nooit mee in het
        // repsaantal."
        //
        // So `reps` stays `reps` and the paused count travels beside it. Two
        // sets in the existing history mix the two (flat-bench 120 kg, 6 + 2
        // paused). They keep both numbers, count toward volume, and stay out
        // of progression — a mixed set is comparable to neither series.
        let modifiers = SetModifiers(
            pauseEnabled: pauseEnabled,
            pauseSeconds: pauseEnabled ? (pauseSeconds ?? 2) : nil
        )

        guard weight != nil || reps > 0 || pausedReps > 0 else {
            // An untouched draft row. Preserved as an empty set so the grid
            // keeps its shape.
            return LoggedSet(index: index, weightKg: nil, reps: 0, modifiers: modifiers, origin: origin)
        }

        return LoggedSet(
            index: index,
            weightKg: weight,
            reps: reps,
            rirReported: object["rir"]?.intValue,
            isWarmup: object["isWarmup"]?.boolValue ?? false,
            modifiers: modifiers,
            flags: [],
            substitutedFrom: object["substitutedFrom"]?.stringValue,
            partialReps: object["partialReps"]?.intValue,
            pausedReps: pausedReps > 0 ? pausedReps : nil,
            origin: origin
        )
    }

    public static func metrics(from state: LegacyState) -> [BodyMetric] {
        (state["metrics"]?.arrayValue ?? []).compactMap { value in
            guard let object = value.objectValue,
                  let id = object["id"]?.stringValue,
                  let date = object["date"]?.stringValue,
                  let weight = object["weight"]?.doubleValue
            else { return nil }
            return BodyMetric(id: id, date: date, weight: weight, waist: object["waist"]?.doubleValue)
        }
    }

    public static func targets(from state: LegacyState) -> NutritionTargets? {
        guard let object = state["targets"]?.objectValue else { return nil }
        return NutritionTargets(
            calories: object["calories"]?.intValue ?? 0,
            protein: object["protein"]?.intValue ?? 0,
            carbs: object["carbs"]?.intValue ?? 0,
            fat: object["fat"]?.intValue ?? 0
        )
    }

    /// Everything the account has logged as food, in the order it was written.
    public static func nutritionEntries(from state: LegacyState) -> [NutritionEntry] {
        guard let array = state["nutritionEntries"]?.arrayValue else { return [] }
        return array.compactMap { value in
            guard let object = value.objectValue,
                  let id = object["id"]?.stringValue,
                  let date = object["date"]?.stringValue
            else { return nil }
            return NutritionEntry(
                id: id,
                date: date,
                meal: object["meal"]?.stringValue ?? Meal.snack.rawValue,
                name: object["name"]?.stringValue ?? "",
                calories: object["calories"]?.doubleValue ?? 0,
                protein: object["protein"]?.doubleValue ?? 0,
                carbs: object["carbs"]?.doubleValue ?? 0,
                fat: object["fat"]?.doubleValue ?? 0,
                amount: object["amount"]?.doubleValue,
                unit: object["unit"]?.stringValue,
                loggedAt: object["loggedAt"]?.stringValue.flatMap(isoDate)
            )
        }
    }

    /// How long the account has been lifting, if it ever said.
    public static func experience(from state: LegacyState) -> Experience? {
        state["experienceLevel"]?.stringValue.flatMap(Experience.init(rawValue:))
    }

    /// The rack this account actually has, or the set the design assumes.
    public static func plateInventory(from state: LegacyState) -> PlateInventory {
        guard let plates = state["plates"]?.arrayValue?.compactMap(\.decimalValue), !plates.isEmpty else {
            return .default
        }
        return PlateInventory(plates: plates, barKg: state["barWeightKg"]?.decimalValue ?? PlateMath.defaultBar)
    }

    /// A lighter week the account accepted. iOS-namespaced: the web app does
    /// not read it and carries it through untouched.
    public static let deloadKey = "iosDeload"

    public static func deload(from state: LegacyState) -> Deload? {
        guard let object = state[deloadKey]?.objectValue,
              let started = object["startedAt"]?.stringValue.flatMap(isoDate)
        else { return nil }
        return Deload(
            startedAt: started,
            days: object["days"]?.intValue ?? 5,
            setReduction: object["setReduction"]?.doubleValue ?? 0.4,
            rirIncrease: object["rirIncrease"]?.intValue ?? 2
        )
    }

    public static func json(_ deload: Deload) -> JSONValue {
        .object([
            "startedAt": .string(isoString(deload.startedAt)),
            "days": .number(Decimal(deload.days)),
            "setReduction": .number(Decimal(deload.setReduction)),
            "rirIncrease": .number(Decimal(deload.rirIncrease)),
        ])
    }

    public static func planMode(from state: LegacyState) -> (mode: String, sciencePlanID: String) {
        (
            state["planMode"]?.stringValue ?? "personal",
            state["sciencePlanId"]?.stringValue ?? "ppl-ul"
        )
    }

    /// The saved plan, if the user edited theirs, otherwise the catalogue's.
    ///
    /// `plan` holds the account's *personal* plan and only that: on a science
    /// programme the web app reads the programme's own days and leaves `plan`
    /// untouched, so reading it here would show a plan the account is not on.
    public static func plan(from state: LegacyState) -> [WorkoutDay] {
        let (mode, scienceID) = planMode(from: state)
        guard mode == "personal", let days = state["plan"]?.arrayValue, !days.isEmpty else {
            return PlanCatalog.plan(mode: mode, sciencePlanID: scienceID)
        }
        let parsed = days.compactMap(workoutDay(from:))
        return parsed.isEmpty ? PlanCatalog.plan(mode: mode, sciencePlanID: scienceID) : parsed
    }

    static func workoutDay(from value: JSONValue) -> WorkoutDay? {
        guard let object = value.objectValue, let id = object["id"]?.stringValue else { return nil }
        let exercises = (object["exercises"]?.arrayValue ?? []).compactMap(plannedExercise(from:))
        return WorkoutDay(
            id: id,
            label: object["label"]?.stringValue ?? id,
            short: object["short"]?.stringValue ?? id,
            focus: object["focus"]?.stringValue ?? "",
            exercises: exercises
        )
    }

    static func plannedExercise(from value: JSONValue) -> PlannedExercise? {
        guard let object = value.objectValue, let id = object["id"]?.stringValue else { return nil }
        let prescription = object["prescription"]?.stringValue ?? ""
        let load = object["load"]?.stringValue ?? ""
        let rest = object["rest"]?.stringValue ?? ""
        let role = ExerciseCatalog.role(id)
        let rir = PrescriptionParser.targetRIR(from: load, role: role)
        var sets = PrescriptionParser.setPrescriptions(from: prescription, targetRIR: rir)
        if sets.isEmpty {
            sets = [SetPrescription(repRange: 8...12, targetRIR: rir)]
        }
        let paused = id == "upper-paused-bench"
        return PlannedExercise(
            exerciseID: id,
            role: role,
            sets: sets,
            modifiers: SetModifiers(pauseEnabled: paused, pauseSeconds: paused ? 2 : nil),
            authoredNote: LegacyPrescriptionNote(prescription: prescription, load: load, rest: rest)
        )
    }

    /// Date → canonical day id, for the program the account is currently on.
    ///
    /// Overrides are scoped per program (`personal:2026-08-28`), so the ones
    /// belonging to a plan the account is not running must not be read — the
    /// web app scopes the same way, and the two must agree on which day it is.
    /// A bare `"2026-08-28"` is an older export, and the web app still honours
    /// it on the two programs that predate the scoping.
    public static func scheduleOverrides(from state: LegacyState) -> [String: String] {
        let (mode, scienceID) = planMode(from: state)
        return scheduleOverrides(from: state, programKey: Schedule.programKey(mode: mode, sciencePlanID: scienceID))
    }

    public static func scheduleOverrides(from state: LegacyState, programKey: String) -> [String: String] {
        guard let object = state["scheduleOverrides"]?.objectValue else { return [:] }
        let honoursBareKeys = programKey == "personal" || programKey == "science-ppl-ul"
        var result: [String: String] = [:]
        for (key, value) in object {
            guard let day = value.stringValue else { continue }
            if let separator = key.firstIndex(of: ":") {
                guard String(key[key.startIndex..<separator]) == programKey else { continue }
                result[String(key[key.index(after: separator)...])] = day
            } else if honoursBareKeys, result[key] == nil {
                result[key] = day
            }
        }
        return result
    }

    /// The key the paused session rides in. Namespaced so the web app — which
    /// reads only the keys it knows — leaves it alone, and so `LegacyState`
    /// carries it through untouched on every write.
    public static let activeSessionKey = "iosActiveSession"

    public static func activeSession(from state: LegacyState) -> ActiveSessionSnapshot? {
        guard let value = state[activeSessionKey], value != .null else { return nil }
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(ActiveSessionSnapshot.self, from: data)
    }

    public static func apply(activeSession: ActiveSessionSnapshot?, to state: inout LegacyState) {
        guard let activeSession else {
            state.set(activeSessionKey, to: .null)
            return
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(activeSession),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data)
        else { return }
        state.set(activeSessionKey, to: value)
    }

    /// Exercises whose warm-up ramp the user has hidden for good.
    ///
    /// The only thing about a warm-up that is worth persisting: the ramp
    /// itself is generated on the fly and never stored as sets.
    public static let hiddenWarmupsKey = "iosHiddenWarmups"

    public static func hiddenWarmups(from state: LegacyState) -> Set<String> {
        guard let values = state[hiddenWarmupsKey]?.arrayValue else { return [] }
        return Set(values.compactMap(\.stringValue))
    }

    public static func apply(hiddenWarmups: Set<String>, to state: inout LegacyState) {
        state.set(hiddenWarmupsKey, to: .array(hiddenWarmups.sorted().map { .string($0) }))
    }

    // MARK: - Phase 3 keys
    //
    // Three more iOS-only keys, written the same way and for the same
    // reason: the web app does not read them, and `LegacyState` carries
    // anything it does not recognise through a round trip untouched.

    public static let painFlagsKey = "iosPainFlags"
    public static let replacementsKey = "iosProgramReplacements"
    public static let customExercisesKey = "iosCustomExercises"

    public static func painFlags(from state: LegacyState) -> [PainFlag] {
        decodeList(state[painFlagsKey]) ?? []
    }

    /// Expired flags are dropped on write rather than filtered on read, so a
    /// flag that has run out actually leaves the account (§14: a flag is
    /// re-confirmed, not accumulated).
    public static func apply(painFlags: [PainFlag], to state: inout LegacyState) {
        encodeList(painFlags.active(), into: &state, key: painFlagsKey)
    }

    public static func programReplacements(from state: LegacyState) -> [ProgramReplacement] {
        decodeList(state[replacementsKey]) ?? []
    }

    public static func apply(programReplacements: [ProgramReplacement], to state: inout LegacyState) {
        encodeList(programReplacements, into: &state, key: replacementsKey)
    }

    public static func customExercises(from state: LegacyState) -> [CustomExercise] {
        decodeList(state[customExercisesKey]) ?? []
    }

    public static func apply(customExercises: [CustomExercise], to state: inout LegacyState) {
        encodeList(customExercises, into: &state, key: customExercisesKey)
    }

    private static func decodeList<T: Decodable>(_ value: JSONValue?) -> [T]? {
        guard let value, value != .null, let data = try? JSONEncoder().encode(value) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode([T].self, from: data)
    }

    /// One value as stored JSON, encoded the way every iOS key is.
    static func jsonValue<T: Encodable>(_ value: T) -> JSONValue? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(value) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    static func decodeValue<T: Decodable>(_ value: JSONValue) -> T? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(T.self, from: data)
    }

    private static func encodeList<T: Encodable>(_ list: [T], into state: inout LegacyState, key: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(list),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data)
        else { return }
        state.set(key, to: value)
    }

    // MARK: - Writing
    //
    // Sessions are never written back as a list. Rebuilding every session from
    // the typed model dropped what iOS does not model — a web recovery day's
    // sleep, soreness, energy and activities — and rewrote sessions nobody had
    // touched in iOS's own number format. A session change is a `StateChange`,
    // applied by `StateMerge` to exactly that one session.

    // MARK: - Dates

    // `ISO8601DateFormatter` is not Sendable, so it is built per call rather
    // than cached in a static. Import runs once over a few dozen sessions;
    // the allocation is not worth a lock.
    private static func formatter(fractionalSeconds: Bool) -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = fractionalSeconds
            ? [.withInternetDateTime, .withFractionalSeconds]
            : [.withInternetDateTime]
        return formatter
    }

    public static func isoDate(_ string: String) -> Date? {
        formatter(fractionalSeconds: true).date(from: string)
            ?? formatter(fractionalSeconds: false).date(from: string)
    }

    /// Milliseconds included, matching what the web app writes
    /// (`new Date().toISOString()`).
    public static func isoString(_ date: Date) -> String {
        formatter(fractionalSeconds: true).string(from: date)
    }
}

extension JSONValue {
    init(session: TrainingSession) {
        var object: [String: JSONValue] = [
            "id": .string(session.id),
            "date": .string(LegacyAdapter.isoString(session.date)),
            "dayId": .string(session.dayID),
            "dayLabel": .string(session.dayLabel),
            "completion": .number(Decimal(session.completion)),
            "results": .array(session.results.map { JSONValue(result: $0) }),
        ]
        if session.kind == .recovery { object["sessionType"] = .string("recovery") }
        if let duration = session.durationSeconds { object["durationSeconds"] = .number(Decimal(duration)) }
        if let note = session.note { object["note"] = .string(note) }
        if let planned = session.plannedSetCount, let completed = session.completedSetCount {
            object[LegacyAdapter.plannedSetCountKey] = .number(Decimal(planned))
            object[LegacyAdapter.completedSetCountKey] = .number(Decimal(completed))
        }
        self = .object(object)
    }

    init(result: ExerciseResult) {
        self = .object([
            "exerciseId": .string(result.exerciseID),
            "name": .string(result.name),
            "sets": .array(result.sets.map { JSONValue(set: $0) }),
        ])
    }

    init(set: LoggedSet) {
        var object: [String: JSONValue] = [
            "weight": .string(set.weightKg.map { "\($0)" } ?? ""),
            "reps": .string(set.reps > 0 ? "\(set.reps)" : ""),
            "pausedReps": .string(set.pausedReps.map { "\($0)" } ?? ""),
            "pauseSeconds": .string(set.modifiers.pauseSeconds.map { "\(Int($0))" } ?? ""),
            "pauseEnabled": .bool(set.modifiers.pauseEnabled),
        ]
        if let rir = set.rirReported { object["rir"] = .number(Decimal(rir)) }
        if set.isWarmup { object["isWarmup"] = .bool(true) }
        if let partial = set.partialReps, partial > 0 { object["partialReps"] = .number(Decimal(partial)) }
        if let origin = set.substitutedFrom { object["substitutedFrom"] = .string(origin) }
        // Written only for added sets, so a prescribed set keeps the web app's
        // exact shape.
        if set.origin == .sessionAdded { object["origin"] = .string(SetOrigin.sessionAdded.rawValue) }
        self = .object(object)
    }
}
