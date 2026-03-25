const EXERCISES = [
  {
    id: 'bicep-curl',
    name: 'Bicep Curl',
    description: 'Curl dumbbells toward shoulders',
    tips: 'Keep elbows close to body, full range of motion',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' }, // b = vertex
    counting: {
      direction: 'decrease', // angle decreases at peak contraction
      restThreshold: 150,    // angle > 150° → rest/down state
      peakThreshold: 70,     // angle < 70° from rest → count rep
    }
  },
  {
    id: 'shoulder-press',
    name: 'Shoulder Press',
    description: 'Press dumbbells overhead from shoulder height',
    tips: 'Start with elbows at ~90°, press straight up',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction: 'increase', // angle increases at peak contraction
      restThreshold: 110,    // angle < 110° → rest/down state
      peakThreshold: 155,    // angle > 155° from rest → count rep
    }
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    description: 'Raise dumbbells out to shoulder height from sides',
    tips: 'Slight bend in elbows, lead with elbows',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' }, // angle at shoulder
    counting: {
      direction: 'increase',
      restThreshold: 30,
      peakThreshold: 75,
    }
  },
  {
    id: 'tricep-extension',
    name: 'Tricep Extension',
    description: 'Extend dumbbell overhead, elbows pointing up',
    tips: 'Keep upper arms still, only forearms move',
    joints: { a: 'shoulder', b: 'elbow', c: 'wrist' },
    counting: {
      direction: 'increase',
      restThreshold: 100,    // elbow bent behind head
      peakThreshold: 150,    // arm fully extended
    }
  },
  {
    id: 'reverse-fly',
    name: 'Incline Reverse Fly',
    description: 'Bent-over lateral raises for rear deltoids',
    tips: 'Bend forward at hips ~45°, raise arms out to sides',
    joints: { a: 'hip', b: 'shoulder', c: 'elbow' },
    counting: {
      direction: 'increase',
      restThreshold: 35,
      peakThreshold: 75,
    }
  }
];

// MoveNet keypoint name → index
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
const DEFAULT_REST_BETWEEN_REPS = 0;
const MIN_KEYPOINT_CONFIDENCE = 0.3;
const ANGLE_SMOOTHING_FRAMES = 6;
