// Generated from app/page.tsx by scratchpad/gen/generate.py — do not hand-edit.
//
// The curated `fit` / `why` lines for each exercise's alternatives.
// TRAINING_LOGIC §12.1: the native app computes the ranking from attributes
// and "uses the written `why` lines as curated overrides where they exist".
// Phase 1 carries the content; Phase 3 adds the ranking that consumes it.

import Foundation

public struct ExerciseAlternative: Codable, Hashable, Sendable {
    public let name: String
    /// One- or two-word honest fit label ("Sterke match", "Stabieler").
    public let fit: String
    public let why: String

    public init(name: String, fit: String, why: String) {
        self.name = name
        self.fit = fit
        self.why = why
    }
}

public enum AlternativesCatalog {

    public static let byExercise: [String: [ExerciseAlternative]] = [
        "flat-bench": [
            ExerciseAlternative(name: "Dumbbell bench press", fit: "Zelfde rol", why: "Horizontale press met grote ROM; behoud sets, reps en RIR maar reset het gewicht."),
            ExerciseAlternative(name: "Converging chest press", fit: "Stabieler", why: "Zelfde borst- en tricepsdoel met minder stabiliteitsvraag. Handig als alle benches bezet zijn."),
        ],
        "upper-paused-bench": [
            ExerciseAlternative(name: "Flat bench press", fit: "Zonder pauze", why: "Behoud dezelfde press en belasting, maar laat 1–2 reps extra in reserve omdat dit je tweede benchmoment is."),
            ExerciseAlternative(name: "Dumbbell bench press", fit: "Minder specifiek", why: "Goede horizontale press wanneer de bench bezet is; behoud 3 sets en werk in 6–10 reps."),
        ],
        "incline-bench": [
            ExerciseAlternative(name: "Incline dumbbell press", fit: "Zelfde patroon", why: "Schuine press met vrije armpositie en diepe, controleerbare borststretch."),
            ExerciseAlternative(name: "Incline chest-pressmachine", fit: "Zelfde rol", why: "Meer stabiliteit; daardoor kun je dicht bij falen trainen zonder spotter."),
        ],
        "incline-machine": [
            ExerciseAlternative(name: "Incline dumbbell press", fit: "Sterke match", why: "Behoudt de schuine press en bovenborstfocus; start conservatief met het gewicht."),
            ExerciseAlternative(name: "Low-to-high cable press", fit: "Apparaatvrij", why: "Vergelijkbare pressrichting en constante kabelspanning, met lagere absolute belasting."),
        ],
        "pec-fly": [
            ExerciseAlternative(name: "Cable fly", fit: "Zelfde isolatie", why: "Horizontale adductie met instelbare lijn; behoud de 10–15 rep-range."),
            ExerciseAlternative(name: "Dumbbell fly", fit: "Redelijke match", why: "Vergelijkbaar doel, maar minder spanning bovenaan. Gebruik licht gewicht en gecontroleerde ROM."),
        ],
        "upper-fly": [
            ExerciseAlternative(name: "Pec-deck", fit: "Sterke match", why: "Stabiele borstisolatie; makkelijk progressief te loggen en dicht bij falen te trainen."),
            ExerciseAlternative(name: "Cable fly", fit: "1-op-1", why: "Behoud dezelfde lijn, rep-range en volledige pijnvrije ROM."),
        ],
        "push-shoulder": [
            ExerciseAlternative(name: "Seated dumbbell press", fit: "Zelfde patroon", why: "Verticale press met vrije armpositie; verlaag het startgewicht en behoud RIR 1–2."),
            ExerciseAlternative(name: "Smith shoulder press", fit: "Stabiele match", why: "Verticale press met minder stabiliteitsvraag en voorspelbare progressie."),
        ],
        "upper-shoulder": [
            ExerciseAlternative(name: "Seated dumbbell press", fit: "Zelfde patroon", why: "Verticale press en vergelijkbare doelspieren; reset de belasting."),
            ExerciseAlternative(name: "Smith shoulder press", fit: "Stabiele match", why: "Handig om veilig dicht bij falen te trainen met dezelfde rep-range."),
        ],
        "push-lateral": [
            ExerciseAlternative(name: "Machine lateral raise", fit: "Sterke match", why: "Zelfde schouderabductie met extra stabiliteit; behoud 12–20 reps."),
            ExerciseAlternative(name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Zelfde doelspier, maar een andere weerstandscurve. Gebruik strikte techniek."),
        ],
        "legs-lateral": [
            ExerciseAlternative(name: "Machine lateral raise", fit: "Sterke match", why: "Zelfde schouderabductie met minder coördinatievraag."),
            ExerciseAlternative(name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Behoud hoge reps en stop zodra je moet zwaaien."),
        ],
        "upper-lateral": [
            ExerciseAlternative(name: "Machine lateral raise", fit: "Sterke match", why: "Zelfde doel en eenvoudige progressie in de 12–20 rep-range."),
            ExerciseAlternative(name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Zelfde doelspier; vergelijk het dumbbellgewicht niet met de kabelbelasting."),
        ],
        "science-lateral": [
            ExerciseAlternative(name: "Machine lateral raise", fit: "Sterke match", why: "Stabiel alternatief dat je dicht bij falen kunt uitvoeren."),
            ExerciseAlternative(name: "Dumbbell lateral raise", fit: "Praktische swap", why: "Zelfde doelspier met een andere weerstandscurve; behoud strikte reps."),
        ],
        "overhead-triceps": [
            ExerciseAlternative(name: "Overhead dumbbell extension", fit: "Zelfde armpositie", why: "Behoudt schouderflexie en tricepstraining op lange spierlengte."),
            ExerciseAlternative(name: "EZ-bar skull crusher", fit: "Sterke match", why: "Vergelijkbare elleboogextensie; kies een pijnvrije hoek en gecontroleerde excentrische fase."),
        ],
        "pressdown": [
            ExerciseAlternative(name: "Single-arm cable pressdown", fit: "1-op-1", why: "Zelfde elleboogextensie en rep-range, met vrije polspositie."),
            ExerciseAlternative(name: "Machine dip", fit: "Compound swap", why: "Meer borst- en schouderbijdrage; gebruik hem alleen als je een compound wilt."),
        ],
        "upper-pressdown": [
            ExerciseAlternative(name: "Single-arm cable pressdown", fit: "1-op-1", why: "Zelfde doel met vrije polspositie en afzonderlijke armen."),
            ExerciseAlternative(name: "Cross-body cable extension", fit: "Sterke match", why: "Zelfde elleboogfunctie; makkelijk pijnvrij af te stellen."),
        ],
        "pull-up": [
            ExerciseAlternative(name: "Neutral-grip lat pulldown", fit: "Zelfde verticale pull", why: "Vergelijkbare lat- en armfunctie, maar makkelijker exact te doseren."),
            ExerciseAlternative(name: "Assisted pull-up", fit: "1-op-1 patroon", why: "Behoudt de pull-upbeweging wanneer bodyweight of extra gewicht niet past."),
        ],
        "lat-pulldown": [
            ExerciseAlternative(name: "Neutral-grip pull-up", fit: "Zelfde verticale pull", why: "Behoudt de richting en grote ROM; log de extra belasting apart."),
            ExerciseAlternative(name: "Single-arm cable pulldown", fit: "Unilaterale match", why: "Zelfde schouderextensie met meer vrijheid voor elleboogbaan en stretch."),
        ],
        "kneeling-lat": [
            ExerciseAlternative(name: "Single-arm seated pulldown", fit: "1-op-1", why: "Zelfde unilaterale latfunctie met extra rompstabiliteit."),
            ExerciseAlternative(name: "Neutral-grip pulldown", fit: "Sterke match", why: "Bilaterale verticale pull die eenvoudiger te laden is."),
        ],
        "neutral-row": [
            ExerciseAlternative(name: "Neutral cable row", fit: "Zelfde trekbaan", why: "Horizontale pull met vergelijkbare elleboogbaan; houd je romp stabiel."),
            ExerciseAlternative(name: "Chest-supported dumbbell row", fit: "Sterke match", why: "Zelfde rugdoel zonder onderrug als limiterende factor."),
        ],
        "wide-row": [
            ExerciseAlternative(name: "Wide cable row", fit: "Zelfde trekbaan", why: "Elleboog naar buiten voor bovenrug en rear delts; behoud borstpositie."),
            ExerciseAlternative(name: "Chest-supported rear-delt row", fit: "Sterke match", why: "Vergelijkbare bovenrugfocus met dumbbells en een vaste bank."),
        ],
        "upper-wide-row": [
            ExerciseAlternative(name: "Wide cable row", fit: "Zelfde trekbaan", why: "Behoudt de horizontale pull en bovenrugfocus."),
            ExerciseAlternative(name: "Chest-supported dumbbell row", fit: "Sterke match", why: "Stabiele horizontale pull zonder extra belasting voor je onderrug."),
        ],
        "reverse-pec": [
            ExerciseAlternative(name: "Cable rear-delt fly", fit: "Zelfde isolatie", why: "Zelfde doelspier en controleerbare lijn; behoud 12–20 reps."),
            ExerciseAlternative(name: "Chest-supported rear-delt row", fit: "Meer compound", why: "Vergelijkbaar rear-deltdoel met extra bovenrugbijdrage."),
        ],
        "rear-delt": [
            ExerciseAlternative(name: "Reverse pec deck", fit: "Sterke match", why: "Stabiele rear-deltisolatie die eenvoudig progressief te laden is."),
            ExerciseAlternative(name: "Cable rear-delt fly", fit: "Zelfde isolatie", why: "Vrije kabelrichting en constante spanning; behoud hoge reps."),
        ],
        "strict-curl": [
            ExerciseAlternative(name: "Bayesian cable curl", fit: "Zelfde armdoel", why: "Bicepstraining met spanning in een verlengde positie; reset het gewicht."),
            ExerciseAlternative(name: "Incline dumbbell curl", fit: "Sterke match", why: "Vrije dumbbellvariant met weinig ruimte voor momentum."),
        ],
        "science-preacher": [
            ExerciseAlternative(name: "Machine preacher curl", fit: "1-op-1", why: "Zelfde gestabiliseerde bovenarm en eenvoudige progressie."),
            ExerciseAlternative(name: "Spider curl", fit: "Sterke match", why: "Beperkt momentum, maar heeft een andere weerstandscurve."),
        ],
        "hammer-curl": [
            ExerciseAlternative(name: "Rope hammer curl", fit: "1-op-1 greep", why: "Neutrale greep en dezelfde armflexoren met constante kabelspanning."),
            ExerciseAlternative(name: "Cross-body hammer curl", fit: "Sterke match", why: "Zelfde neutrale greep, één arm tegelijk en weinig setup."),
        ],
        "cable-curl": [
            ExerciseAlternative(name: "Machine preacher curl", fit: "Stabiele match", why: "Zelfde bicepsdoel en eenvoudig dicht bij falen te trainen."),
            ExerciseAlternative(name: "Incline dumbbell curl", fit: "Vrije variant", why: "Behoudt een lange spierlengte, maar reset de belasting."),
        ],
        "hack-squat": [
            ExerciseAlternative(name: "Leg press", fit: "Zelfde kniefocus", why: "Stabiele quad-dominante compound; match diepte en RIR, niet het absolute gewicht."),
            ExerciseAlternative(name: "Heel-elevated Smith squat", fit: "Sterke match", why: "Grote knieflexie en vaste baan; kies een pijnvrije stance."),
        ],
        "bulgarian": [
            ExerciseAlternative(name: "Reverse lunge", fit: "Unilaterale match", why: "Zelfde benen één voor één, vaak iets eenvoudiger te balanceren."),
            ExerciseAlternative(name: "Single-leg press", fit: "Stabieler", why: "Behoudt unilaterale belasting met minder stabiliteitsvraag."),
        ],
        "seated-curl": [
            ExerciseAlternative(name: "Single-leg seated curl", fit: "1-op-1", why: "Zelfde heuphoek en kniebuiging, met afzonderlijke benen."),
            ExerciseAlternative(name: "Lying leg curl", fit: "Zelfde functie", why: "Kniebuiging blijft gelijk, maar de hamstrings starten minder verlengd."),
        ],
        "lying-curl": [
            ExerciseAlternative(name: "Seated leg curl", fit: "Sterke hypertrofieswap", why: "De heupbuiging traint hamstrings langer; een studie vond meer groei dan prone curls."),
            ExerciseAlternative(name: "Nordic hamstring curl", fit: "Zwaardere swap", why: "Kniebuiging met sterke excentrische belasting; gebruik assistentie om de rep-range haalbaar te maken."),
        ],
        "leg-extension": [
            ExerciseAlternative(name: "Sissy squat machine", fit: "Quad-isolatie", why: "Veel knieflexie met weinig heupbijdrage; alleen in pijnvrije ROM."),
            ExerciseAlternative(name: "Reverse Nordic", fit: "Bodyweight swap", why: "Quad-dominant alternatief; schaal de ROM en gebruik controle."),
        ],
        "rdl": [
            ExerciseAlternative(name: "Dumbbell Romanian deadlift", fit: "1-op-1 patroon", why: "Dezelfde hip hinge en hamstringstretch. Behoud sets/reps/RIR, maar reset het gewicht."),
            ExerciseAlternative(name: "Assisted Nordic hamstring curl", fit: "Zelfde doel, ander patroon", why: "Een RCT uit 2025 vond vergelijkbare hamstringarchitectuur en -groei als bij eccentrische RDL-training; hij vervangt niet de glute- en hingeprikkel."),
        ],
        "leg-press": [
            ExerciseAlternative(name: "Hack squat", fit: "Zelfde kniefocus", why: "Stabiele compound met grote knieflexie; vergelijk inspanning en ROM, niet kilo’s."),
            ExerciseAlternative(name: "Heel-elevated Smith squat", fit: "Sterke match", why: "Quad-dominante squat met vaste baan en voorspelbare progressie."),
        ],
        "hip-thrust": [
            ExerciseAlternative(name: "Smith glute bridge", fit: "Zelfde verkorte positie", why: "Horizontale heupextensie met stabiele lock-out en minder setup."),
            ExerciseAlternative(name: "45° hip extension", fit: "Zelfde heupfunctie", why: "Train glutes en hamstrings via heupextensie; rond niet door je onderrug om de rep af te maken."),
        ],
        "standing-calf": [
            ExerciseAlternative(name: "Leg-press calf raise", fit: "Gestrekte-knie match", why: "Zelfde gastrocnemiusbias en makkelijke progressie met volledige stretch."),
            ExerciseAlternative(name: "Single-leg standing calf raise", fit: "Unilaterale match", why: "Zelfde kniestand met minder totaalgewicht nodig."),
        ],
        "seated-calf": [
            ExerciseAlternative(name: "Bent-knee calf raise op leg press", fit: "Soleusmatch", why: "Gebogen knie behoudt de soleusfocus; train door volledige ROM."),
            ExerciseAlternative(name: "Dumbbell seated calf raise", fit: "Praktische swap", why: "Zelfde kniestand wanneer de machine bezet is; voeg gewicht stabiel toe."),
        ],
        "cable-crunch": [
            ExerciseAlternative(name: "Machine crunch", fit: "Zelfde rompflexie", why: "Stabiel alternatief dat eenvoudig progressief te laden is."),
            ExerciseAlternative(name: "Weighted decline crunch", fit: "Vrije variant", why: "Zelfde dynamische buikfunctie; houd de belasting tegen je borst."),
        ],
        "hanging-raise": [
            ExerciseAlternative(name: "Captain's-chair knee raise", fit: "Stabieler", why: "Zelfde bekkenkanteling met minder grip als limiterende factor."),
            ExerciseAlternative(name: "Reverse crunch", fit: "Vloervariant", why: "Behoud de bekkenbeweging en voeg pas reps toe zonder zwaai."),
        ],
    ]

    public static func alternatives(for exerciseID: String) -> [ExerciseAlternative] {
        byExercise[exerciseID] ?? []
    }
}
