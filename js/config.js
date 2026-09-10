const EXERCISES = [
  {
    id: 'bench-press',
    fitCategory: 0,             // FIT exercise_category: bench_press
    name: 'Bench Press (Dumbbell)',
    description: 'Tlak činiek nahor z hrudníka v ľahu',
    tips: 'Nohy pevne na zemi, mierne prehnutie chrbta, tlač do úplného vystretia.',
    cameraHint: '📷 Bočný pohľad · kamera vo výške ramien',
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'frontal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'any',            // what assessFraming() expects to see
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
    view: 'frontal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'any',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
    view: 'sagittal',            // what assessFraming() expects to see
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
//
// Everything here that describes *time* is expressed in milliseconds or in
// degrees per second, never in frames. The engine used to confirm a threshold
// crossing over a fixed number of frames, which made counting depend on how
// fast the phone happened to be: measured on a textbook 2.0 s rep, every
// exercise scored 1 rep out of 5 at 8 fps and 5 out of 5 at 15 fps, because the
// angular overshoot a 2-frame confirmation demands is 2 x (speed / fps).
// MoveNet Thunder over WebGL runs at 8-15 fps on a mid-range phone, so that was
// the normal case, not the edge case.

// Trusted confidence: what the skeleton is drawn from and what a clean reading
// requires.
const MIN_KEYPOINT_CONFIDENCE = 0.5;
// Occlusion is normal mid-rep — a thigh covers the hip at the bottom of a squat
// and its score falls to 0.3-0.4. Treating 0.5 as a cliff threw away the whole
// set: hip at 0.55 counted 5 reps of 5, at 0.49 it counted 0 and told the user
// to step back, which is the wrong advice for something being covered up.
// Between the hard floor and MIN_KEYPOINT_CONFIDENCE a keypoint is still used
// and the reading is marked uncertain.
const KP_CONFIDENCE_HARD = 0.35;
// Lower-body joints hide behind the limb that moves them, so they need a lower
// floor than wrists and elbows.
const KP_CONFIDENCE_HARD_BY_JOINT = { hip: 0.28, knee: 0.28, ankle: 0.28 };
// How long the vertex joint and its far anchor may be reused after dropping out
// completely. The distal joint is never substituted — it is the end that
// actually travels, so a stale copy of it would invent a held position.
const KP_STALE_MAX_MS      = 250;

// Smoothing time constant for the displayed angle. 77 ms is exactly what
// EMA_ALPHA 0.35 per frame meant at 30 fps — the difference is that it now
// means the same thing at 12 fps and at 60 fps.
const EMA_TAU_MS           = 77;
const REP_COOLDOWN_MS      = 250;    // noise floor only; double-counting is prevented by the
                                     // armed latch in RepCounter, not by this.
const DEFAULT_REST_BETWEEN_SETS = 30;
// Frame interval used for the first frame, and the ceiling applied to a gap
// (a backgrounded tab, a stalled camera) so one long pause cannot be treated
// as one enormous movement.
const DEFAULT_FRAME_MS     = 33;
const MAX_FRAME_MS         = 500;

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
// Per-side motion is a decaying average of joint speed in DEGREES PER SECOND —
// frame-rate independent, unlike the deg/frame version it replaces, which
// silently changed meaning with the phone's speed. It is what separates the
// limb performing the exercise from a limb merely parked in frame: a row's
// bracing arm, a concentration curl's free arm. MOTION_TAU_MS keeps that memory
// alive across the pause at the top and bottom of a rep.
const MOTION_TAU_MS        = 300;
const MOTION_FLOOR_DPS     = 10;
// How long a threshold crossing must hold before it is believed, measured from
// the crossing itself (the previous frame), not from the first frame observed
// past the line. At 30 fps this is the same two frames as before; at 60 fps it
// filters twice as many; at 12 fps a single frame already spans it, and the
// crossing is accepted as long as the joint was travelling that way beforehand
// (PROGRESS_EPS / the approach streak) rather than being demanded to overshoot.
const CONFIRM_MS           = 60;
// Progress change per frame below which a side counts as neither approaching
// the peak nor returning — noise, not travel.
const PROGRESS_EPS         = 0.01;
// A joint that appears to move faster than this did not move — the model put a
// keypoint on the wrong limb. Such a frame is displayed but never allowed to
// confirm a threshold crossing, which matters most on a slow phone, where a
// single frame is otherwise enough to credit a rep on its own.
const MAX_JOINT_DPS        = 720;
// Below this measured frame rate the counting engine loses reps no matter how
// it is tuned, so the app drops from MoveNet Thunder to Lightning and says so.
const FPS_LOW_THRESHOLD    = 12;
// Frames averaged for the on-screen fps readout.
const FPS_WINDOW           = 30;
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
