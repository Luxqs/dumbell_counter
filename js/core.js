// ─── Audio Manager ────────────────────────────────────────────────────────────

class AudioManager {
  constructor() {
    this._ctx = null;
    this.enabled = this._loadPref();
  }

  _loadPref() {
    try { return JSON.parse(localStorage.getItem('dc_audio_enabled')) ?? true; } catch { return true; }
  }

  _savePref() {
    localStorage.setItem('dc_audio_enabled', JSON.stringify(this.enabled));
  }

  toggle() {
    this.enabled = !this.enabled;
    this._savePref();
    return this.enabled;
  }

  _ensureCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  playRep() {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }
}


// ─── Profile Manager ──────────────────────────────────────────────────────────

class ProfileManager {
  constructor() {
    this.KEY = 'dc_profiles_v1';
    this.ACTIVE_KEY = 'dc_active_profile';
  }

  list() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; }
  }

  _saveList(arr) { localStorage.setItem(this.KEY, JSON.stringify(arr)); }

  getActive() { return localStorage.getItem(this.ACTIVE_KEY) || null; }

  setActive(name) { localStorage.setItem(this.ACTIVE_KEY, name); }

  create(name) {
    name = name.trim();
    if (!name) return false;
    const list = this.list();
    if (!list.includes(name)) { list.push(name); this._saveList(list); }
    this.setActive(name);
    return true;
  }

  delete(name) {
    this._saveList(this.list().filter(n => n !== name));
    if (this.getActive() === name) localStorage.removeItem(this.ACTIVE_KEY);
  }

  // Returns a storage key prefix for the given profile name
  namespace(name) {
    return `u_${name.replace(/[^a-zA-Z0-9]/g, '_')}_`;
  }
}


// ─── Pose Detector (wraps TensorFlow.js MoveNet) ─────────────────────────────

class PoseDetector {
  constructor() {
    this.detector = null;
    this.ready = false;
  }

  async init(onProgress) {
    onProgress?.('Loading pose model…');
    const model = poseDetection.SupportedModels.MoveNet;
    this.detector = await poseDetection.createDetector(model, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      enableSmoothing: true,
    });
    this.ready = true;
    onProgress?.('Model ready');
  }

  async detect(video) {
    if (!this.ready || video.readyState < 2) return null;
    const poses = await this.detector.estimatePoses(video, { flipHorizontal: false });
    return poses.length > 0 ? poses[0] : null;
  }

  kp(pose, name) {
    if (!pose) return null;
    const k = pose.keypoints.find(p => p.name === name);
    return k && k.score >= MIN_KEYPOINT_CONFIDENCE ? k : null;
  }

  drawSkeleton(canvas, video, pose, exerciseId) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || canvas.offsetWidth;
    canvas.height = video.videoHeight || canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!pose) return;

    const exercise = EXERCISES.find(e => e.id === exerciseId);
    const activeNames = exercise
      ? ['left', 'right'].flatMap(s => [
          `${s}_${exercise.joints.a}`,
          `${s}_${exercise.joints.b}`,
          `${s}_${exercise.joints.c}`,
        ])
      : [];

    const kpMap = {};
    pose.keypoints.forEach(k => { kpMap[k.name] = k; });

    SKELETON.forEach(([na, nb]) => {
      const a = kpMap[na], b = kpMap[nb];
      if (!a || !b || a.score < MIN_KEYPOINT_CONFIDENCE || b.score < MIN_KEYPOINT_CONFIDENCE) return;
      const active = activeNames.includes(na) && activeNames.includes(nb);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = active ? '#22c55e' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.stroke();
    });

    pose.keypoints.forEach(k => {
      if (k.score < MIN_KEYPOINT_CONFIDENCE) return;
      const active = activeNames.includes(k.name);
      ctx.beginPath();
      ctx.arc(k.x, k.y, active ? 8 : 4, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#22c55e' : 'rgba(255,255,255,0.55)';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }
}


// ─── Rep Counter ──────────────────────────────────────────────────────────────

class RepCounter {
  constructor(exerciseId) {
    this.exerciseId = exerciseId;
    this.exercise = EXERCISES.find(e => e.id === exerciseId);
    this.reps = 0;
    this.stage = null; // null | 'rest' | 'peak'
    this.angle = 0;
    this._history = [];
  }

  reset() {
    this.reps = 0;
    this.stage = null;
    this.angle = 0;
    this._history = [];
  }

  _calcAngle(a, b, c) {
    const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let deg = Math.abs(r * 180 / Math.PI);
    if (deg > 180) deg = 360 - deg;
    return deg;
  }

  _smooth(angle) {
    this._history.push(angle);
    if (this._history.length > ANGLE_SMOOTHING_FRAMES) this._history.shift();
    return this._history.reduce((s, v) => s + v, 0) / this._history.length;
  }

  _bestAngle(pose, detector) {
    const { a, b, c } = this.exercise.joints;
    let best = null, bestConf = 0;
    for (const side of ['left', 'right']) {
      const pa = detector.kp(pose, `${side}_${a}`);
      const pb = detector.kp(pose, `${side}_${b}`);
      const pc = detector.kp(pose, `${side}_${c}`);
      if (!pa || !pb || !pc) continue;
      const conf = (pa.score + pb.score + pc.score) / 3;
      if (conf > bestConf) {
        bestConf = conf;
        best = this._calcAngle(pa, pb, pc);
      }
    }
    return best;
  }

  update(pose, detector) {
    const raw = this._bestAngle(pose, detector);
    if (raw === null) return { reps: this.reps, angle: this.angle, counted: false };

    const angle = this._smooth(raw);
    this.angle = Math.round(angle);

    const { direction, restThreshold, peakThreshold } = this.exercise.counting;
    let counted = false;

    if (direction === 'decrease') {
      if (angle > restThreshold)                          this.stage = 'rest';
      if (angle < peakThreshold && this.stage === 'rest') { this.stage = 'peak'; this.reps++; counted = true; }
    } else {
      if (angle < restThreshold)                          this.stage = 'rest';
      if (angle > peakThreshold && this.stage === 'rest') { this.stage = 'peak'; this.reps++; counted = true; }
    }

    return { reps: this.reps, angle: this.angle, counted };
  }
}


// ─── Workout Preset Manager ───────────────────────────────────────────────────

class WorkoutManager {
  constructor() { this.KEY = 'dc_presets_v1'; }

  setNamespace(ns) {
    this.KEY = ns ? `dc_${ns}presets_v1` : 'dc_presets_v1';
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; }
  }

  _save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); }

  list() { return Object.keys(this._load()); }

  get(name) { return this._load()[name] || null; }

  save(name, { exerciseId, sets, reps, restBetweenSets }) {
    if (!name.trim()) return false;
    const data = this._load();
    data[name.trim()] = { exerciseId, sets, reps, restBetweenSets, savedAt: Date.now() };
    this._save(data);
    return true;
  }

  delete(name) {
    const data = this._load();
    delete data[name];
    this._save(data);
  }
}


// ─── Workout Plan Manager ─────────────────────────────────────────────────────

class WorkoutPlanManager {
  constructor() { this.KEY = 'dc_plans_v1'; }

  setNamespace(ns) {
    this.KEY = ns ? `dc_${ns}plans_v1` : 'dc_plans_v1';
  }

  _load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; }
  }

  _save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); }

  list() { return Object.keys(this._load()); }

  get(name) { return this._load()[name] || null; }

  save(name, plan) {
    if (!name.trim()) return false;
    const data = this._load();
    data[name.trim()] = { plan, savedAt: Date.now() };
    this._save(data);
    return true;
  }

  delete(name) {
    const data = this._load();
    delete data[name];
    this._save(data);
  }
}
