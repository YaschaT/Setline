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

    /// `-SetlineDemoAccount b` signs in a second demo account instead, with
    /// its own user id, stored data and photos, so keeping accounts apart can
    /// be checked on one device without signing in to a real one.
    static var session: AuthSession {
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "-SetlineDemoAccount"), arguments.indices.contains(flag + 1) {
            let name = arguments[flag + 1].lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
            if !name.isEmpty {
                return AuthSession(
                    accessToken: "demo",
                    refreshToken: "demo",
                    userID: "demo-\(name)",
                    email: "demo-\(name)@setline.be",
                    expiresAt: nil
                )
            }
        }
        return AuthSession(
            accessToken: "demo",
            refreshToken: "demo",
            userID: "00000000-0000-0000-0000-000000000000",
            email: "demo@setline.be",
            expiresAt: nil
        )
    }

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

        // Upper's bench, trained both ways — the shape that broke Progressie.
        //
        // The programme prescribes a two-second pause; three of these sessions
        // were pressed touch-and-go anyway and two were paused, and the paused
        // ones are written the way the web app writes them: the count typed
        // out over every rep. One lift, two comparable series (§9.2), and
        // neither of them may be read as the other.
        let pausedBench: [(day: Int, weightKg: Int, reps: Int, paused: Bool)] = [
            (day: 24, weightKg: 85, reps: 5, paused: true),
            (day: 17, weightKg: 85, reps: 5, paused: true),
            (day: 10, weightKg: 100, reps: 5, paused: false),
            (day: 6, weightKg: 100, reps: 4, paused: false),
            (day: 3, weightKg: 97, reps: 5, paused: false),
        ]
        for (index, entry) in pausedBench.enumerated() {
            let date = calendar.date(byAdding: .day, value: -entry.day, to: Date())!
            let sets = (0..<3).map { _ in
                JSONValue.object([
                    "weight": .string("\(entry.weightKg)"),
                    "reps": .string("\(entry.reps)"),
                    "pausedReps": .string(entry.paused ? "\(entry.reps)" : ""),
                    "pauseSeconds": .string(entry.paused ? "2" : ""),
                    "pauseEnabled": .bool(entry.paused),
                    "rir": .number(2),
                ])
            }
            sessions.append(.object([
                "id": .string("demo-upper-\(index)"),
                "date": .string(LegacyAdapter.isoString(date)),
                "dayId": .string("upper"),
                "dayLabel": .string("Upper"),
                "completion": .number(100),
                "results": .array([.object([
                    "exerciseId": .string("upper-paused-bench"),
                    "name": .string(ExerciseCatalog.exercise("upper-paused-bench")?.name ?? "Paused bench"),
                    "sets": .array(sets),
                ])]),
            ]))
        }

        // `-SetlineDemoMedals` adds a fourth Push two days ago that beats,
        // matches and trails the three before it, so the workout page shows
        // gold, silver and bronze.
        if ProcessInfo.processInfo.arguments.contains("-SetlineDemoMedals") {
            let date = calendar.date(byAdding: .day, value: -2, to: Date())!
            let change: [String: Decimal] = ["flat-bench": 2.5, "incline-bench": 0, "pec-fly": -2.5]
            let planned = PlanCatalog.personal.first { $0.id == "push" }?.exercises ?? []
            let results = planned.map { planned -> JSONValue in
                let load = (loads[planned.exerciseID] ?? 40) + (change[planned.exerciseID] ?? -20)
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
                "id": .string("demo-medals"),
                "date": .string(LegacyAdapter.isoString(date)),
                "dayId": .string("push"),
                "dayLabel": .string("Push"),
                "completion": .number(100),
                "durationSeconds": .number(3060),
                "results": .array(results),
            ]))
        }

        // `-SetlineDemoStreak` fills every day of the four weeks before this
        // one, so Training has a streak to show. `-SetlineDemoStreak secured`
        // also fills this week up to its goal with today as the last one,
        // for the week-secured moment.
        let streakFlag = ProcessInfo.processInfo.arguments.firstIndex(of: "-SetlineDemoStreak")
        if let streakFlag {
            let secured = ProcessInfo.processInfo.arguments.indices.contains(streakFlag + 1)
                && ProcessInfo.processInfo.arguments[streakFlag + 1] == "secured"
            let monday = Schedule.mondayFirstWeek(containing: Date()).first ?? Date()
            var dates: [Date] = (1...28).compactMap { calendar.date(byAdding: .day, value: -$0, to: monday) }
            if secured {
                let others = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }
                    .filter { !calendar.isDateInToday($0) }
                dates += Array(others.prefix(5)) + [Date()]
            }
            for (index, date) in dates.enumerated() {
                sessions.append(.object([
                    "id": .string("demo-streak-\(index)"),
                    "date": .string(LegacyAdapter.isoString(date)),
                    "dayId": .string("legs"),
                    "dayLabel": .string("Legs"),
                    "completion": .number(100),
                    "results": .array([]),
                ]))
            }
        }

        // Today is a push day whatever the weekday, so the slice is always
        // reachable from a cold launch.
        // `-SetlineUpperDay` puts today on Upper, which is where the planned
        // paused bench lives.
        // `-SetlineRestDay` rests today, for the screens that only show then.
        let arguments = ProcessInfo.processInfo.arguments
        let today = arguments.contains("-SetlineRestDay") ? "rest"
            : arguments.contains("-SetlineUpperDay") ? "upper" : "push"
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

        // A day's eating, with 42a's own rows: 1.100 of 2.250 kcal eaten, so
        // 1.150 left, macros adding up to 88 · 131 · 32, and avondeten still
        // empty. Each item carries its amount and the hour it was logged at, so
        // the row, the amount stepper and "gelogd 7:40" all have something real
        // to show. The three dinners before today are what "vaak bij
        // avondeten" is read from.
        struct DemoFood {
            let day: Int
            let meal: String
            let name: String
            let calories: Double
            let protein: Double
            let carbs: Double
            let fat: Double
            let amount: Double
            let unit: String
            let hour: Int
            let minute: Int
        }
        let food: [DemoFood] = [
            .init(day: 0, meal: "Ontbijt", name: "Oatmeal", calories: 375, protein: 15, carbs: 60, fat: 12, amount: 100, unit: "g", hour: 7, minute: 40),
            .init(day: 0, meal: "Ontbijt", name: "Low-fat quark", calories: 145, protein: 26, carbs: 10, fat: 1, amount: 250, unit: "g", hour: 7, minute: 40),
            .init(day: 0, meal: "Lunch", name: "Wholegrain sandwich", calories: 170, protein: 9, carbs: 30, fat: 4, amount: 2, unit: "sneden", hour: 12, minute: 55),
            .init(day: 0, meal: "Lunch", name: "Cheese", calories: 100, protein: 9, carbs: 1, fat: 12, amount: 30, unit: "g", hour: 12, minute: 55),
            .init(day: 0, meal: "Snack", name: "Whey", calories: 120, protein: 26, carbs: 3, fat: 2, amount: 30, unit: "g", hour: 16, minute: 20),
            .init(day: 0, meal: "Snack", name: "Banana", calories: 190, protein: 3, carbs: 27, fat: 1, amount: 1, unit: "stuk", hour: 16, minute: 20),

            .init(day: 3, meal: "Avondeten", name: "Chicken breast", calories: 290, protein: 62, carbs: 0, fat: 6, amount: 180, unit: "g", hour: 19, minute: 10),
            .init(day: 3, meal: "Avondeten", name: "Rice, cooked", calories: 390, protein: 8, carbs: 86, fat: 1, amount: 250, unit: "g", hour: 19, minute: 10),
            .init(day: 2, meal: "Avondeten", name: "Chicken breast", calories: 290, protein: 62, carbs: 0, fat: 6, amount: 180, unit: "g", hour: 19, minute: 25),
            .init(day: 2, meal: "Avondeten", name: "Broccoli", calories: 60, protein: 5, carbs: 7, fat: 1, amount: 200, unit: "g", hour: 19, minute: 25),
            .init(day: 2, meal: "Ontbijt", name: "Low-fat quark", calories: 145, protein: 26, carbs: 10, fat: 1, amount: 250, unit: "g", hour: 7, minute: 55),
            .init(day: 1, meal: "Avondeten", name: "Rice, cooked", calories: 390, protein: 8, carbs: 86, fat: 1, amount: 250, unit: "g", hour: 19, minute: 0),
            .init(day: 1, meal: "Snack", name: "Whey", calories: 120, protein: 26, carbs: 3, fat: 2, amount: 30, unit: "g", hour: 16, minute: 45),
        ]
        // `-SetlineEmptyDay` keeps the history and leaves today blank, which is
        // the one state the fabricated day cannot otherwise show (42b).
        let blankToday = ProcessInfo.processInfo.arguments.contains("-SetlineEmptyDay")
        let nutritionEntries = food.filter { !blankToday || $0.day > 0 }.enumerated().map { index, item -> JSONValue in
            let midnight = calendar.startOfDay(for: calendar.date(byAdding: .day, value: -item.day, to: Date())!)
            let when = calendar.date(byAdding: .minute, value: item.hour * 60 + item.minute, to: midnight)!
            return .object([
                "id": .string("demo-food-\(index)"),
                "date": .string(Schedule.dateKey(when)),
                "meal": .string(item.meal),
                "name": .string(item.name),
                "calories": .number(Decimal(item.calories)),
                "protein": .number(Decimal(item.protein)),
                "carbs": .number(Decimal(item.carbs)),
                "fat": .number(Decimal(item.fat)),
                "amount": .number(Decimal(item.amount)),
                "unit": .string(item.unit),
                "loggedAt": .string(LegacyAdapter.isoString(when)),
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

        // `-SetlineFirstRun` keeps the plan and drops the history, so the
        // first-run home (artboard 08) is reachable.
        if ProcessInfo.processInfo.arguments.contains("-SetlineFirstRun") {
            raw["sessions"] = .array([])
            return LegacyState(raw: raw)
        }

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
