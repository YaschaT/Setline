import Foundation

/// Applies iOS changes to the latest stored state without destroying what
/// another client wrote.
///
/// Both clients follow one loop: fetch the latest stored state, apply only
/// their own changes to it, write it back only if nobody wrote in between, and
/// otherwise fetch again and reapply. This is the "apply" step for iOS. The web
/// app implements the same rules in `lib/state-merge.ts`, and both are tested
/// against the shared scenarios in `tests/fixtures/sync`.
///
/// The rules that keep deletion honest:
/// - A key or field iOS does not write is never removed by it.
/// - An explicit `null` clears a value; a missing value never does.
/// - A change made before a deletion (a tombstone) or before an explicit reset
///   of the account loses to it. A change made after it wins.
public enum StateMerge {

    public static let tombstonesKey = "syncTombstones"
    public static let resetKey = "syncReset"

    /// Session fields iOS writes, and therefore owns when it rewrites a session.
    static let sessionFields: Set<String> = [
        "id", "date", "dayId", "dayLabel", "completion", "results", "sessionType",
        "durationSeconds", "note", "iosPlannedSetCount", "iosCompletedSetCount",
    ]
    static let resultFields: Set<String> = ["exerciseId", "name", "sets"]
    static let setFields: Set<String> = [
        "weight", "reps", "pausedReps", "pauseSeconds", "pauseEnabled",
        "rir", "isWarmup", "partialReps", "substitutedFrom", "origin",
    ]
    /// Counts derived from a session's results. They stop describing the
    /// session once it holds results iOS did not write.
    static let derivedSessionFields = ["iosPlannedSetCount", "iosCompletedSetCount"]

    public static func apply(_ changes: [StateChange], to state: LegacyState, now: Date = Date()) -> LegacyState {
        var raw = state.raw
        for change in changes { apply(change, to: &raw, now: now) }
        return LegacyState(raw: raw)
    }

    /// When the account was explicitly wiped, if it was.
    public static func resetDate(_ raw: [String: JSONValue]) -> Date? {
        raw[resetKey]?["at"]?.stringValue.flatMap(LegacyAdapter.isoDate)
    }

    static func apply(_ change: StateChange, to raw: inout [String: JSONValue], now: Date) {
        if let reset = resetDate(raw), change.createdAt < reset { return }

        switch change.kind {
        case .upsertSession(let session):
            upsertSession(session, createdAt: change.createdAt, into: &raw)

        case .correctSessionSets(let sessionID, let corrections):
            correctSessionSets(sessionID: sessionID, corrections: corrections, into: &raw)

        case .setActiveSession(let snapshot):
            raw[LegacyAdapter.activeSessionKey] = snapshot

        case .addPainFlag(let flag):
            updateList(&raw, key: LegacyAdapter.painFlagsKey, as: PainFlag.self) { flags in
                flags.removeAll { $0.id == flag.id }
                flags.append(flag)
                flags = flags.active(on: now)
            }

        case .removePainFlag(let id):
            updateList(&raw, key: LegacyAdapter.painFlagsKey, as: PainFlag.self) { flags in
                flags.removeAll { $0.id == id }
                flags = flags.active(on: now)
            }

        case .addProgramReplacement(let replacement):
            updateList(&raw, key: LegacyAdapter.replacementsKey, as: ProgramReplacement.self) { list in
                list.removeAll { $0.id == replacement.id }
                list.append(replacement)
            }

        case .removeProgramReplacement(let id):
            updateList(&raw, key: LegacyAdapter.replacementsKey, as: ProgramReplacement.self) { list in
                list.removeAll { $0.id == id }
            }

        case .addCustomExercise(let exercise):
            updateList(&raw, key: LegacyAdapter.customExercisesKey, as: CustomExercise.self) { list in
                if !list.contains(where: { $0.id == exercise.id }) { list.append(exercise) }
            }

        case .hideWarmup(let exerciseID):
            var hidden = Set((raw[LegacyAdapter.hiddenWarmupsKey]?.arrayValue ?? []).compactMap(\.stringValue))
            hidden.insert(exerciseID)
            raw[LegacyAdapter.hiddenWarmupsKey] = .array(hidden.sorted().map { .string($0) })

        case .setScheduleDay(let key, let dayID):
            // One date, never the map: a day the web moved stays moved.
            var overrides = raw["scheduleOverrides"]?.objectValue ?? [:]
            overrides[key] = .string(dayID)
            raw["scheduleOverrides"] = .object(overrides)

        case .removeScheduleOverride(let key):
            // Explicit: this date goes back to the program's default week.
            // A date nobody mentions is never removed by any of this.
            guard var overrides = raw["scheduleOverrides"]?.objectValue else { return }
            overrides.removeValue(forKey: key)
            raw["scheduleOverrides"] = .object(overrides)

        case .upsertNutritionEntry(let entry):
            upsertItem(entry, in: &raw, collection: "nutritionEntries", fields: nutritionFields, createdAt: change.createdAt)

        case .removeNutritionEntry(let entryID):
            removeItem(entryID, in: &raw, collection: "nutritionEntries", at: change.createdAt)

        case .upsertMetric(let metric):
            // A weigh-in is one row among the account's own: the day's entry is
            // written again by its id, and every other weigh-in stays as
            // stored — including a waist the web app measured, which is not a
            // field this client owns.
            upsertItem(metric, in: &raw, collection: "metrics", fields: metricFields, createdAt: change.createdAt)

        case .setProgram(let mode, let sciencePlanID):
            // Which programme the account is on, and nothing more. The plan it
            // edited itself is left exactly as the web app wrote it, because a
            // science programme is not stored in `plan` at all — and switching
            // back has to find that plan intact.
            raw["planMode"] = .string(mode)
            if let sciencePlanID { raw["sciencePlanId"] = .string(sciencePlanID) }

        case .setExperience(let level):
            // One key. The web app does not read it yet and must not lose it:
            // a key nobody mentions is a key nobody deletes.
            raw["experienceLevel"] = .string(level)

        case .setEquipment(let plates, let barKg):
            raw["plates"] = .array(plates.map { .number($0) })
            raw["barWeightKg"] = .number(barKg)

        case .setDeload(let deload):
            // A lighter week, or `null` to end one early. iOS's own key.
            raw[LegacyAdapter.deloadKey] = deload

        case .setTarget(let field, let value):
            // One field. Targets the app does not model stay as they are.
            var targets = raw["targets"]?.objectValue ?? [:]
            targets[field] = .number(value)
            raw["targets"] = .object(targets)
        }
    }

    // MARK: - Sessions

    static func upsertSession(_ session: JSONValue, createdAt: Date, into raw: inout [String: JSONValue]) {
        guard case .object(let incoming) = session, let id = incoming["id"]?.stringValue else { return }

        var tombstones = raw[tombstonesKey]?.objectValue ?? [:]
        var deleted = tombstones["sessions"]?.objectValue ?? [:]
        if let deletedAt = deleted[id]?.stringValue.flatMap(LegacyAdapter.isoDate) {
            // Changed before someone deleted it: it stays deleted.
            guard createdAt >= deletedAt else { return }
            // Logged again after the deletion: that is a new decision.
            deleted.removeValue(forKey: id)
            if deleted.isEmpty {
                tombstones.removeValue(forKey: "sessions")
            } else {
                tombstones["sessions"] = .object(deleted)
            }
            raw[tombstonesKey] = .object(tombstones)
        }

        var sessions = raw["sessions"]?.arrayValue ?? []
        if let index = sessions.firstIndex(where: { $0["id"]?.stringValue == id }),
           case .object(let stored) = sessions[index] {
            sessions[index] = .object(mergeSession(incoming, over: stored))
        } else {
            sessions.insert(.object(incoming), at: 0)
        }
        raw["sessions"] = .array(sessions)
    }

    /// Corrections to sets already logged, applied where they were logged.
    ///
    /// Unlike an upsert, this never rewrites a session's results: it reaches
    /// the named sets and changes only the values a set carries. A session
    /// that is not stored — never written here, or deleted meanwhile — is left
    /// alone rather than recreated, and a set that has moved or is no longer
    /// there is skipped rather than guessed at. Missing is never a deletion.
    static func correctSessionSets(
        sessionID: String,
        corrections: [SetCorrection],
        into raw: inout [String: JSONValue]
    ) {
        var sessions = raw["sessions"]?.arrayValue ?? []
        guard let sessionIndex = sessions.firstIndex(where: { $0["id"]?.stringValue == sessionID }),
              case .object(var session) = sessions[sessionIndex]
        else { return }

        var results = session["results"]?.arrayValue ?? []
        var corrected = false

        for correction in corrections {
            guard correction.isLogged else { continue }

            let matches = results.indices.filter {
                results[$0]["exerciseId"]?.stringValue == correction.exerciseID
            }
            guard matches.indices.contains(correction.occurrence) else { continue }
            let resultIndex = matches[correction.occurrence]

            guard case .object(var result) = results[resultIndex],
                  case .array(var sets)? = result["sets"],
                  sets.indices.contains(correction.setIndex),
                  case .object(let stored) = sets[correction.setIndex]
            else { continue }

            sets[correction.setIndex] = .object(correction.applied(to: stored))
            result["sets"] = .array(sets)
            results[resultIndex] = .object(result)
            corrected = true
        }

        guard corrected else { return }
        session["results"] = .array(results)
        sessions[sessionIndex] = .object(session)
        raw["sessions"] = .array(sessions)
    }

    /// iOS's version of a session laid over the stored one.
    ///
    /// Fields iOS writes come from iOS. Everything else on the session, on
    /// each exercise result and on each set is kept. Exercises already logged
    /// in this session that iOS did not log again are kept too — the same rule
    /// the web app follows when a day is re-logged.
    static func mergeSession(_ incoming: [String: JSONValue], over stored: [String: JSONValue]) -> [String: JSONValue] {
        var merged = incoming
        for (key, value) in stored where !sessionFields.contains(key) && merged[key] == nil {
            merged[key] = value
        }

        let incomingResults = incoming["results"]?.arrayValue ?? []
        let storedResults = stored["results"]?.arrayValue ?? []
        let incomingExercises = Set(incomingResults.compactMap { $0["exerciseId"]?.stringValue })
        var claimed = Set<Int>()

        var results: [JSONValue] = incomingResults.map { result in
            guard case .object(var object) = result,
                  let exercise = object["exerciseId"]?.stringValue,
                  let match = storedResults.indices.first(where: {
                      !claimed.contains($0) && storedResults[$0]["exerciseId"]?.stringValue == exercise
                  }),
                  case .object(let storedResult) = storedResults[match]
            else { return result }
            claimed.insert(match)

            for (key, value) in storedResult where !resultFields.contains(key) && object[key] == nil {
                object[key] = value
            }
            if case .array(let sets)? = object["sets"] {
                let storedSets = storedResult["sets"]?.arrayValue ?? []
                object["sets"] = .array(sets.enumerated().map { index, set in
                    guard case .object(var setObject) = set,
                          storedSets.indices.contains(index),
                          case .object(let storedSet) = storedSets[index]
                    else { return set }
                    for (key, value) in storedSet where !setFields.contains(key) && setObject[key] == nil {
                        setObject[key] = value
                    }
                    return .object(setObject)
                })
            }
            return .object(object)
        }

        let kept = storedResults.indices.filter { index in
            guard !claimed.contains(index) else { return false }
            guard let exercise = storedResults[index]["exerciseId"]?.stringValue else { return true }
            return !incomingExercises.contains(exercise)
        }
        if !kept.isEmpty {
            results.append(contentsOf: kept.map { storedResults[$0] })
            for field in derivedSessionFields { merged.removeValue(forKey: field) }
        }
        merged["results"] = .array(results)
        return merged
    }

    // MARK: - Shared collections, by id

    /// What a weigh-in is made of here. `waist` is deliberately absent: the
    /// web app measures it, this app does not, and a field a client does not
    /// own is carried through untouched.
    static let metricFields: Set<String> = ["id", "date", "weight"]

    /// The fields a meal carries, and therefore the ones iOS may rewrite.
    static let nutritionFields: Set<String> = ["id", "date", "meal", "name", "calories", "protein", "carbs", "fat"]

    /// Writes one item into a shared collection without touching its
    /// neighbours, and without resurrecting something already deleted.
    static func upsertItem(
        _ item: JSONValue,
        in raw: inout [String: JSONValue],
        collection: String,
        fields: Set<String>,
        createdAt: Date
    ) {
        guard case .object(let incoming) = item, let id = incoming["id"]?.stringValue else { return }
        guard !isOutrankedByDeletion(id: id, collection: collection, createdAt: createdAt, in: &raw) else { return }

        var items = raw[collection]?.arrayValue ?? []
        if let index = items.firstIndex(where: { $0["id"]?.stringValue == id }), case .object(let stored) = items[index] {
            var merged = incoming
            for (key, value) in stored where !fields.contains(key) && merged[key] == nil {
                merged[key] = value
            }
            items[index] = .object(merged)
        } else {
            // Appended, because the web app appends: a day's food reads in the
            // order it was eaten on both clients or on neither.
            items.append(.object(incoming))
        }
        raw[collection] = .array(items)
    }

    /// Removes one item and records the deletion, so a client still holding an
    /// older copy cannot put it back.
    static func removeItem(_ id: String, in raw: inout [String: JSONValue], collection: String, at deletedAt: Date) {
        var items = raw[collection]?.arrayValue ?? []
        items.removeAll { $0["id"]?.stringValue == id }
        raw[collection] = .array(items)

        var tombstones = raw[tombstonesKey]?.objectValue ?? [:]
        var deleted = tombstones[collection]?.objectValue ?? [:]
        deleted[id] = .string(LegacyAdapter.isoString(deletedAt))
        tombstones[collection] = .object(deleted)
        raw[tombstonesKey] = .object(tombstones)
    }

    /// A change made before someone deleted the item loses to the deletion;
    /// one made after it is a new decision and clears the record.
    static func isOutrankedByDeletion(
        id: String,
        collection: String,
        createdAt: Date,
        in raw: inout [String: JSONValue]
    ) -> Bool {
        var tombstones = raw[tombstonesKey]?.objectValue ?? [:]
        var deleted = tombstones[collection]?.objectValue ?? [:]
        guard let deletedAt = deleted[id]?.stringValue.flatMap(LegacyAdapter.isoDate) else { return false }
        guard createdAt >= deletedAt else { return true }

        deleted.removeValue(forKey: id)
        if deleted.isEmpty {
            tombstones.removeValue(forKey: collection)
        } else {
            tombstones[collection] = .object(deleted)
        }
        raw[tombstonesKey] = .object(tombstones)
        return false
    }

    // MARK: - iOS-owned lists

    /// Edits a stored list by identity. Entries this build cannot read are
    /// kept exactly as they are.
    static func updateList<Item: Codable & Identifiable>(
        _ raw: inout [String: JSONValue],
        key: String,
        as type: Item.Type,
        _ update: (inout [Item]) -> Void
    ) {
        var items: [Item] = []
        var unreadable: [JSONValue] = []
        for entry in raw[key]?.arrayValue ?? [] {
            if let item: Item = LegacyAdapter.decodeValue(entry) {
                items.append(item)
            } else {
                unreadable.append(entry)
            }
        }
        update(&items)
        raw[key] = .array(items.compactMap { LegacyAdapter.jsonValue($0) } + unreadable)
    }
}
