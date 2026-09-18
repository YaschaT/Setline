#if DEBUG
import Foundation
import SetlineCore

/// Development-only sample data, enabled with the `-SetlineDemoData` launch
/// argument.
///
/// Entirely fabricated. `PRIVATE-DATA/` is never bundled, never copied into
/// source and never shipped (HANDOVER.md guardrail 4) — this exists so the
/// logging loop can be exercised and screenshotted without real credentials
/// and without anyone's real history.
///
/// Three prior sessions, because that is exactly the reference gate: with
/// two there is no proposal and no record, with three there is.
enum DemoData {

    static var isEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-SetlineDemoData")
    }

    static let session = AuthSession(
        accessToken: "demo",
        refreshToken: "demo",
        userID: "00000000-0000-0000-0000-000000000000",
        email: "demo@setline.be",
        expiresAt: nil
    )

    /// Push, three times, at the same load, hitting the top of the range —
    /// so bench reads READY and the first logged set of the new session
    /// lands as a delta against it.
    static func state() -> LegacyState {
        let calendar = Calendar(identifier: .gregorian)
        let loads: [String: Decimal] = [
            "flat-bench": 100,
            "incline-bench": 80,
            "pec-fly": 55,
            "push-shoulder": 60,
            "push-lateral": 12,
            "overhead-triceps": 30,
            "pressdown": 35,
        ]

        var sessions: [JSONValue] = []
        for index in 0..<3 {
            let date = calendar.date(byAdding: .day, value: -(index + 1) * 7, to: Date())!
            // The oldest session sits one step lower, so the home screen has a
            // real "+5 kg sinds ..." to say and the two sessions since then
            // are what make the proposal READY.
            let step: Decimal = index == 2 ? 5 : 0
            // `-SetlineNewExercise` leaves the last push exercise out of the
            // seeded history, so it has nothing to compare against and the
            // calibration path is reachable.
            let dropsLast = ProcessInfo.processInfo.arguments.contains("-SetlineNewExercise")
            let planned = PlanCatalog.personal.first { $0.id == "push" }?.exercises ?? []
            let seeded = dropsLast ? Array(planned.dropLast()) : planned
            let results = seeded.map { planned -> JSONValue in
                    let load = (loads[planned.exerciseID] ?? 40) - step
                    let sets = planned.sets.map { prescription -> JSONValue in
                        JSONValue.object([
                            "weight": .string("\(load)"),
                            "reps": .string("\(prescription.repRange.upperBound)"),
                            "pausedReps": .string(""),
                            "pauseSeconds": .string(""),
                            "pauseEnabled": .bool(false),
                            "rir": .number(1),
                        ])
                    }
                    return .object([
                        "exerciseId": .string(planned.exerciseID),
                        "name": .string(ExerciseCatalog.exercise(planned.exerciseID)?.name ?? planned.exerciseID),
                        "sets": .array(sets),
                    ])
                }

            sessions.append(.object([
                "id": .string("demo-\(index)"),
                "date": .string(LegacyAdapter.isoString(date)),
                "dayId": .string("push"),
                "dayLabel": .string("Push"),
                "completion": .number(100),
                "results": .array(results),
            ]))
        }

        // Today is a push day whatever the weekday, so the slice is always
        // reachable from a cold launch.
        // `-SetlineUpperDay` puts today on Upper, which is where the planned
        // paused bench lives.
        let today = ProcessInfo.processInfo.arguments.contains("-SetlineUpperDay") ? "upper" : "push"
        let overrides = JSONValue.object([
            "personal:\(Schedule.dateKey(Date()))": .string(today)
        ])

        // Weigh-ins, so the Lichaam segment has a real series to draw. The
        // numbers are the design's own (79,8 → 82,4 kg), kept consistent with
        // the rest of the mock.
        let weighIns: [(Int, String)] = [(56, "79.8"), (28, "81"), (14, "81.8"), (3, "82.4")]
        let metrics = weighIns.map { daysAgo, weight -> JSONValue in
            let when = calendar.date(byAdding: .day, value: -daysAgo, to: Date())!
            return .object([
                "id": .string("demo-weigh-\(daysAgo)"),
                "date": .string(Schedule.dateKey(when)),
                "weight": .number(Decimal(string: weight) ?? 0),
            ])
        }

        // A day's eating, with the handoff's own numbers: 1.840 of 2.250 kcal
        // eaten, so 410 left, and macros that add up to 142 · 188 · 61.
        let todayKey = Schedule.dateKey(Date())
        let food: [(String, String, Double, Double, Double, Double)] = [
            ("Havermout, magere kwark", "Ontbijt", 520, 38, 60, 14),
            ("Kip, rijst, broccoli", "Lunch", 740, 58, 82, 22),
            ("Whey, banaan", "Pre-workout", 310, 32, 30, 5),
            ("Volkoren boterham, kaas", "Snack", 270, 14, 16, 20),
        ]
        let nutritionEntries = food.enumerated().map { index, item -> JSONValue in
            let (name, meal, calories, protein, carbs, fat) = item
            return .object([
                "id": .string("demo-food-\(index)"),
                "date": .string(todayKey),
                "meal": .string(meal),
                "name": .string(name),
                "calories": .number(Decimal(calories)),
                "protein": .number(Decimal(protein)),
                "carbs": .number(Decimal(carbs)),
                "fat": .number(Decimal(fat)),
            ])
        }

        var raw: [String: JSONValue] = [
            "planMode": .string("personal"),
            "sciencePlanId": .string("ppl-ul"),
            "sessions": .array(sessions),
            "metrics": .array(metrics),
            "scheduleOverrides": overrides,
            "nutritionEntries": .array(nutritionEntries),
            "targets": .object([
                "calories": .number(2250),
                "protein": .number(165),
                "carbs": .number(240),
                "fat": .number(70),
            ]),
            "updatedAt": .string(LegacyAdapter.isoString(Date())),
        ]

        // `-SetlineFatigued` seeds two recent push sessions in which reps fall
        // at the same load on two exercises and RIR falls on a third — the two
        // signals artboard 18R proposes on.
        if ProcessInfo.processInfo.arguments.contains("-SetlineFatigued") {
            let tired: [JSONValue] = [(2, 5, 11, 0), (5, 6, 12, 2)].map { offset, bench, fly, rir in
                let date = calendar.date(byAdding: .day, value: -offset, to: Date())!
                func result(_ id: String, _ load: String, _ reps: Int, _ rir: Int?) -> JSONValue {
                    var set: [String: JSONValue] = [
                        "weight": .string(load),
                        "reps": .string("\(reps)"),
                        "pausedReps": .string(""),
                        "pauseSeconds": .string(""),
                        "pauseEnabled": .bool(false),
                    ]
                    if let rir { set["rir"] = .number(Decimal(rir)) }
                    return .object([
                        "exerciseId": .string(id),
                        "name": .string(ExerciseCatalog.exercise(id)?.name ?? id),
                        "sets": .array([.object(set)]),
                    ])
                }
                return .object([
                    "id": .string("demo-tired-\(offset)"),
                    "date": .string(LegacyAdapter.isoString(date)),
                    "dayId": .string("push"),
                    "dayLabel": .string("Push"),
                    "completion": .number(100),
                    "results": .array([
                        result("flat-bench", "100", bench, nil),
                        result("pec-fly", "55", fly, nil),
                        result("pressdown", "35", 12, rir),
                    ]),
                ])
            }
            raw["sessions"] = .array(tired + sessions)
        }

        // `-SetlinePausedYesterday` seeds a paused Pull session dated
        // yesterday, so the across-a-date-boundary resume can be exercised
        // without touching the device clock.
        if ProcessInfo.processInfo.arguments.contains("-SetlinePausedYesterday") {
            var state = LegacyState(raw: raw)
            let yesterday = calendar.date(byAdding: .day, value: -1, to: Date())!
            let pullDay = PlanCatalog.personal.first { $0.id == "pull" }
            let results = (pullDay?.exercises.prefix(2) ?? []).enumerated().map { index, planned in
                ExerciseResult(
                    exerciseID: planned.exerciseID,
                    name: ExerciseCatalog.exercise(planned.exerciseID)?.name ?? planned.exerciseID,
                    sets: planned.sets.enumerated().map { setIndex, _ in
                        LoggedSet(
                            index: setIndex,
                            weightKg: 60,
                            reps: index == 0 && setIndex < 2 ? 8 : 0
                        )
                    }
                )
            }
            LegacyAdapter.apply(
                activeSession: ActiveSessionSnapshot(
                    dayID: "pull",
                    dayLabel: "Pull",
                    startedAt: yesterday,
                    currentIndex: 0,
                    results: Array(results),
                    // 25 minutes trained yesterday before pausing. The
                    // fourteen hours since must not appear in the clock.
                    activeSeconds: 1_500
                ),
                to: &state
            )
            return state
        }

        return LegacyState(raw: raw)
    }
}
#endif
