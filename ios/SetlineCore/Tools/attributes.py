# Curated V1 exercise metadata. Hand-authored; emits ExerciseMetadata.swift.
#
# Objective fields describe what the exercise physically is. The heuristic
# triples (stability, fatigue, setup) are product judgement and carry their
# reasoning with them — see HEURISTICS below.

HEURISTICS = {
 "barbellAxial":        (4,5,3,"Free bar loaded through the spine: most to go wrong, highest systemic cost, plates to load."),
 "barbellPress":        (4,4,3,"Free bar over a joint that needs a spotter; heavy, and the rack has to be set."),
 "barbellArm":          (3,2,2,"Free bar but a single joint and a modest load; collect the bar and go."),
 "bodyweightPull":      (4,4,2,"Whole bodyweight on a bar, grip-limited; a belt is the only setup."),
 "dips":                (4,3,1,"Bodyweight in a demanding shoulder position, but the station needs nothing set up."),
 "backExtension":       (2,2,1,"Hips fixed in a pad, light load; the position matters more than the weight."),
 "dumbbellCompound":    (3,3,2,"Freer than a machine at a lighter absolute load; fetching dumbbells is the setup."),
 "dumbbellUnilateral":  (4,3,2,"One side at a time — balance demand is the point of the variation."),
 "dumbbellArm":         (3,2,2,"Free dumbbells through one joint; light systemic cost."),
 "smithOrPlate":        (2,4,2,"Fixed bar path removes most balance demand; still heavy, still plates."),
 "plateLoaded":         (2,3,2,"Supported through the movement, but loaded by hand."),
 "selectorisedCompound":(1,3,1,"Supported throughout and pin-loaded: sit down and go."),
 "selectorisedIsolation":(1,1,1,"Single joint, fully supported, minimal systemic cost."),
 "cableStanding":       (2,2,1,"Standing adds a little demand; setup is a pin and a handle."),
 "cableIsolation":      (2,1,1,"One joint on constant tension; nothing to set up."),
 "seatedIsolation":     (1,1,1,"Seated, single joint, supported — the lowest cost in the catalogue."),
 "hangingCore":         (4,2,1,"Hanging from a bar is grip- and position-demanding even though the load is bodyweight."),
}

# id: (pattern, primary, secondary, joints, profile, lengthenedROM, loadTags, station, heuristicGroup)
M = {
# ── horizontal press ──────────────────────────────────────────────────────
"flat-bench":        ("horizontalPress",[("chestMid",.6),("triceps",.25),("frontDelt",.15)],[],["shoulderHorizontalAdduction","elbowExtension"],"midRangeBias",False,["endRangeShoulder"],"flatBenchRack","barbellPress"),
"upper-paused-bench":("horizontalPress",[("chestMid",.6),("triceps",.25),("frontDelt",.15)],[],["shoulderHorizontalAdduction","elbowExtension"],"midRangeBias",False,["endRangeShoulder"],"flatBenchRack","barbellPress"),
"incline-bench":     ("horizontalPress",[("chestUpper",.55),("frontDelt",.25),("triceps",.2)],[],["shoulderHorizontalAdduction","shoulderFlexion","elbowExtension"],"midRangeBias",False,["endRangeShoulder"],"inclineBenchRack","barbellPress"),
"incline-machine":   ("horizontalPress",[("chestUpper",.55),("frontDelt",.25),("triceps",.2)],[],["shoulderHorizontalAdduction","shoulderFlexion","elbowExtension"],"midRangeBias",False,[],"inclineChestPress","selectorisedCompound"),
"db-bench":          ("horizontalPress",[("chestMid",.6),("triceps",.22),("frontDelt",.18)],[],["shoulderHorizontalAdduction","elbowExtension"],"lengthenedBias",True,["endRangeShoulder"],None,"dumbbellCompound"),
"db-incline":        ("horizontalPress",[("chestUpper",.55),("frontDelt",.25),("triceps",.2)],[],["shoulderHorizontalAdduction","shoulderFlexion","elbowExtension"],"lengthenedBias",True,["endRangeShoulder"],None,"dumbbellCompound"),
"chest-press-machine":("horizontalPress",[("chestMid",.6),("triceps",.22),("frontDelt",.18)],[],["shoulderHorizontalAdduction","elbowExtension"],"midRangeBias",False,[],"chestPressMachine","selectorisedCompound"),
"dips":              ("horizontalPress",[("chestMid",.45),("triceps",.4),("frontDelt",.15)],[],["shoulderHorizontalAdduction","shoulderExtension","elbowExtension"],"lengthenedBias",True,["endRangeShoulder"],"dipStation","dips"),
"close-grip-bench":  ("horizontalPress",[("triceps",.55),("chestMid",.3),("frontDelt",.15)],[],["elbowExtension","shoulderHorizontalAdduction"],"midRangeBias",False,["elbowCompression","wristExtension"],"flatBenchRack","barbellPress"),
"pec-fly":           ("isolationFlexion",[("chestMid",.85),("frontDelt",.15)],[],["shoulderHorizontalAdduction"],"lengthenedBias",True,["endRangeShoulder"],"pecDeck","selectorisedIsolation"),
"upper-fly":         ("isolationFlexion",[("chestMid",.85),("frontDelt",.15)],[],["shoulderHorizontalAdduction"],"flatCable",True,["endRangeShoulder"],None,"cableIsolation"),
# ── vertical press ────────────────────────────────────────────────────────
"push-shoulder":     ("verticalPress",[("frontDelt",.55),("triceps",.25),("sideDelt",.2)],[],["shoulderFlexion","shoulderAbduction","elbowExtension"],"midRangeBias",False,["overheadPosition"],"shoulderPressMachine","selectorisedCompound"),
"upper-shoulder":    ("verticalPress",[("frontDelt",.55),("triceps",.25),("sideDelt",.2)],[],["shoulderFlexion","shoulderAbduction","elbowExtension"],"midRangeBias",False,["overheadPosition"],"shoulderPressMachine","selectorisedCompound"),
"db-shoulder-press": ("verticalPress",[("frontDelt",.55),("triceps",.22),("sideDelt",.23)],[],["shoulderFlexion","shoulderAbduction","elbowExtension"],"midRangeBias",False,["overheadPosition"],None,"dumbbellCompound"),
"overhead-press":    ("verticalPress",[("frontDelt",.55),("triceps",.25),("sideDelt",.2)],[],["shoulderFlexion","shoulderAbduction","elbowExtension"],"midRangeBias",False,["overheadPosition","axialSpinalLoad"],None,"barbellAxial"),
# ── vertical pull ─────────────────────────────────────────────────────────
"pull-up":           ("verticalPull",[("lat",.6),("upperBack",.2),("biceps",.2)],[],["shoulderExtension","elbowFlexion","scapularRetraction"],"lengthenedBias",True,["gripLimited"],"pullUpBar","bodyweightPull"),
"assisted-pull-up":  ("verticalPull",[("lat",.6),("upperBack",.2),("biceps",.2)],[],["shoulderExtension","elbowFlexion","scapularRetraction"],"lengthenedBias",True,["gripLimited"],"assistedPullUp","selectorisedCompound"),
"lat-pulldown":      ("verticalPull",[("lat",.6),("upperBack",.2),("biceps",.2)],[],["shoulderExtension","elbowFlexion","scapularRetraction"],"midRangeBias",False,["gripLimited"],"latPulldown","selectorisedCompound"),
"neutral-pulldown":  ("verticalPull",[("lat",.62),("upperBack",.18),("biceps",.2)],[],["shoulderExtension","elbowFlexion","scapularRetraction"],"midRangeBias",False,[],"latPulldown","selectorisedCompound"),
"kneeling-lat":      ("verticalPull",[("lat",.7),("upperBack",.15),("biceps",.15)],[],["shoulderExtension","elbowFlexion"],"lengthenedBias",True,[],None,"cableStanding"),
# ── horizontal pull ───────────────────────────────────────────────────────
"neutral-row":       ("horizontalPull",[("upperBack",.45),("lat",.3),("biceps",.15),("rearDelt",.1)],[],["scapularRetraction","shoulderExtension","elbowFlexion"],"midRangeBias",False,[],"chestSupportedRow","selectorisedCompound"),
"wide-row":          ("horizontalPull",[("upperBack",.5),("rearDelt",.2),("lat",.2),("biceps",.1)],[],["scapularRetraction","shoulderHorizontalAbduction","elbowFlexion"],"midRangeBias",False,[],"chestSupportedRow","selectorisedCompound"),
"upper-wide-row":    ("horizontalPull",[("upperBack",.5),("rearDelt",.2),("lat",.2),("biceps",.1)],[],["scapularRetraction","shoulderHorizontalAbduction","elbowFlexion"],"midRangeBias",False,[],"chestSupportedRow","selectorisedCompound"),
"seated-cable-row":  ("horizontalPull",[("upperBack",.45),("lat",.3),("biceps",.15),("rearDelt",.1)],[],["scapularRetraction","shoulderExtension","elbowFlexion"],"flatCable",False,[],None,"cableStanding"),
"db-row":            ("horizontalPull",[("lat",.4),("upperBack",.35),("biceps",.15),("rearDelt",.1)],[],["scapularRetraction","shoulderExtension","elbowFlexion"],"lengthenedBias",True,[],None,"dumbbellUnilateral"),
"t-bar-row":         ("horizontalPull",[("upperBack",.45),("lat",.3),("biceps",.15),("rearDelt",.1)],[],["scapularRetraction","shoulderExtension","elbowFlexion"],"midRangeBias",False,[],"tBarRow","plateLoaded"),
# ── delts ─────────────────────────────────────────────────────────────────
"push-lateral":      ("isolationAbduction",[("sideDelt",.9),("rearDelt",.1)],[],["shoulderAbduction"],"flatCable",False,[],None,"cableIsolation"),
"legs-lateral":      ("isolationAbduction",[("sideDelt",.9),("rearDelt",.1)],[],["shoulderAbduction"],"flatCable",False,[],None,"cableIsolation"),
"upper-lateral":     ("isolationAbduction",[("sideDelt",.9),("rearDelt",.1)],[],["shoulderAbduction"],"flatCable",False,[],None,"cableIsolation"),
"science-lateral":   ("isolationAbduction",[("sideDelt",.9),("rearDelt",.1)],[],["shoulderAbduction"],"flatCable",False,[],None,"cableIsolation"),
"db-lateral":        ("isolationAbduction",[("sideDelt",.9),("rearDelt",.1)],[],["shoulderAbduction"],"shortenedBias",False,[],None,"dumbbellArm"),
"machine-lateral":   ("isolationAbduction",[("sideDelt",.9),("rearDelt",.1)],[],["shoulderAbduction"],"midRangeBias",False,[],"lateralRaiseMachine","selectorisedIsolation"),
"rear-delt":         ("isolationAbduction",[("rearDelt",.85),("upperBack",.15)],[],["shoulderHorizontalAbduction"],"shortenedBias",False,[],"pecDeck","selectorisedIsolation"),
"reverse-pec":       ("isolationAbduction",[("rearDelt",.85),("upperBack",.15)],[],["shoulderHorizontalAbduction"],"shortenedBias",False,[],"pecDeck","selectorisedIsolation"),
"face-pull":         ("isolationAbduction",[("rearDelt",.7),("upperBack",.3)],[],["shoulderHorizontalAbduction","scapularRetraction"],"flatCable",False,[],None,"cableStanding"),
# ── triceps ───────────────────────────────────────────────────────────────
"overhead-triceps":  ("isolationExtension",[("triceps",1.0)],[],["elbowExtension"],"lengthenedBias",True,["overheadPosition","elbowCompression"],None,"cableIsolation"),
"pressdown":         ("isolationExtension",[("triceps",1.0)],[],["elbowExtension"],"shortenedBias",False,[],None,"cableIsolation"),
"upper-pressdown":   ("isolationExtension",[("triceps",1.0)],[],["elbowExtension"],"shortenedBias",False,[],None,"cableIsolation"),
"skull-crusher":     ("isolationExtension",[("triceps",1.0)],[],["elbowExtension"],"lengthenedBias",True,["elbowCompression"],None,"barbellArm"),
# ── biceps ────────────────────────────────────────────────────────────────
"strict-curl":       ("isolationFlexion",[("biceps",.85),("forearm",.15)],[],["elbowFlexion"],"midRangeBias",False,["elbowCompression"],None,"dumbbellArm"),
"hammer-curl":       ("isolationFlexion",[("biceps",.6),("forearm",.4)],[],["elbowFlexion"],"midRangeBias",False,[],None,"dumbbellArm"),
"cable-curl":        ("isolationFlexion",[("biceps",.85),("forearm",.15)],[],["elbowFlexion"],"flatCable",False,["elbowCompression"],None,"cableIsolation"),
"science-preacher":  ("isolationFlexion",[("biceps",.9),("forearm",.1)],[],["elbowFlexion"],"lengthenedBias",True,["elbowCompression"],None,"selectorisedIsolation"),
"incline-db-curl":   ("isolationFlexion",[("biceps",.9),("forearm",.1)],[],["elbowFlexion"],"lengthenedBias",True,["elbowCompression"],None,"dumbbellArm"),
"ez-curl":           ("isolationFlexion",[("biceps",.85),("forearm",.15)],[],["elbowFlexion"],"midRangeBias",False,["wristExtension","elbowCompression"],None,"barbellArm"),
# ── squat pattern ─────────────────────────────────────────────────────────
"hack-squat":        ("squat",[("quad",.7),("glute",.2),("adductor",.1)],[],["kneeExtension","hipExtension"],"lengthenedBias",True,["deepKneeFlexion","axialSpinalLoad"],"hackSquat","smithOrPlate"),
"leg-press":         ("squat",[("quad",.6),("glute",.25),("adductor",.15)],[],["kneeExtension","hipExtension"],"midRangeBias",False,["deepKneeFlexion"],"legPress","plateLoaded"),
"smith-squat":       ("squat",[("quad",.65),("glute",.25),("adductor",.1)],[],["kneeExtension","hipExtension"],"lengthenedBias",True,["deepKneeFlexion","axialSpinalLoad"],"smithRack","smithOrPlate"),
"goblet-squat":      ("squat",[("quad",.6),("glute",.28),("adductor",.12)],[],["kneeExtension","hipExtension"],"lengthenedBias",True,["deepKneeFlexion"],None,"dumbbellCompound"),
"bulgarian":         ("lunge",[("quad",.5),("glute",.35),("adductor",.15)],[],["kneeExtension","hipExtension"],"lengthenedBias",True,["deepKneeFlexion"],None,"dumbbellUnilateral"),
"walking-lunge":     ("lunge",[("quad",.45),("glute",.4),("adductor",.15)],[],["kneeExtension","hipExtension"],"midRangeBias",False,["deepKneeFlexion"],None,"dumbbellUnilateral"),
"leg-extension":     ("isolationExtension",[("quad",1.0)],[],["kneeExtension"],"shortenedBias",False,[],"legExtension","selectorisedIsolation"),
# ── hinge ─────────────────────────────────────────────────────────────────
"rdl":               ("hinge",[("hamstring",.55),("glute",.3),("lowerBack",.15)],[],["hipExtension"],"lengthenedBias",True,["axialSpinalLoad","lumbarFlexion","gripLimited"],None,"barbellAxial"),
"db-rdl":            ("hinge",[("hamstring",.55),("glute",.3),("lowerBack",.15)],[],["hipExtension"],"lengthenedBias",True,["lumbarFlexion","gripLimited"],None,"dumbbellCompound"),
"hip-thrust":        ("hinge",[("glute",.75),("hamstring",.25)],[],["hipExtension"],"shortenedBias",False,[],None,"plateLoaded"),
"hip-thrust-machine":("hinge",[("glute",.75),("hamstring",.25)],[],["hipExtension"],"shortenedBias",False,[],"hipThrustMachine","plateLoaded"),
"back-extension":    ("hinge",[("lowerBack",.4),("glute",.35),("hamstring",.25)],[],["hipExtension"],"midRangeBias",False,["lumbarFlexion"],None,"backExtension"),
"seated-curl":       ("isolationFlexion",[("hamstring",1.0)],[],["kneeFlexion"],"shortenedBias",False,[],"seatedLegCurl","selectorisedIsolation"),
"lying-curl":        ("isolationFlexion",[("hamstring",1.0)],[],["kneeFlexion"],"midRangeBias",False,[],"lyingLegCurl","selectorisedIsolation"),
# ── calves & core ─────────────────────────────────────────────────────────
"standing-calf":     ("isolationExtension",[("calf",1.0)],[],["anklePlantarflexion"],"lengthenedBias",True,["axialSpinalLoad"],"standingCalf","selectorisedIsolation"),
"seated-calf":       ("isolationExtension",[("calf",1.0)],[],["anklePlantarflexion"],"lengthenedBias",True,[],"seatedCalf","seatedIsolation"),
"leg-press-calf":    ("isolationExtension",[("calf",1.0)],[],["anklePlantarflexion"],"lengthenedBias",True,[],"legPress","plateLoaded"),
"cable-crunch":      ("isolationFlexion",[("abs",.85),("obliques",.15)],[],["spinalFlexion"],"midRangeBias",False,["lumbarFlexion"],None,"cableIsolation"),
"hanging-raise":     ("isolationFlexion",[("abs",.7),("obliques",.2),("quad",.1)],[],["hipFlexion","spinalFlexion"],"lengthenedBias",True,["gripLimited"],"pullUpBar","hangingCore"),
"machine-crunch":    ("isolationFlexion",[("abs",.85),("obliques",.15)],[],["spinalFlexion"],"midRangeBias",False,[],"abCrunchMachine","selectorisedIsolation"),
}

# The 26 V1 additions: (name, equipment, isCompound, unilateral, role)
ADDITIONS = {
"db-bench":          ("Dumbbell bench press","dumbbell",True,False,"secondaryCompound"),
"db-incline":        ("Incline dumbbell press","dumbbell",True,False,"secondaryCompound"),
"chest-press-machine":("Converging chest press","machineSelectorised",True,False,"secondaryCompound"),
"dips":              ("Dips","bodyweight",True,False,"secondaryCompound"),
"db-shoulder-press": ("Dumbbell shoulder press","dumbbell",True,False,"secondaryCompound"),
"overhead-press":    ("Barbell overhead press","barbell",True,False,"primaryStrength"),
"assisted-pull-up":  ("Assisted pull-up","machineSelectorised",True,False,"secondaryCompound"),
"neutral-pulldown":  ("Neutral-grip lat pulldown","machineSelectorised",True,False,"secondaryCompound"),
"seated-cable-row":  ("Seated cable row","cable",True,False,"secondaryCompound"),
"db-row":            ("Dumbbell row","dumbbell",True,True,"secondaryCompound"),
"t-bar-row":         ("Chest-supported T-bar row","machinePlate",True,False,"secondaryCompound"),
"smith-squat":       ("Smith machine squat","smith",True,False,"primaryStrength"),
"goblet-squat":      ("Goblet squat","dumbbell",True,False,"secondaryCompound"),
"walking-lunge":     ("Walking lunge","dumbbell",True,True,"secondaryCompound"),
"db-rdl":            ("Dumbbell Romanian deadlift","dumbbell",True,False,"primaryStrength"),
"back-extension":    ("45° back extension","bodyweight",False,False,"accessory"),
"hip-thrust-machine":("Hip thrust machine","machinePlate",True,False,"secondaryCompound"),
"db-lateral":        ("Dumbbell lateral raise","dumbbell",False,False,"isolation"),
"machine-lateral":   ("Lateral raise machine","machineSelectorised",False,False,"isolation"),
"face-pull":         ("Face pull","cable",False,False,"isolation"),
"skull-crusher":     ("EZ-bar skull crusher","barbell",False,False,"accessory"),
"close-grip-bench":  ("Close-grip bench press","barbell",True,False,"secondaryCompound"),
"incline-db-curl":   ("Incline dumbbell curl","dumbbell",False,False,"isolation"),
"ez-curl":           ("EZ-bar curl","barbell",False,False,"accessory"),
"leg-press-calf":    ("Calf raise on leg press","machinePlate",False,False,"isolation"),
"machine-crunch":    ("Ab crunch machine","machineSelectorised",False,False,"isolation"),
}

# The web app keys some exercises per training day, so the same physical
# exercise exists under several ids. Ranking must never offer one of these as
# an alternative to another — "Cable lateral raise instead of Cable lateral
# raise" is not a substitution.
CANONICAL = {
 "legs-lateral":"push-lateral", "science-lateral":"push-lateral", "upper-lateral":"push-lateral",
 "upper-wide-row":"wide-row",
 "upper-shoulder":"push-shoulder",
 "upper-pressdown":"pressdown",
 "upper-paused-bench":"flat-bench",
}

# Curated alternative name -> exercise id, for the `why` copy in
# AlternativesCatalog. Deliberately conservative: a name is mapped only when it
# denotes exactly the catalogue entry, never when it names a variation we do
# not actually have ("Bayesian cable curl", "Spider curl", "Nordic hamstring
# curl"). An unmapped name simply means that alternative has no curated copy;
# the computed ranking is unaffected.
CURATED_NAMES = {
 "45° hip extension":"back-extension",
 "Assisted pull-up":"assisted-pull-up",
 "Cable fly":"upper-fly",
 "Converging chest press":"chest-press-machine",
 "Dumbbell Romanian deadlift":"db-rdl",
 "Dumbbell bench press":"db-bench",
 "Dumbbell lateral raise":"db-lateral",
 "EZ-bar skull crusher":"skull-crusher",
 "Flat bench press":"flat-bench",
 "Hack squat":"hack-squat",
 "Heel-elevated Smith squat":"smith-squat",
 "Incline chest-pressmachine":"incline-machine",
 "Incline dumbbell curl":"incline-db-curl",
 "Incline dumbbell press":"db-incline",
 "Leg press":"leg-press",
 "Leg-press calf raise":"leg-press-calf",
 "Lying leg curl":"lying-curl",
 "Machine crunch":"machine-crunch",
 "Machine lateral raise":"machine-lateral",
 "Machine preacher curl":"science-preacher",
 "Neutral cable row":"seated-cable-row",
 "Neutral-grip lat pulldown":"neutral-pulldown",
 "Neutral-grip pulldown":"neutral-pulldown",
 "Pec-deck":"pec-fly",
 "Reverse pec deck":"reverse-pec",
 "Seated dumbbell press":"db-shoulder-press",
 "Seated leg curl":"seated-curl",
}
