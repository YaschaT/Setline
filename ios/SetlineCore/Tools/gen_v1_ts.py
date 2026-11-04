#!/usr/bin/env python3
"""Emit the web app's ExerciseMetadata.ts from the same table as ExerciseMetadata.swift.

One source, two outputs: the web catalogue can no longer drift from the
phone's. Run after gen_v1.py whenever attributes.py changes.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from attributes import M, ADDITIONS, HEURISTICS, CANONICAL, CURATED_NAMES

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
OUT = os.path.join(ROOT, 'setline-web/src/core/Catalog/ExerciseMetadata.ts')

def s(v): return json.dumps(v, ensure_ascii=False)
def num(w):
    t = f'{w:.2f}'.rstrip('0').rstrip('.')
    return t if t else '0'

b = []
w = b.append
w('// Generated from Tools/attributes.py by Tools/gen_v1_ts.py — do not hand-edit.')
w('//')
w('// The curated V1 metadata for exercise substitution (TRAINING_LOGIC §1, §14).')
w('// Objective fields describe what the exercise physically is. The heuristic')
w('// triples are product judgement: they order a list, they are never shown to')
w('// the user, and no copy may present them as measurement.')
w('//')
w('// The same table emits ios/SetlineCore/Sources/SetlineCore/Catalog/ExerciseMetadata.swift')
w('// (Tools/gen_v1.py), so every entry is the Swift one.')
w('')
w('import {')
w('  ExerciseAttributes,')
w('  ExerciseHeuristics,')
w('  MuscleContribution,')
w('  type JointAction,')
w('  type LoadTag,')
w('  type Station,')
w('} from "../Domain/ExerciseAttributes";')
w('import { Exercise } from "../Domain/Model";')
w('import type { ExerciseRole } from "../Domain/Vocabulary";')
w('import { dictionary } from "../Support/dictionary";')
w('')
w('export const V1Heuristics = {')
for k, (st, fa, se, why) in HEURISTICS.items():
    w(f'  {k}: ExerciseHeuristics.make({{')
    w(f'    stabilityDemand: {st},')
    w(f'    fatigueCost: {fa},')
    w(f'    setupCost: {se},')
    w(f'    rationale: {s(why)},')
    w('  }),')
w('};')
w('')
w('export const ExerciseMetadata = {')
w('  /**')
w('   * Every exercise the V1 ranking may recommend. A test asserts that each')
w('   * of these resolves to an `Exercise` carrying complete attributes.')
w('   */')
w('  v1Recommendable: new Set<string>([')
for eid in sorted(M):
    w(f'    {s(eid)},')
w('  ]),')
w('')
w('  stations: dictionary({')
for eid in sorted(M):
    station = M[eid][7]
    if station: w(f'    {s(eid)}: {s(station)},')
w('  }) as Record<string, Station>,')
w('')
w('  attributes: dictionary({')
def contributions(label, items):
    calls = [f'MuscleContribution.make({s(m)}, {num(x)})' for m, x in items]
    if len(calls) == 1:
        w(f'      {label}: [{calls[0]}],')
    else:
        w(f'      {label}: [')
        for c in calls: w(f'        {c},')
        w('      ],')
for eid in sorted(M):
    pat, prim, sec, joints, profile, lengthened, tags, _station, heur = M[eid]
    w(f'    {s(eid)}: ExerciseAttributes.make({{')
    contributions('primaryMuscles', prim)
    if sec: contributions('secondaryMuscles', sec)
    w('      jointActions: new Set<JointAction>([' + ', '.join(s(j) for j in joints) + ']),')
    w(f'      movementPattern: {s(pat)},')
    w(f'      resistanceProfile: {s(profile)},')
    if lengthened: w('      lengthenedBiasedROM: true,')
    if tags: w('      loadTags: new Set<LoadTag>([' + ', '.join(s(t) for t in tags) + ']),')
    w(f'      heuristics: V1Heuristics.{heur},')
    w('    }),')
w('  }) as Record<string, ExerciseAttributes>,')
w('')
w('  /**')
w(f'   * The {len(ADDITIONS)} exercises V1 adds beyond the shipped plans: substitution')
w('   * targets and the staples a lifter looks for. No plan prescribes them.')
w('   */')
w('  additions: dictionary({')
for eid in sorted(ADDITIONS):
    name, equip, compound, uni, _role = ADDITIONS[eid]
    w(f'    {s(eid)}: Exercise.make({{')
    w(f'      id: {s(eid)},')
    w(f'      name: {s(name)},')
    w(f'      equipment: {s(equip)},')
    w(f'      isCompound: {"true" if compound else "false"},')
    w(f'      unilateral: {"true" if uni else "false"},')
    w('    }),')
w('  }) as Record<string, Exercise>,')
w('')
w('  /**')
w('   * Ids that name the same physical exercise. The web app keys some')
w('   * exercises per training day; ranking must never offer one as an')
w('   * alternative to another.')
w('   */')
w('  canonicalID: dictionary({')
for eid in sorted(CANONICAL):
    w(f'    {s(eid)}: {s(CANONICAL[eid])},')
w('  }) as Record<string, string>,')
w('')
w('  /**')
w('   * Curated alternative name -> exercise id, so a ranked result can carry')
w('   * its hand-written `why` line. Conservative by design: a name is mapped')
w('   * only when it denotes exactly this entry. An unmapped name costs the')
w('   * result its curated copy, nothing else.')
w('   */')
w('  curatedNameToID: dictionary({')
for name in sorted(CURATED_NAMES):
    w(f'    {s(name)}: {s(CURATED_NAMES[name])},')
w('  }) as Record<string, string>,')
w('')
w('  additionRoles: dictionary({')
for eid in sorted(ADDITIONS):
    w(f'    {s(eid)}: {s(ADDITIONS[eid][4])},')
w('  }) as Record<string, ExerciseRole>,')
w('};')
w('')

open(OUT, 'w').write('\n'.join(b))
print(f'ExerciseMetadata.ts: {len(M)} attribute sets / {len(ADDITIONS)} additions / {len(HEURISTICS)} heuristic groups')
