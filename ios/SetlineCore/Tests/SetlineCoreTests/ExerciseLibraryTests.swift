import XCTest
@testable import SetlineCore

final class ExerciseLibraryTests: XCTestCase {
    private func entry(_ id: String, _ name: String, muscle: String = "chest", category: String = "strength") -> String {
        #"{"id":"\#(id)","name":"\#(name)","equipment":"barbell","primaryMuscles":["\#(muscle)"],"mechanic":"compound","category":"\#(category)"}"#
    }

    private var library: ExerciseLibrary {
        let json = "[" + [
            entry("Landmine_Press", "Landmine Press", muscle: "shoulders"),
            entry("Landmine_Row", "Landmine Row", muscle: "middle back"),
            entry("Single_Arm_Landmine_Press", "Single Arm Landmine Press", muscle: "shoulders"),
            entry("Hamstring_Stretch", "Hamstring Stretch", muscle: "hamstrings", category: "stretching"),
            entry("Barbell_Squat", "Barbell Squat", muscle: "quadriceps"),
        ].joined(separator: ",") + "]"
        return try! ExerciseLibrary(data: Data(json.utf8))
    }

    func testEveryWordMustMatchShortestFirst() {
        XCTAssertEqual(library.search("landmine press").map(\.id), ["Landmine_Press", "Single_Arm_Landmine_Press"])
    }

    func testOnlyStrengthWork() {
        XCTAssertTrue(library.search("stretch").isEmpty)
    }

    func testWhatTheCatalogueHasIsNotOfferedAgain() {
        XCTAssertTrue(library.search("squat", excludingNames: ["Barbell squat"]).isEmpty)
    }

    func testAddingKeepsGroupAndPhotos() throws {
        let custom = library.search("landmine row")[0].customExercise()
        XCTAssertEqual(custom.muscleGroup, .rug)
        XCTAssertEqual(custom.photoFolder, "Landmine_Row")
        XCTAssertEqual(custom.equipment, .barbell)
        XCTAssertTrue(custom.isCompound)
        // It comes back through sync with both, and the picker lists it.
        let back = try JSONDecoder().decode(CustomExercise.self, from: JSONEncoder().encode(custom))
        XCTAssertEqual(back, custom)
        XCTAssertTrue(ExercisePicker.rows(sessions: [], custom: [back]).contains { $0.exerciseID == custom.id && $0.group == .rug })
    }

    func testAnExerciseMadeByHandStaysOutOfThePicker() {
        let made = CustomExercise(name: "Cable thing")
        XCTAssertFalse(ExercisePicker.rows(sessions: [], custom: [made]).contains { $0.exerciseID == made.id })
    }
}
