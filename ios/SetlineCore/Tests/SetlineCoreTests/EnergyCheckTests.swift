import XCTest
@testable import SetlineCore

/// Nutrition › Your plan: whether the eating fits the goal, by the equations.
final class EnergyCheckTests: XCTestCase {
    private let now = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 10, day: 31, hour: 12))!
    private let profile = BodyProfile(heightCm: 182, sex: .male, birthYear: 1999)

    private func check(_ profile: BodyProfile? = nil, target: Int? = 2250, kcal: Double? = 696, protein: Double? = 71) -> EnergyCheck {
        EnergyCheck.make(profile: profile ?? self.profile, weightKg: 82.4, goal: .cut, workoutsPerWeek: 2,
                         calorieTarget: target, averageKcal: kcal, averageProtein: protein, now: now)
    }

    func testMifflinStJeorTimesActivityGivesMaintenance() {
        let energy = check()
        XCTAssertEqual(energy.bmr, 1830)
        XCTAssertEqual(energy.activityFactor, 1.375)
        XCTAssertEqual(energy.maintenance, 2520)
        XCTAssertEqual(energy.bmi, 24.9)
        XCTAssertEqual(energy.bmiLabel, "Healthy range")
    }

    func testACutNeverAsksToEatBelowRestingEnergy() {
        let energy = check()
        // 1 % a week would be 1,612 kcal; resting energy (1,832) is the floor.
        XCTAssertEqual(energy.calorieRange, 1850...2050)
        XCTAssertEqual(energy.proteinRange, 165...198)
    }

    func testTargetIntakeAndProteinAreJudgedAgainstTheRange() {
        let energy = check()
        XCTAssertEqual(energy.target, .high)
        XCTAssertEqual(energy.intake, .low)
        XCTAssertEqual(energy.protein, .low)
        let good = check(target: 1950, kcal: 2000, protein: 170)
        XCTAssertEqual(good.target, .good)
        XCTAssertEqual(good.intake, .good)
        XCTAssertEqual(good.protein, .good)
        let unknown = check(target: nil, kcal: nil, protein: nil)
        XCTAssertEqual(unknown.target, .unknown)
        XCTAssertEqual(unknown.intake, .unknown)
    }

    func testSexChangesRestingEnergyBy166() {
        let female = check(BodyProfile(heightCm: 182, sex: .female, birthYear: 1999))
        XCTAssertEqual(female.bmr, 1670)
    }

    func testTheWeightTrendDecidesOnceItCan() {
        XCTAssertEqual(EnergyCheck.direction(trend: .onTrack, intake: .low), .right)
        XCTAssertEqual(EnergyCheck.direction(trend: .wrongWay, intake: .good), .off)
        XCTAssertEqual(EnergyCheck.direction(trend: .tooEarly(weighInsNeeded: 2, daysNeeded: 5), intake: .good), .right)
        XCTAssertEqual(EnergyCheck.direction(trend: nil, intake: .high), .off)
        XCTAssertEqual(EnergyCheck.direction(trend: .unclear, intake: .unknown), .unknown)
    }

    func testWorkoutsAWeekComeFromTheLastFourWeeks() {
        let dates = (0..<10).map { now.addingTimeInterval(-Double($0) * 3 * 86_400) }
        XCTAssertEqual(EnergyCheck.workoutsPerWeek(sessionDates: dates, now: now), 2.5)
        XCTAssertFalse(BodyProfile(heightCm: 182, sex: .male, birthYear: 2020).isValid(now: now))
        XCTAssertTrue(profile.isValid(now: now))
    }
}
