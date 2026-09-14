#!/usr/bin/env python3
"""Emit ExerciseMetadata.swift from the hand-authored table in attributes.py."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from attributes import M, ADDITIONS, HEURISTICS, CANONICAL, CURATED_NAMES

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Sources/SetlineCore/Catalog')

def s(v): return '"' + v.replace('\\', '\\\\').replace('"', '\\"') + '"'
def num(w):
    t = f'{w:.2f}'.rstrip('0').rstrip('.')
    return t if t else '0'

b = []
w = b.append
w('// Generated from Tools/attributes.py by Tools/gen_v1.py — do not hand-edit.')
w('//')
w('// The curated V1 metadata for exercise substitution (TRAINING_LOGIC §1, §14).')
w('// Objective fields describe what the exercise physically is. The heuristic')
w('// triples are product judgement: they order a list, they are never shown to')
w('// the user, and no copy may present them as measurement.')
w('')
w('import Foundation')
w('')
w('enum V1Heuristics {')
for k, (st, fa, se, why) in HEURISTICS.items():
    w(f'    static let {k} = ExerciseHeuristics(')
    w(f'        stabilityDemand: {st}, fatigueCost: {fa}, setupCost: {se},')
    w(f'        rationale: {s(why)}')
    w('    )')
w('}')
w('')
w('enum ExerciseMetadata {')
w('')
w('    /// Every exercise the V1 ranking may recommend. A test asserts that each')
w('    /// of these resolves to an `Exercise` carrying complete attributes.')
w('    static let v1Recommendable: Set<String> = [')
for eid in sorted(M):
    w(f'        {s(eid)},')
w('    ]')
w('')
w('    static let stations: [String: Station] = [')
for eid in sorted(M):
    station = M[eid][7]
    if station: w(f'        {s(eid)}: .{station},')
w('    ]')
w('')
w('    static let attributes: [String: ExerciseAttributes] = [')
for eid in sorted(M):
    pat, prim, sec, joints, profile, lengthened, tags, _station, heur = M[eid]
    w(f'        {s(eid)}: ExerciseAttributes(')
    w('            primaryMuscles: [' + ', '.join(f'.init(.{m}, {num(x)})' for m, x in prim) + '],')
    if sec:
        w('            secondaryMuscles: [' + ', '.join(f'.init(.{m}, {num(x)})' for m, x in sec) + '],')
    w('            jointActions: [' + ', '.join(f'.{j}' for j in joints) + '],')
    w(f'            movementPattern: .{pat},')
    w(f'            resistanceProfile: .{profile},')
    if lengthened: w('            lengthenedBiasedROM: true,')
    if tags: w('            loadTags: [' + ', '.join(f'.{t}' for t in tags) + '],')
    w(f'            heuristics: V1Heuristics.{heur}')
    w('        ),')
w('    ]')
w('')
w('    /// The 26 exercises V1 adds purely so that substitution has somewhere to')
w('    /// go. They are not in any shipped plan; they exist to be recommended.')
w('    static let additions: [String: Exercise] = [')
for eid in sorted(ADDITIONS):
    name, equip, compound, uni, _role = ADDITIONS[eid]
    w(f'        {s(eid)}: Exercise(')
    w(f'            id: {s(eid)},')
    w(f'            name: {s(name)},')
    w(f'            equipment: .{equip},')
    w(f'            isCompound: {"true" if compound else "false"},')
    w(f'            unilateral: {"true" if uni else "false"}')
    w('        ),')
w('    ]')
w('')
w('    /// Ids that name the same physical exercise. The web app keys some')
w('    /// exercises per training day; ranking must never offer one as an')
w('    /// alternative to another.')
w('    static let canonicalID: [String: String] = [')
for eid in sorted(CANONICAL):
    w(f'        {s(eid)}: {s(CANONICAL[eid])},')
w('    ]')
w('')
w('    /// Curated alternative name -> exercise id, so a ranked result can carry')
w('    /// its hand-written `why` line. Conservative by design: a name is mapped')
w('    /// only when it denotes exactly this entry. An unmapped name costs the')
w('    /// result its curated copy, nothing else.')
w('    static let curatedNameToID: [String: String] = [')
for name in sorted(CURATED_NAMES):
    w(f'        {s(name)}: {s(CURATED_NAMES[name])},')
w('    ]')
w('')
w('    static let additionRoles: [String: ExerciseRole] = [')
for eid in sorted(ADDITIONS):
    w(f'        {s(eid)}: .{ADDITIONS[eid][4]},')
w('    ]')
w('}')
w('')

open(f'{OUT}/ExerciseMetadata.swift', 'w').write('\n'.join(b))
print(f'ExerciseMetadata.swift: {len(M)} attribute sets / {len(ADDITIONS)} additions / {len(HEURISTICS)} heuristic groups')
