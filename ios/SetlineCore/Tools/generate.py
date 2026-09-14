import re, sys, json, io
sys.path.insert(0, '/private/tmp/claude-501/-Users-yaschatorfs-Desktop-YouFit/668b57eb-a2ff-4e5f-a402-385339b11b48/scratchpad/gen')
from attrs import ATTRS

SRC = open('app/page.tsx').read()
OUT = 'ios/SetlineCore/Sources/SetlineCore/Catalog'

def swift_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

# ---------------------------------------------------------------- exercises
# The trailing comma matters: in-plan exercises are written inline without
# one, but PAUSED_BENCH_EXERCISE is a standalone const that has it.
ex_re = re.compile(r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*prescription:\s*"([^"]+)",\s*load:\s*"([^"]*)",\s*rest:\s*"([^"]*)",?\s*\}')
allex = {}
for m in ex_re.finditer(SRC):
    allex.setdefault(m.group(1), m.groups())

buf = io.StringIO()
buf.write('''// Generated from app/page.tsx by Tools/generate.py — do not hand-edit.
// The curated V1 catalogue merges these with its own additions and metadata;
// see ExerciseCatalogV1.swift.
//
// The names, prescriptions, load notes and rest notes are the web app's own,
// carried over verbatim. Equipment, role, compound and unilateral are the
// hand-authored attributes Phase 1 needs: role drives the rest prescription
// (addendum 13R) and the progression rule (TRAINING_LOGIC §3.2), equipment
// drives the load increment (§3.3).

import Foundation

public enum GeneratedExerciseCatalog {

    public static let exercises: [String: Exercise] = [
''')
for eid, (i, name, presc, load, rest) in sorted(allex.items()):
    equip, compound, uni, role = ATTRS[eid]
    buf.write(f'        {swift_str(eid)}: Exercise(\n')
    buf.write(f'            id: {swift_str(eid)},\n')
    buf.write(f'            name: {swift_str(name)},\n')
    buf.write(f'            equipment: .{equip},\n')
    buf.write(f'            isCompound: {"true" if compound else "false"},\n')
    buf.write(f'            unilateral: {"true" if uni else "false"}\n')
    buf.write(f'        ),\n')
buf.write('''    ]

    public static let roles: [String: ExerciseRole] = [
''')
for eid in sorted(ATTRS):
    buf.write(f'        {swift_str(eid)}: .{ATTRS[eid][3]},\n')
buf.write('''    ]

}
''')
open(f'{OUT}/ExerciseCatalog.swift','w').write(buf.getvalue())
print('ExerciseCatalog.swift:', len(allex), 'exercises')

# ---------------------------------------------------------------- guidance
g = SRC[SRC.index('const GUIDANCE'):SRC.index('const DEFAULT_GUIDE')]
# Split on entry boundaries rather than one big regex: several progression
# lines contain characters that make a single-pass pattern miss silently.
blocks = re.split(r'\n  (?="?[a-z0-9\-]+"?:\s*\{)', g)[1:]
guides = []
for b in blocks:
    key = re.match(r'"?([a-z0-9\-]+)"?:', b).group(1)
    warm = re.search(r'warmup:\s*"((?:[^"\\]|\\.)*)"', b).group(1)
    prog = re.search(r'progression:\s*"((?:[^"\\]|\\.)*)"', b).group(1)
    adv = re.search(r'advanceAt:\s*(\d+)', b)
    guides.append((key, warm, prog, adv.group(1) if adv else None))

dg = SRC[SRC.index('const DEFAULT_GUIDE'):SRC.index('const ALTERNATIVES')]
dwarm = re.search(r'warmup:\s*"((?:[^"\\]|\\.)*)"', dg).group(1)
dprog = re.search(r'progression:\s*"((?:[^"\\]|\\.)*)"', dg).group(1)

buf = io.StringIO()
buf.write('''// Generated from app/page.tsx by scratchpad/gen/generate.py — do not hand-edit.
//
// Per-exercise warm-up ramps and progression advice, in the web app's own
// Dutch. TRAINING_LOGIC §7 is explicit about these: "Keep the text, generate
// the sets." §15 lists the written guidance among the things kept as-is.

import Foundation

public struct ExerciseGuide: Codable, Hashable, Sendable {
    public let warmup: String
    public let progression: String
    /// The rep count at which the web app considered the top of the range hit.
    public let advanceAt: Int?

    public init(warmup: String, progression: String, advanceAt: Int? = nil) {
        self.warmup = warmup
        self.progression = progression
        self.advanceAt = advanceAt
    }
}

public enum GuidanceCatalog {

    public static let `default` = ExerciseGuide(
        warmup: ''' + swift_str(dwarm) + ''',
        progression: ''' + swift_str(dprog) + '''
    )

    public static let byExercise: [String: ExerciseGuide] = [
''')
for eid, warm, prog, adv in guides:
    buf.write(f'        {swift_str(eid)}: ExerciseGuide(\n')
    buf.write(f'            warmup: {swift_str(warm)},\n')
    buf.write(f'            progression: {swift_str(prog)}')
    buf.write(f',\n            advanceAt: {adv}\n' if adv else '\n')
    buf.write(f'        ),\n')
buf.write('''    ]

    public static func guide(for exerciseID: String) -> ExerciseGuide {
        byExercise[exerciseID] ?? `default`
    }
}
''')
open(f'{OUT}/GuidanceCatalog.swift','w').write(buf.getvalue())
print('GuidanceCatalog.swift:', len(guides), 'guides')

# ---------------------------------------------------------------- alternatives
a = SRC[SRC.index('const ALTERNATIVES'):SRC.index('const STARTER_CHAT')]
alt_blocks = re.findall(r'"?([a-z0-9\-]+)"?:\s*\[(.*?)\],\n', a, re.S)
item_re = re.compile(r'\{\s*name:\s*"((?:[^"\\]|\\.)*)",\s*fit:\s*"((?:[^"\\]|\\.)*)",\s*why:\s*"((?:[^"\\]|\\.)*)"\s*\}')
buf = io.StringIO()
buf.write('''// Generated from app/page.tsx by scratchpad/gen/generate.py — do not hand-edit.
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
''')
total = 0
for eid, body in alt_blocks:
    items = item_re.findall(body)
    if not items:
        continue
    total += len(items)
    buf.write(f'        {swift_str(eid)}: [\n')
    for name, fit, why in items:
        buf.write(f'            ExerciseAlternative(name: {swift_str(name)}, fit: {swift_str(fit)}, why: {swift_str(why)}),\n')
    buf.write('        ],\n')
buf.write('''    ]

    public static func alternatives(for exerciseID: String) -> [ExerciseAlternative] {
        byExercise[exerciseID] ?? []
    }
}
''')
open(f'{OUT}/AlternativesCatalog.swift','w').write(buf.getvalue())
print('AlternativesCatalog.swift:', len(alt_blocks), 'keys /', total, 'items')
