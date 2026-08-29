const EXERCISES = [
  {
    id: 'bench-press',
    fitCategory: 0,             // FIT exercise_category: bench_press
    name: 'Bench Press (Dumbbell)',
    description: 'Press dumbbells up from chest while lying back',
    tips: 'Plant feet firmly, slight arch, press to full lockout.',
    cameraHint: '📷 Side view · camera at shoulder height',
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
      concentric: 'Press higher — lock the elbows out',
      eccentric:  'Lower to your chest under control',
    }
  },
  {
    id: 'bicep-curl',
    fitCategory: 7,             // FIT exercise_category: curl
    name: 'Bicep Curl',
    description: 'Curl dumbbells toward shoulders',
    tips: 'Keep elbows close to body, full range of motion.',
    cameraHint: '📷 Side view · camera at waist height',
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
      concentric: 'Curl higher — squeeze at the top',
      eccentric:  'Straighten the arm fully at the bottom',
    }
  },
  {
    id: 'concentration-curl',
    fitCategory: 7,             // FIT exercise_category: curl
    name: 'Concentration Curl',
    unilateral: true,           // one arm works, the other is idle
    description: 'Seated curl with elbow braced on inner thigh',
    tips: 'Plant elbow firmly on thigh, curl slowly and squeeze hard at the top.',
    cameraHint: '📷 Side view · camera at knee height',
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
      concentric: 'Curl higher — squeeze hard at the top',
      eccentric:  'Straighten the arm fully at the bottom',
    }
  },
  {
    id: 'decline-pushup',
    fitCategory: 22,            // FIT exercise_category: push_up
    name: 'Decline Push-up',
    description: 'Push-up with feet elevated on a chair or bench',
    tips: 'Keep body straight, hands shoulder-width, lower chest to ground.',
    cameraHint: '📷 Side view · camera at floor level',
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
      concentric: 'Push all the way up to lockout',
      eccentric:  'Lower your chest closer to the floor',
    }
  },
  {
    id: 'dumbbell-fly',
    fitCategory: 9,             // FIT exercise_category: flye
    name: 'Dumbbell Fly',
    description: 'Open arms wide and squeeze together at the top',
    tips: 'Slight bend in elbows throughout, lower with control, squeeze chest at top.',
    cameraHint: '📷 Front view · camera at chest height',
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
      concentric: 'Squeeze further — bring them together',
      eccentric:  'Open wider for a full chest stretch',
    }
  },
  {
    id: 'dumbbell-row',
    fitCategory: 23,            // FIT exercise_category: row
    name: 'Dumbbell Row',
    unilateral: true,           // one arm works, the other braces
    description: 'Bent-over single-arm row pulling dumbbell to hip',
    tips: 'Flat back, brace core, pull elbow back toward the ceiling.',
    cameraHint: '📷 Side view · camera at hip height',
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
      concentric: 'Pull the elbow further back',
      eccentric:  'Let the arm hang fully at the bottom',
    }
  },
  {
    id: 'goblet-squat',
    fitCategory: 28,            // FIT exercise_category: squat
    name: 'Goblet Squat',
    description: 'Hold one dumbbell at chest and squat deep',
    tips: 'Chest up, knees track toes, push hips back and down, heels stay flat.',
    cameraHint: '📷 Side view · camera at hip height',
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
      concentric: 'Sit deeper — thighs to parallel',
      eccentric:  'Stand all the way up and lock out',
    }
  },
  {
    id: 'hammer-curl',
    fitCategory: 7,             // FIT exercise_category: curl
    name: 'Hammer Curl',
    description: 'Neutral-grip curl with thumbs facing up',
    tips: 'Keep thumbs up throughout, elbows stationary, full range of motion.',
    cameraHint: '📷 Side view · camera at waist height',
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
      concentric: 'Curl higher — thumbs toward the shoulder',
      eccentric:  'Straighten the arm fully at the bottom',
    }
  },
  {
    id: 'lunge',
    fitCategory: 17,            // FIT exercise_category: lunge
    name: 'Dumbbell Lunge',
    description: 'Step forward into a deep lunge holding dumbbells at sides',
    tips: 'Front knee stays over ankle, back knee nearly touches floor, torso upright.',
    cameraHint: '📷 Side view · camera at hip height',
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
      concentric: 'Drop the back knee lower',
      eccentric:  'Drive all the way back up to standing',
    }
  },
  {
    id: 'reverse-fly',
    fitCategory: 9,             // FIT exercise_category: flye
    name: 'Incline Reverse Fly',
    description: 'Bent-over lateral raises for rear deltoids',
    tips: 'Bend forward at hips ~45°, raise arms out to sides.',
    cameraHint: '📷 Rear or side view · camera at hip height',
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
      concentric: 'Raise the arms higher — squeeze the rear delts',
      eccentric:  'Lower under control, no swinging',
    }
  },
  {
    id: 'lateral-raise',
    fitCategory: 14,            // FIT exercise_category: lateral_raise
    name: 'Lateral Raise',
    description: 'Raise dumbbells out to shoulder height from sides',
    tips: 'Slight bend in elbows, lead with elbows not hands.',
    cameraHint: '📷 Front view · camera at shoulder height',
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
      concentric: 'Raise to shoulder height',
      eccentric:  'Lower all the way down, no bouncing',
    }
  },
  {
    id: 'pullup',
    fitCategory: 21,            // FIT exercise_category: pull_up
    name: 'Pull-up',
    description: 'Vertical pull from dead hang to chin above bar',
    tips: 'Dead hang start, pull elbows down toward hips, chin clears the bar.',
    cameraHint: '📷 Side view · camera at bar height',
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
      concentric: 'Pull higher — chin over the bar',
      eccentric:  'Full dead hang at the bottom',
    }
  },
  {
    id: 'romanian-deadlift',
    fitCategory: 8,             // FIT exercise_category: deadlift
    name: 'Romanian Deadlift',
    description: 'Hip hinge lowering dumbbells along the legs',
    tips: 'Soft bend in knees, hinge at hips not waist, feel hamstring stretch at bottom.',
    cameraHint: '📷 Side view · camera at hip height',
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
      concentric: 'Hinge further — push the hips back',
      eccentric:  'Stand tall and squeeze the glutes',
    }
  },
  {
    id: 'shoulder-press',
    fitCategory: 24,            // FIT exercise_category: shoulder_press
    name: 'Shoulder Press',
    description: 'Press dumbbells overhead from shoulder height',
    tips: 'Start with elbows at ~90°, press straight up to full lockout.',
    cameraHint: '📷 Side or front view · camera at shoulder height',
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
      concentric: 'Press to full overhead lockout',
      eccentric:  'Lower to shoulder height',
    }
  },
  {
    id: 'skullcrusher',
    fitCategory: 30,            // FIT exercise_category: triceps_extension
    name: 'Skullcrusher',
    description: 'Lying tricep extension lowering dumbbells toward forehead',
    tips: 'Keep upper arms vertical and still, only forearms move, controlled descent.',
    cameraHint: '📷 Side view · camera at head height',
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
      concentric: 'Extend the elbows fully',
      eccentric:  'Lower toward your forehead slowly',
    }
  },
  {
    id: 'tricep-extension',
    fitCategory: 30,            // FIT exercise_category: triceps_extension
    name: 'Tricep Extension',
    description: 'Overhead tricep extension with dumbbell',
    tips: 'Keep upper arms vertical and still, only forearms move.',
    cameraHint: '📷 Side view · camera at shoulder height',
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
      concentric: 'Straighten the arms fully overhead',
      eccentric:  'Lower behind your head under control',
    }
  },
];

// ─── Preset Workout Plan Templates ──────────────────────────────────────────
const PRESET_PLANS = [
  {
    id: 'arms-blast',
    name: 'Arms Blast',
    description: 'Dedicated biceps & triceps hypertrophy session',
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
    description: 'Arnold-inspired high-volume upper-body split',
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
    name: 'Beginner Full Body',
    description: 'Classic 3-day/week full-body routine for beginners',
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
    name: 'Lower Body Dumbbells',
    description: 'Quad, hamstring & glute session with dumbbells',
    plan: [
      { exerciseId: 'goblet-squat',      sets: 4, reps: 12, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'romanian-deadlift', sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'lunge',             sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'ppl-pull',
    name: 'PPL – Pull Day',
    description: 'Push/Pull/Legs split: back & biceps session',
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
    name: 'PPL – Push Day',
    description: 'Push/Pull/Legs split: chest, shoulders & triceps',
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
    name: 'PPL – Legs Day',
    description: 'Push/Pull/Legs split: full lower body session',
    plan: [
      { exerciseId: 'goblet-squat',      sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'romanian-deadlift', sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'lunge',             sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'shoulder-sculpt',
    name: 'Shoulder Sculpt',
    description: 'Complete shoulder development: front, side & rear delts',
    plan: [
      { exerciseId: 'shoulder-press', sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',  sets: 4, reps: 15, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'reverse-fly',    sets: 4, reps: 15, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'strength-5x5',
    name: '5×5 Strength',
    description: 'Heavy compound movements — 5 sets × 5 reps for strength gains',
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
