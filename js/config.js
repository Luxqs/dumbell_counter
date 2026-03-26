const EXERCISES = [
  {
    id: 'bench-press',
    name: 'Bench Press (Dumbbell)',
    description: 'Press dumbbells up from chest while lying back',
    tips: 'Plant feet firmly, slight arch, press to full lockout. Camera works best from the side.',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'increase', restThreshold: 100, peakThreshold: 155 }
  },
  {
    id: 'bicep-curl',
    name: 'Bicep Curl',
    description: 'Curl dumbbells toward shoulders',
    tips: 'Keep elbows close to body, full range of motion',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'decrease', restThreshold: 150, peakThreshold: 70 }
  },
  {
    id: 'concentration-curl',
    name: 'Concentration Curl',
    description: 'Seated curl with elbow braced on inner thigh',
    tips: 'Plant elbow firmly on thigh, curl slowly and squeeze hard at the top',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'decrease', restThreshold: 150, peakThreshold: 70 }
  },
  {
    id: 'decline-pushup',
    name: 'Decline Push-up',
    description: 'Push-up with feet elevated on a chair or bench',
    tips: 'Keep body straight, hands shoulder-width, lower chest to ground',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'increase', restThreshold: 90, peakThreshold: 150 }
  },
  {
    id: 'dumbbell-fly',
    name: 'Dumbbell Fly',
    description: 'Open arms wide and squeeze together at the top',
    tips: 'Slight bend in elbows throughout, lower with control, squeeze chest at top',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: { direction: 'decrease', restThreshold: 85, peakThreshold: 35 }
  },
  {
    id: 'dumbbell-row',
    name: 'Dumbbell Row',
    description: 'Bent-over single-arm row pulling dumbbell to hip',
    tips: 'Flat back, brace core, pull elbow back toward the ceiling',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'decrease', restThreshold: 155, peakThreshold: 70 }
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    description: 'Neutral-grip curl with thumbs facing up',
    tips: 'Keep thumbs up throughout, elbows stationary, full range of motion',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'decrease', restThreshold: 150, peakThreshold: 70 }
  },
  {
    id: 'reverse-fly',
    name: 'Incline Reverse Fly',
    description: 'Bent-over lateral raises for rear deltoids',
    tips: 'Bend forward at hips ~45°, raise arms out to sides',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: { direction: 'increase', restThreshold: 35, peakThreshold: 75 }
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    description: 'Raise dumbbells out to shoulder height from sides',
    tips: 'Slight bend in elbows, lead with elbows not hands',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: { direction: 'increase', restThreshold: 30, peakThreshold: 75 }
  },
  {
    id: 'pullup',
    name: 'Pull-up',
    description: 'Vertical pull from dead hang to chin above bar',
    tips: 'Dead hang start, pull elbows down toward hips, chin clears the bar',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'decrease', restThreshold: 155, peakThreshold: 70 }
  },
  {
    id: 'shoulder-press',
    name: 'Shoulder Press',
    description: 'Press dumbbells overhead from shoulder height',
    tips: 'Start with elbows at ~90°, press straight up to full lockout',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'increase', restThreshold: 110, peakThreshold: 155 }
  },
  {
    id: 'skullcrusher',
    name: 'Skullcrusher',
    description: 'Lying tricep extension lowering dumbbells toward forehead',
    tips: 'Keep upper arms vertical and still, only forearms move, controlled descent',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'increase', restThreshold: 80, peakThreshold: 150 }
  },
  {
    id: 'tricep-extension',
    name: 'Tricep Extension',
    description: 'Overhead tricep extension with dumbbell',
    tips: 'Keep upper arms vertical and still, only forearms move',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: { direction: 'increase', restThreshold: 100, peakThreshold: 150 }
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
      { exerciseId: 'hammer-curl',          sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'concentration-curl',   sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'tricep-extension',     sets: 4, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'skullcrusher',         sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 0 },
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
      { exerciseId: 'shoulder-press',   sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'dumbbell-row',     sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'bicep-curl',       sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'tricep-extension', sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',    sets: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 0 },
    ]
  },
  {
    id: 'ppl-pull',
    name: 'PPL – Pull Day',
    description: 'Push/Pull/Legs split: back & biceps session',
    plan: [
      { exerciseId: 'pullup',              sets: 4, reps: 8,  restBetweenSets: 90, restAfterExercise: 120 },
      { exerciseId: 'dumbbell-row',        sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'reverse-fly',         sets: 3, reps: 15, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'bicep-curl',          sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'hammer-curl',         sets: 3, reps: 12, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'concentration-curl',  sets: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 0 },
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
    id: 'shoulder-sculpt',
    name: 'Shoulder Sculpt',
    description: 'Complete shoulder development: front, side & rear delts',
    plan: [
      { exerciseId: 'shoulder-press',  sets: 4, reps: 10, restBetweenSets: 90, restAfterExercise: 90 },
      { exerciseId: 'lateral-raise',   sets: 4, reps: 15, restBetweenSets: 60, restAfterExercise: 90 },
      { exerciseId: 'reverse-fly',     sets: 4, reps: 15, restBetweenSets: 60, restAfterExercise: 0 },
    ]
  },
  {
    id: 'strength-5x5',
    name: '5×5 Strength',
    description: 'Heavy compound movements — 5 sets × 5 reps for strength gains',
    plan: [
      { exerciseId: 'bench-press',    sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 180 },
      { exerciseId: 'shoulder-press', sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 180 },
      { exerciseId: 'dumbbell-row',   sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 180 },
      { exerciseId: 'pullup',         sets: 5, reps: 5, restBetweenSets: 180, restAfterExercise: 0 },
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

const DEFAULT_REST_BETWEEN_SETS = 30;
const MIN_KEYPOINT_CONFIDENCE = 0.3;
const ANGLE_SMOOTHING_FRAMES = 6;
