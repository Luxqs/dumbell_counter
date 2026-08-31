const EXERCISES = [
  {
    id: 'bench-press',
    fitCategory: 0,             // FIT exercise_category: bench_press
    name: 'Bench Press (Dumbbell)',
    description: 'Tlak činiek nahor z hrudníka v ľahu',
    tips: 'Nohy pevne na zemi, mierne prehnutie chrbta, tlač do úplného vystretia.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške ramien',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'increase',
      restThreshold: 100,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 155,   // rep is counted here
      idealPeak:     168,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Tlač vyššie — vystri lakte',
      eccentric:  'Spúšťaj k hrudníku kontrolovane',
    }
  },
  {
    id: 'bicep-curl',
    fitCategory: 7,             // FIT exercise_category: curl
    name: 'Bicep Curl',
    description: 'Zdvíhanie činiek k ramenám',
    tips: 'Lakte drž pri tele, choď do plného rozsahu.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške pásu',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'decrease',
      restThreshold: 150,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 70,   // rep is counted here
      idealPeak:     45,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Zdvihni vyššie — hore stiahni',
      eccentric:  'Dole vystri ruku úplne',
    }
  },
  {
    id: 'concentration-curl',
    fitCategory: 7,             // FIT exercise_category: curl
    name: 'Concentration Curl',
    unilateral: true,           // one arm works, the other is idle
    description: 'Zdvih v sede s lakťom opretým o vnútro stehna',
    tips: 'Lakeť pevne opri o stehno, zdvíhaj pomaly a silno stiahni na vrchole.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške kolien',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'decrease',
      restThreshold: 150,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 70,   // rep is counted here
      idealPeak:     40,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      900,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Zdvihni vyššie — hore silno stiahni',
      eccentric:  'Dole vystri ruku úplne',
    }
  },
  {
    id: 'decline-pushup',
    fitCategory: 22,            // FIT exercise_category: push_up
    name: 'Decline Push-up',
    description: 'Klik s nohami vyloženými na stoličke alebo lavičke',
    tips: 'Telo v jednej línii, ruky na šírku ramien, hrudník spusti k zemi.',
    cameraHint: '📷 Bočný pohľad · kamera pri zemi',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'increase',
      restThreshold: 90,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 150,   // rep is counted here
      idealPeak:     165,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Vytlač sa úplne hore',
      eccentric:  'Spusti hrudník nižšie k zemi',
    }
  },
  {
    id: 'dumbbell-fly',
    fitCategory: 9,             // FIT exercise_category: flye
    name: 'Dumbbell Fly',
    description: 'Rozovretie rúk do strán a stiahnutie k sebe',
    tips: 'Lakte stále mierne pokrčené, spúšťaj kontrolovane, hore stiahni hrudník.',
    cameraHint: '📷 Čelný pohľad · kamera vo výške hrudníka',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: {
      direction:     'decrease',
      restThreshold: 85,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 35,   // rep is counted here
      idealPeak:     20,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      900,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Stiahni viac — spoj ruky',
      eccentric:  'Rozovri viac, natiahni hrudník',
    }
  },
  {
    id: 'dumbbell-row',
    fitCategory: 23,            // FIT exercise_category: row
    name: 'Dumbbell Row',
    unilateral: true,           // one arm works, the other braces
    description: 'Príťah jednou rukou v predklone k bedru',
    tips: 'Rovný chrbát, spevni stred tela, lakeť ťahaj dozadu k stropu.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške bokov',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'decrease',
      restThreshold: 155,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 70,   // rep is counted here
      idealPeak:     55,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Ťahaj lakeť viac dozadu',
      eccentric:  'Dole nechaj ruku úplne visieť',
    }
  },
  {
    id: 'goblet-squat',
    fitCategory: 28,            // FIT exercise_category: squat
    name: 'Goblet Squat',
    description: 'Drep s jednou činkou držanou pri hrudníku',
    tips: 'Hrudník hore, kolená v línii špičiek, boky dozadu a dole, päty na zemi.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške bokov',
    joints: { a: 'hip', b: 'knee', c: 'ankle' },
    counting: {
      direction:     'decrease',
      restThreshold: 150,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 85,   // rep is counted here
      idealPeak:     70,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      1000,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Klesni nižšie — stehná do vodorovnej',
      eccentric:  'Postav sa úplne a vystri',
    }
  },
  {
    id: 'hammer-curl',
    fitCategory: 7,             // FIT exercise_category: curl
    name: 'Hammer Curl',
    description: 'Zdvih s neutrálnym úchopom, palce nahor',
    tips: 'Palce stále hore, lakte bez pohybu, plný rozsah.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške pásu',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'decrease',
      restThreshold: 150,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 70,   // rep is counted here
      idealPeak:     45,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Zdvihni vyššie — palce k ramenu',
      eccentric:  'Dole vystri ruku úplne',
    }
  },
  {
    id: 'lunge',
    fitCategory: 17,            // FIT exercise_category: lunge
    name: 'Dumbbell Lunge',
    description: 'Výpad vpred s činkami pri bokoch',
    tips: 'Predné koleno nad členkom, zadné takmer po zem, trup vzpriamený.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške bokov',
    joints: { a: 'hip', b: 'knee', c: 'ankle' },
    counting: {
      direction:     'decrease',
      restThreshold: 160,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 85,   // rep is counted here
      idealPeak:     75,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      1000,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Zadné koleno spusti nižšie',
      eccentric:  'Vytlač sa úplne späť do stoja',
    }
  },
  {
    id: 'reverse-fly',
    fitCategory: 9,             // FIT exercise_category: flye
    name: 'Incline Reverse Fly',
    description: 'Rozpažovanie v predklone na zadné delty',
    tips: 'Predklon v bedrách asi 45°, ruky dvíhaj do strán.',
    cameraHint: '📷 Zozadu alebo z boku · kamera vo výške bokov',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: {
      direction:     'increase',
      restThreshold: 35,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 75,   // rep is counted here
      idealPeak:     88,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Zdvihni ruky vyššie — stiahni zadné delty',
      eccentric:  'Spúšťaj kontrolovane, nehojdaj',
    }
  },
  {
    id: 'lateral-raise',
    fitCategory: 14,            // FIT exercise_category: lateral_raise
    name: 'Lateral Raise',
    description: 'Rozpažovanie do výšky ramien',
    tips: 'Lakte mierne pokrčené, veď pohyb lakťami, nie dlaňami.',
    cameraHint: '📷 Čelný pohľad · kamera vo výške ramien',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: {
      direction:     'increase',
      restThreshold: 30,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 75,   // rep is counted here
      idealPeak:     88,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Zdvihni do výšky ramien',
      eccentric:  'Spusti úplne dole, bez odrazu',
    }
  },
  {
    id: 'pullup',
    fitCategory: 21,            // FIT exercise_category: pull_up
    name: 'Pull-up',
    description: 'Zhyb z visu až po bradu nad hrazdou',
    tips: 'Začni z úplného visu, lakte ťahaj k bokom, brada nad hrazdu.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške hrazdy',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'decrease',
      restThreshold: 155,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 70,   // rep is counted here
      idealPeak:     55,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      1000,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Ťahaj vyššie — brada nad hrazdu',
      eccentric:  'Dole úplný vis',
    }
  },
  {
    id: 'romanian-deadlift',
    fitCategory: 8,             // FIT exercise_category: deadlift
    name: 'Romanian Deadlift',
    description: 'Predklon v bedrách so spúšťaním činiek pozdĺž nôh',
    tips: 'Kolená mierne pokrčené, ohyb v bedrách nie v páse, dole cíť ťah v zadnej strane stehien.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške bokov',
    joints: { a: 'shoulder', b: 'hip', c: 'knee' },
    counting: {
      direction:     'decrease',
      restThreshold: 155,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 95,   // rep is counted here
      idealPeak:     80,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      1000,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Ohni sa viac — boky dozadu',
      eccentric:  'Vystri sa a stiahni zadok',
    }
  },
  {
    id: 'shoulder-press',
    fitCategory: 24,            // FIT exercise_category: shoulder_press
    name: 'Shoulder Press',
    description: 'Tlak činiek nad hlavu z výšky ramien',
    tips: 'Začni s lakťami asi na 90°, tlač priamo hore do úplného vystretia.',
    cameraHint: '📷 Z boku alebo spredu · kamera vo výške ramien',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'increase',
      restThreshold: 110,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 155,   // rep is counted here
      idealPeak:     170,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Tlač nad hlavu do úplného vystretia',
      eccentric:  'Spusti do výšky ramien',
    }
  },
  {
    id: 'skullcrusher',
    fitCategory: 30,            // FIT exercise_category: triceps_extension
    name: 'Skullcrusher',
    description: 'Extenzia tricepsu v ľahu smerom k čelu',
    tips: 'Nadlaktia drž zvisle a bez pohybu, hýbu sa len predlaktia, spúšťaj kontrolovane.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške hlavy',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'increase',
      restThreshold: 80,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 150,   // rep is counted here
      idealPeak:     165,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Úplne vystri lakte',
      eccentric:  'Spúšťaj pomaly k čelu',
    }
  },
  {
    id: 'tricep-extension',
    fitCategory: 30,            // FIT exercise_category: triceps_extension
    name: 'Tricep Extension',
    description: 'Extenzia tricepsu s činkou nad hlavou',
    tips: 'Nadlaktia drž zvisle a bez pohybu, hýbu sa len predlaktia.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške ramien',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction:     'increase',
      restThreshold: 100,   // must return past this (± hysteresis) to arm the next rep
      peakThreshold: 150,   // rep is counted here
      idealPeak:     168,   // full-range target — the gauge only turns fully green here
      hysteresis:    6,    // deg of slack around restThreshold, kills jitter re-triggers
      minRepMs:      800,  // faster than this = momentum, flagged as a sloppy rep
    },
    cues: {
      concentric: 'Úplne vystri ruky nad hlavou',
      eccentric:  'Spúšťaj za hlavu kontrolovane',
    }
  },
];

// ─── Preset Workout Plan Templates ──────────────────────────────────────────
const PRESET_PLANS = [
  {
    id: 'arms-blast',
    name: 'Ruky naplno',
    description: 'Tréning zameraný len na biceps a triceps',
    plan: [
      { exerciseId: 'bicep-curl',          sets: 4, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'hammer-curl',         sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'concentration-curl',  sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'tricep-extension',    sets: 4, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'skullcrusher',        sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'arnold-blueprint',
    name: 'Arnold Blueprint',
    description: 'Objemový tréning vrchnej časti tela inšpirovaný Arnoldom',
    plan: [
      { exerciseId: 'bench-press',      sets: 5, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'dumbbell-fly',     sets: 5, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'shoulder-press',   sets: 5, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',    sets: 5, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'bicep-curl',       sets: 5, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'tricep-extension', sets: 5, reps: 10, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'beginner-full-body',
    name: 'Celé telo pre začiatočníkov',
    description: 'Klasická trojfázová zostava na celé telo, 3× do týždňa',
    plan: [
      { exerciseId: 'goblet-squat',     sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'shoulder-press',   sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'dumbbell-row',     sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'bicep-curl',       sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'tricep-extension', sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',    sets: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 0 },
    ]
  },
  {
    id: 'lower-body',
    name: 'Spodná časť tela',
    description: 'Stehná, zadná strana stehien a zadok s činkami',
    plan: [
      { exerciseId: 'goblet-squat',      sets: 4, reps: 12, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'romanian-deadlift', sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'lunge',             sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'ppl-pull',
    name: 'PPL – Pull (ťah)',
    description: 'Split Push/Pull/Legs: chrbát a biceps',
    plan: [
      { exerciseId: 'pullup',             sets: 4, reps: 8,  restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'dumbbell-row',       sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'reverse-fly',        sets: 3, reps: 15, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'bicep-curl',         sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'hammer-curl',        sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'concentration-curl', sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'ppl-push',
    name: 'PPL – Push (tlak)',
    description: 'Split Push/Pull/Legs: hrudník, ramená a triceps',
    plan: [
      { exerciseId: 'bench-press',      sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'shoulder-press',   sets: 3, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'dumbbell-fly',     sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',    sets: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 90 },
      { exerciseId: 'tricep-extension', sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'skullcrusher',     sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'ppl-legs',
    name: 'PPL – Legs (nohy)',
    description: 'Split Push/Pull/Legs: celá spodná časť tela',
    plan: [
      { exerciseId: 'goblet-squat',      sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'romanian-deadlift', sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'lunge',             sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'shoulder-sculpt',
    name: 'Ramená do tvaru',
    description: 'Kompletné ramená: predné, bočné aj zadné delty',
    plan: [
      { exerciseId: 'shoulder-press', sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',  sets: 4, reps: 15, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'reverse-fly',    sets: 4, reps: 15, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'strength-5x5',
    name: '5×5 Sila',
    description: 'Ťažké komplexné cviky — 5 sérií po 5 opakovaniach na silu',
    plan: [
      { exerciseId: 'goblet-squat',   sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 180 },
      { exerciseId: 'bench-press',    sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 180 },
      { exerciseId: 'shoulder-press', sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 180 },
      { exerciseId: 'dumbbell-row',   sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 0 },
    ]
  },
];

// ─── MoveNet keypoint name → index ──────────────────────────────────────────
const KP = {
  nose: 0,
  left_eye: 1, right_eye: 2,
  left_ear: 3, right_ear: 4,
  left_shoulder: 5, right_shoulder: 6,
  left_elbow: 7, right_elbow: 8,
  left_wrist: 9, right_wrist: 10,
  left_hip: 11, right_hip: 12,
  left_knee: 13, right_knee: 14,
  left_ankle: 15, right_ankle: 16
};

const SKELETON = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

// ─── Detection & Counting Constants ─────────────────────────────────────────
const MIN_KEYPOINT_CONFIDENCE = 0.5;    // Raised from 0.3 — filters noisy detections
const EMA_ALPHA               = 0.35;   // Exponential moving average weight
const REP_COOLDOWN_MS         = 250;    // Noise floor only. Double-counting is prevented by the
                                        // armed latch in RepCounter, not by this — so it no longer
                                        // has to be long enough to swallow a genuinely fast rep.
const DEFAULT_REST_BETWEEN_SETS = 30;

// ─── Live form-feedback tuning ──────────────────────────────────────────────
// Fraction of the ideal range that still counts as "shallow" — drives the
// "go higher / go deeper" coaching text while the user is mid-rep.
const SHALLOW_REP_PROGRESS = 0.9;
// Per-side range-of-motion gap (0-1) that raises the imbalance warning.
// Compared over the last few reps, so one bad rep doesn't trigger it.
const ROM_IMBALANCE_GAP    = 0.15;
// How many completed reps of ROM history each side keeps for that comparison.
const ROM_HISTORY_LEN      = 5;
// How much further through the range one side must be before it is treated as
// the side actually doing the rep. Below this margin the sides are considered
// level and the better-tracked one is used instead.
const SIDE_LEAD_MARGIN     = 0.08;
// Per-side motion is tracked as a decaying average of how many degrees the joint
// moves per frame. It is what separates the limb performing the exercise from a
// limb that is merely parked in frame — a row's bracing arm, a concentration
// curl's free arm. MOTION_DECAY keeps that memory alive across the pause at the
// top and bottom of a rep; MOTION_FLOOR is the deg/frame below which a limb is
// treated as stationary.
const MOTION_DECAY         = 0.90;
const MOTION_FLOOR         = 0.35;
// Consecutive frames a threshold crossing must persist before it is believed.
// Counting reads the raw joint angle (the smoothed one lags too far behind a
// real rep), so this is what keeps a single bad inference from faking a rep.
const CONFIRM_FRAMES       = 2;
// How long a rep verdict stays on screen. Verdicts are single-frame events;
// without a dwell time they are literally unreadable.
const COACH_DWELL_MS       = 1400;
// How long the camera frame flashes green after a completed rep.
const REP_FLASH_MS         = 600;

// ─── Strava one-click upload (disabled until you fill this in) ───────────────
// Strava's token exchange needs a client_secret and its API sends no CORS
// headers, so a static page cannot talk to it directly. Deploy the worker in
// strava-worker.js, then put its URL and your numeric client ID here. While
// either value is blank the app hides the Strava button entirely rather than
// offering a control that cannot work.
const STRAVA_CONFIG = {
  clientId: '',      // e.g. '123456' — from https://www.strava.com/settings/api
  proxyUrl: '',      // e.g. 'https://dumbbell-strava.you.workers.dev'
};
