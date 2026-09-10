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

  _beep(freq, duration, startOffset = 0, volume = 0.35) {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t);
      osc.stop(t + duration);
    } catch (_) {}
  }

  // Browsers only let an AudioContext start from inside a user gesture. The
  // first sound this app makes is a rep beep, which is not one: on iOS the
  // context is constructed suspended at that moment, resume() outside a gesture
  // does nothing, and every beep of the session is dropped silently — including
  // the rest-over chord, which is the whole point of propping the phone up
  // across the room. Priming from the tap that starts the workout fixes it.
  // Primed even when muted, so switching the bell on mid-set works too.
  prime() { try { this._ensureCtx(); } catch (_) {} }

  playRep()       { this._beep(880,  0.12); }
  playCountdown() { this._beep(660,  0.10); }          // 3-2-1 tick before rest ends
  playRestEnd()   {                                     // triple ascending "GO" chord
    this._beep(660,  0.10, 0.00);
    this._beep(880,  0.10, 0.15);
    this._beep(1100, 0.12, 0.30);
  }
}


// ─── Profile Manager ──────────────────────────────────────────────────────────

class ProfileManager {
  constructor() {
    this.KEY        = 'dc_profiles_v1';
    this.ACTIVE_KEY = 'dc_active_profile';
    this.NS_KEY     = 'dc_profile_ns_v1';
  }

  list()              { try { const v = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(v) ? v : []; } catch { return []; } }
  _saveList(arr)      { localStorage.setItem(this.KEY, JSON.stringify(arr)); }
  getActive()         { return localStorage.getItem(this.ACTIVE_KEY) || null; }
  setActive(name)     { localStorage.setItem(this.ACTIVE_KEY, name); }

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

  // Storage prefix for one profile. It MUST be injective. The original
  // `name.replace(/[^a-zA-Z0-9]/g,'_')` collapsed "Jano K", "Jano-K" and
  // "Jano.K" onto a single prefix, and any two names differing only in their
  // diacritics ("Ivča" / "Ivša") onto another — two people then silently shared
  // one history, one set of plans, one preset list and one weight memory, with
  // nothing in the UI to suggest it.
  //
  // Existing installs must keep the data they already have, so the first
  // profile to claim a legacy prefix keeps it and only a LATER colliding
  // profile is given a distinct one. The claims are recorded in their own key,
  // so the answer is stable across sessions and reloads.
  namespace(name) {
    const key  = String(name);
    const safe = key.replace(/[^a-zA-Z0-9]/g, '_');
    const base = `u_${safe}_`;
    let map;
    try { map = JSON.parse(localStorage.getItem(this.NS_KEY)); } catch { map = null; }
    if (!map || typeof map !== 'object' || Array.isArray(map)) map = {};
    if (typeof map[key] === 'string' && map[key]) return map[key];
    const taken = new Set(Object.values(map));
    const ns    = taken.has(base) ? `u_${safe}_${this._hash(key)}_` : base;
    map[key] = ns;
    try { localStorage.setItem(this.NS_KEY, JSON.stringify(map)); } catch (_) {}
    return ns;
  }

  // FNV-1a, base36. Only needs to separate two names that sanitise the same.
  _hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
}


// ─── Pose Detector (wraps TensorFlow.js MoveNet) ─────────────────────────────

class PoseDetector {
  constructor() {
    this.detector  = null;
    this.ready     = false;
    this.modelType = 'thunder';
    // Subject lock — see _acceptSubject.
    this._subject  = null;
  }

  // Forget who we were watching. Called when a set starts.
  resetSubject() { this._subject = null; }

  // MoveNet SinglePose has no tracking: every frame it independently reports
  // whichever person it finds most prominent. In a gym that means someone
  // walking between the phone and the lifter becomes the pose, their angles run
  // through the counter, and the latch fires on a stranger's stride.
  //
  // The test is frame-to-frame plausibility, not similarity to the original
  // lock: a lifter stepping into a lunge moves their torso a little every
  // frame, while a swap to another body moves it a long way in one. A body
  // centre cannot cross more than about 40% of the frame per second, with a
  // floor of 8% of the frame so ordinary keypoint noise is never rejected.
  //
  // A rejection that persists is not a passerby but a subject who really did
  // move (or a re-detected lifter), so the lock re-acquires after 1.5 s rather
  // than freezing the session.
  _acceptSubject(pose, now, frameWidth) {
    const kp = n => pose._kpMap?.[n] ||
                    (Array.isArray(pose.keypoints) ? pose.keypoints.find(k => k.name === n) : null);
    const torso = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip']
      .map(kp).filter(k => k && k.score >= KP_CONFIDENCE_HARD);
    if (torso.length < 2 || !frameWidth) return true;   // nothing to judge with

    const cx = torso.reduce((s, k) => s + k.x, 0) / torso.length;
    const cy = torso.reduce((s, k) => s + k.y, 0) / torso.length;
    const prev = this._subject;
    if (!prev) { this._subject = { cx, cy, t: now, rejectedSince: 0 }; return true; }

    // The gap is capped: while frames are being rejected the reference pose stops
    // advancing, and an uncapped gap would inflate the allowance until the
    // interloper walked in under it — recovery is the job of the 1.5 s rule
    // below, not of the plausibility test quietly giving up.
    const dt    = Math.min(250, Math.max(1, now - prev.t));
    const limit = Math.max(frameWidth * 0.08, frameWidth * 0.4 * (dt / 1000));
    const moved = Math.hypot(cx - prev.cx, cy - prev.cy);

    if (moved > limit) {
      if (!prev.rejectedSince) prev.rejectedSince = now;
      // Held out for too long — this is the subject, not an interloper.
      if (now - prev.rejectedSince > 1500) {
        this._subject = { cx, cy, t: now, rejectedSince: 0 };
        return true;
      }
      return false;
    }
    this._subject = { cx, cy, t: now, rejectedSince: 0 };
    return true;
  }

  async init(onProgress, modelType = 'thunder') {
    onProgress?.('Načítavam model pohybu…');
    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        // THUNDER has the more accurate joint positions; LIGHTNING is the
        // fallback for a phone that cannot run Thunder fast enough — below
        // roughly 12 fps the counting engine starts losing reps whatever the
        // joint accuracy is, so a rougher model at 25 fps beats a precise one
        // at 9 fps.
        modelType: modelType === 'lightning'
          ? poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
          : poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        enableSmoothing: false, // we do our own EMA smoothing per-exercise
      }
    );
    this.modelType = modelType;
    this.ready     = true;
    onProgress?.('Model pripravený');
  }

  // Swap the model without tearing down the app. Returns false if the swap
  // failed, in which case the previous detector is still in place and usable.
  async switchModel(modelType) {
    if (this.modelType === modelType) return false;
    const previous = this.detector;
    try {
      await this.init(null, modelType);
      previous?.dispose?.();
      return true;
    } catch (err) {
      console.warn('Model switch failed, keeping the current one:', err);
      this.detector = previous;
      this.ready    = !!previous;
      return false;
    }
  }

  async detect(video) {
    if (!this.ready || video.readyState < 2) return null;
    // flipHorizontal MUST stay false: flipping the input image also swaps the
    // model's anatomical labels (the user's real left arm comes back as
    // "right_*"), which corrupts the bilateral chips and imbalance detection.
    // The mirrored selfie look is produced purely in CSS — BOTH #camera-feed
    // and #pose-canvas carry transform: scaleX(-1), so the overlay still lines
    // up while keypoint names stay anatomically correct.
    const poses = await this.detector.estimatePoses(video, {
      flipHorizontal: false,
    });
    if (!poses.length) return null;
    const pose = poses[0];
    // Build O(1) keypoint lookup map — avoids repeated Array.find() per joint per frame
    pose._kpMap = Object.fromEntries(pose.keypoints.map(k => [k.name, k]));
    if (!this._acceptSubject(pose, Date.now(), video.videoWidth || 0)) return null;
    return pose;
  }

  // Raw lookup, no confidence test.
  _rawKp(pose, name) {
    if (!pose) return null;
    if (pose._kpMap) return pose._kpMap[name] || null;
    if (Array.isArray(pose.keypoints)) return pose.keypoints.find(p => p.name === name) || null;
    return pose[name] || null;   // plain-object poses, used by the unit tests
  }

  // Returns a keypoint only if confidence meets the trusted threshold.
  kp(pose, name) {
    const k = this._rawKp(pose, name);
    return k && k.score >= MIN_KEYPOINT_CONFIDENCE ? k : null;
  }

  // Returns a keypoint the model is less sure about but which is still worth
  // measuring — a hip behind a thigh at the bottom of a squat reads 0.3-0.4 and
  // is exactly the joint the rep is being counted from. Callers must treat what
  // comes back from here as uncertain, not as a clean reading.
  kpLoose(pose, name) {
    const k = this._rawKp(pose, name);
    if (!k) return null;
    const joint = String(name).replace(/^(left|right)_/, '');
    const floor = KP_CONFIDENCE_HARD_BY_JOINT[joint] ?? KP_CONFIDENCE_HARD;
    return k.score >= floor ? k : null;
  }

  // activeColor tints the limbs being measured, so the skeleton itself turns
  // from red to green as the rep reaches full range.
  drawSkeleton(canvas, video, pose, exerciseId, activeColor = '#22c55e') {
    // Only resize canvas when native video dimensions actually change — avoids
    // a full canvas clear + repaint on every single frame.
    const nw = video.videoWidth  || canvas.offsetWidth;
    const nh = video.videoHeight || canvas.offsetHeight;
    if (canvas.width !== nw)  canvas.width  = nw;
    if (canvas.height !== nh) canvas.height = nh;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!pose) return;

    const exercise    = EXERCISES.find(e => e.id === exerciseId);
    const activeNames = exercise
      ? ['left', 'right'].flatMap(s => [
          `${s}_${exercise.joints.a}`,
          `${s}_${exercise.joints.b}`,
          `${s}_${exercise.joints.c}`,
        ])
      : [];

    const kpMap = pose._kpMap || {};

    SKELETON.forEach(([na, nb]) => {
      const a = kpMap[na], b = kpMap[nb];
      if (!a || !b || a.score < MIN_KEYPOINT_CONFIDENCE || b.score < MIN_KEYPOINT_CONFIDENCE) return;
      const active = activeNames.includes(na) && activeNames.includes(nb);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = active ? activeColor : 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = active ? 3 : 1.5;
      ctx.stroke();
    });

    pose.keypoints.forEach(k => {
      if (k.score < MIN_KEYPOINT_CONFIDENCE) return;
      const active = activeNames.includes(k.name);
      ctx.beginPath();
      ctx.arc(k.x, k.y, active ? 8 : 4, 0, Math.PI * 2);
      ctx.fillStyle = active ? activeColor : 'rgba(255,255,255,0.55)';
      ctx.fill();
      if (active) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    });
  }
}


// ─── Joint angle ──────────────────────────────────────────────────────────────

// Interior angle a-b-c in the image plane, 0-180. Shared, because the
// calibration run has to measure exactly what the counter measures — a
// calibration taken with a different formula is worse than none.
function jointAngle(a, b, c) {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs(r * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}


// ─── Per-person calibration ───────────────────────────────────────────────────
//
// The bands in config.js are one fixed guess for everybody. A rep that stops
// exactly at peakThreshold counts ZERO by design (the line has to be crossed
// AND held), so anyone who does not lock out to the assumed angle — an older
// joint, a stiff shoulder, a different forearm length, or simply a camera at a
// different angle — got nothing for a whole set while the app told them to go
// higher. That is the single most common complaint about rep counters.
//
// Calibration replaces the fixed band with percentages of the range this person
// actually covers on this exercise. config.js becomes the starting guess it
// always should have been.

// How far through the OBSERVED path a rep must travel before it is credited.
const CALIB_COUNT_FRACTION = 0.70;
// A "range" narrower than this is a tracking failure, not a range of motion.
const CALIB_MIN_SPAN_DEG   = 25;
// How far INTO the observed range the re-arming line sits. Calibrating the
// latch at exactly the observed maximum would demand hitting that exact
// maximum again on every rep, so a set would count once and then stop — the
// calibration would be strictly worse than no calibration. A slice of the
// person's own range is the tolerance.
const CALIB_REST_FRACTION  = 0.15;
// Direction changes needed before a calibration is believed: up-down-up is
// three, i.e. about two honest reps. One pass could be a single lucky frame.
const CALIB_MIN_REVERSALS  = 3;

// Pure, so it is testable on its own. Returns the exercise's own band unchanged
// whenever the calibration is missing or implausible — a bad calibration must
// never be worse than no calibration.
function deriveCountingBand(exercise, calib) {
  const base = exercise.counting;
  if (!calib) return base;
  const rest = Number(calib.rest), peak = Number(calib.peak);
  if (!Number.isFinite(rest) || !Number.isFinite(peak)) return base;
  const span = peak - rest;                      // signed, in the movement's direction
  const inc  = base.direction === 'increase';
  if (Math.abs(span) < CALIB_MIN_SPAN_DEG) return base;
  if (inc ? span < 0 : span > 0) return base;    // calibrated the wrong way round
  const h = base.hysteresis ?? 6;
  return {
    ...base,
    // Placed so that _atRest() fires once the lifter is back within
    // CALIB_REST_FRACTION of their own range — not at the exact angle they
    // happened to reach while calibrating. `h` is added on top because _atRest
    // subtracts it again; without both terms the latch would demand the
    // person beat their own maximum extension to re-arm, and the set would
    // silently cap at one rep.
    restThreshold: Math.round(rest + span * CALIB_REST_FRACTION + (inc ? h : -h)),
    peakThreshold: Math.round(rest + span * CALIB_COUNT_FRACTION),
    idealPeak:     Math.round(peak),
    calibrated:    true,
  };
}


// Watches the raw joint angle while the user demonstrates their own range. It
// deliberately ignores the counting band — the whole point is that the band is
// what we do not trust yet. Both sides are tracked independently and the wider
// one wins, so a one-arm movement calibrates from the arm that worked.
class CalibrationRun {
  constructor(exerciseId) {
    this.exercise = EXERCISES.find(e => e.id === exerciseId);
    this.reset();
  }

  reset() {
    this._sides  = { left: this._blank(), right: this._blank() };
    this.samples = 0;
    this.seen    = 0;      // frames on which at least one side was measurable
  }

  _blank() { return { min: null, max: null, reversals: 0, dir: 0, last: null }; }

  update(pose, detector) {
    this.samples++;
    if (!this.exercise) return this.status();
    const { a, b, c } = this.exercise.joints;
    const pick = (side, joint) => detector.kp(pose, `${side}_${joint}`)
                              || (detector.kpLoose ? detector.kpLoose(pose, `${side}_${joint}`) : null);
    let any = false;
    for (const side of ['left', 'right']) {
      const pa = pick(side, a), pb = pick(side, b), pc = pick(side, c);
      if (!pa || !pb || !pc) continue;
      any = true;
      const ang = jointAngle(pa, pb, pc);
      const s   = this._sides[side];
      s.min = s.min === null ? ang : Math.min(s.min, ang);
      s.max = s.max === null ? ang : Math.max(s.max, ang);
      if (s.last !== null) {
        const d = ang - s.last;
        // 2 degrees of deadband: keypoint jitter alone must not read as a
        // direction change, or a motionless limb "reverses" every frame.
        if (Math.abs(d) > 2) {
          const dir = d > 0 ? 1 : -1;
          if (s.dir && dir !== s.dir) s.reversals++;
          s.dir = dir;
        }
      }
      s.last = ang;
    }
    if (any) this.seen++;
    return this.status();
  }

  _best() {
    const span = s => (s.min === null ? -1 : s.max - s.min);
    return span(this._sides.left) >= span(this._sides.right)
      ? { ...this._sides.left,  side: 'left'  }
      : { ...this._sides.right, side: 'right' };
  }

  status() {
    const b    = this._best();
    const span = b.min === null ? 0 : b.max - b.min;
    return {
      side:      b.side,
      min:       b.min === null ? null : Math.round(b.min),
      max:       b.max === null ? null : Math.round(b.max),
      span:      Math.round(span),
      reversals: b.reversals,
      reps:      Math.floor((b.reversals + 1) / 2),
      // True once there is enough movement to derive a band from.
      ready:     span >= CALIB_MIN_SPAN_DEG && b.reversals >= CALIB_MIN_REVERSALS,
      // Distinguishes "you are not in frame" from "you have not moved yet".
      visible:   this.seen > 0,
    };
  }

  // rest/peak stated in the movement's own direction, ready for
  // deriveCountingBand. Null until the run is believable.
  result() {
    const st = this.status();
    if (!st.ready || !this.exercise) return null;
    return this.exercise.counting.direction === 'increase'
      ? { rest: st.min, peak: st.max }
      : { rest: st.max, peak: st.min };
  }
}


// ─── Framing check ────────────────────────────────────────────────────────────
//
// Every exercise states the view it needs, and nothing used to verify it. A
// turned torso skews the measured angle systematically and the app said
// nothing — it just counted less and told the user to go higher. The test is
// cheap: shoulder width against torso height separates a body seen from the
// front from one seen from the side.
const VIEW_RATIO_FRONTAL  = 0.55;   // shoulders this wide relative to the torso = facing us
const VIEW_RATIO_SAGITTAL = 0.30;   // this narrow = side on
const VIEW_NAMES = { frontal: 'čelný pohľad', sagittal: 'bočný pohľad' };
const JOINT_NAMES = { shoulder: 'rameno', elbow: 'lakeť', wrist: 'zápästie',
                      hip: 'bedro', knee: 'koleno', ankle: 'členok' };

// Which way the camera is looking at this body, or null when it cannot tell.
function assessView(pose, detector) {
  const ls = detector.kp(pose, 'left_shoulder'), rs = detector.kp(pose, 'right_shoulder');
  const lh = detector.kp(pose, 'left_hip'),      rh = detector.kp(pose, 'right_hip');
  if (!ls || !rs || !lh || !rh) return null;
  const shoulderW = Math.abs(ls.x - rs.x);
  const torsoH    = Math.abs((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
  if (torsoH < 1) return null;
  const ratio = shoulderW / torsoH;
  if (ratio >= VIEW_RATIO_FRONTAL)  return 'frontal';
  if (ratio <= VIEW_RATIO_SAGITTAL) return 'sagittal';
  return 'oblique';
}

// One sentence about what is wrong with the shot, or null when nothing is.
// Ordered by what actually stops the count: joints first, then the view, then
// the light. Frame rate is added by the caller, which is the only place that
// knows it.
function assessFraming(pose, exercise, detector) {
  if (!exercise || !pose) return null;
  const { a, b, c } = exercise.joints;
  const need = [a, b, c];
  const pick = (side, j) => detector.kp(pose, `${side}_${j}`)
                         || (detector.kpLoose ? detector.kpLoose(pose, `${side}_${j}`) : null);
  const sides = { left:  need.map(j => pick('left',  j)),
                  right: need.map(j => pick('right', j)) };
  const ok = side => sides[side].every(Boolean);

  if (!ok('left') && !ok('right')) {
    const idx  = need.findIndex((_, i) => !sides.left[i] && !sides.right[i]);
    const name = JOINT_NAMES[need[idx < 0 ? 0 : idx]] || need[0];
    return { issue: 'joints', message: `Nevidím ${name} — uprav výšku alebo uhol kamery` };
  }

  const want = exercise.view || 'any';
  if (want !== 'any') {
    const got = assessView(pose, detector);
    // 'oblique' is genuinely ambiguous, and nagging about an ambiguous reading
    // is worse than saying nothing.
    if (got && got !== 'oblique' && got !== want) {
      return { issue: 'view',
               message: `Tento cvik potrebuje ${VIEW_NAMES[want]} — otoč sa alebo presuň kameru` };
    }
  }

  const pts = (ok('left') ? sides.left : sides.right);
  const avg = pts.reduce((s, k) => s + k.score, 0) / pts.length;
  if (avg < MIN_KEYPOINT_CONFIDENCE) {
    return { issue: 'light', message: 'Slabé sledovanie — pridaj svetlo alebo sa priblíž ku kamere' };
  }
  return null;
}


// ─── Rep Counter ──────────────────────────────────────────────────────────────
//
// Counting model
// ──────────────
// Each exercise defines a band of joint angles in config.js:
//
//   restThreshold ──── peakThreshold ──── idealPeak
//   (must return here) (rep counts here) (full range / fully green)
//
// The counter is a two-state latch that lives on the COUNTER, not on each side:
//
//   armed = false  →  waiting for the user to return past restThreshold
//   armed = true   →  the next crossing of peakThreshold counts one rep
//
// This is what makes a hold safe. Pressing a bench press to lockout and
// holding it there for thirty seconds crosses peakThreshold once and then
// never goes anywhere near restThreshold, so `armed` stays false and the rep
// count cannot move. Angle jitter at the top cannot re-arm it either, because
// re-arming demands crossing restThreshold by a further `hysteresis` degrees.
//
// The per-side state machines still run, but only to report angles and
// range-of-motion for the live form feedback — they never touch this.reps.

class RepCounter {
  // `calibration` is {rest, peak} measured from this person on this exercise —
  // see deriveCountingBand. Null means fall back to the config band, which is
  // one fixed guess for everybody.
  constructor(exerciseId, calibration = null) {
    this.exercise = EXERCISES.find(e => e.id === exerciseId);
    if (!this.exercise) {
      // Graceful fallback: unknown exercise won't count reps but won't throw
      console.warn(`RepCounter: unknown exerciseId "${exerciseId}"`);
    }
    this.exerciseId  = exerciseId;
    this.calibration = calibration || null;
    // Every threshold in this class reads from here, never from config
    // directly, so a calibrated band is honoured everywhere at once.
    this.counting    = this.exercise ? deriveCountingBand(this.exercise, calibration) : null;
    this.reset();
  }

  get calibrated() { return !!(this.counting && this.counting.calibrated); }

  reset() {
    this.reps         = 0;
    this.angle        = 0;
    this._lastRepTime = 0;

    // Wall-clock of the previous frame. Every rate in this class is derived
    // from it, so the engine behaves the same on a 60 fps phone and a 10 fps
    // one instead of silently changing its own thresholds.
    this._lastFrameTime  = 0;
    this._frameMs        = DEFAULT_FRAME_MS;
    this._lastSeenTime   = 0;   // last frame on which any side was measurable

    // Counter-level latch — see the header comment. Starts false and can only
    // be armed by actually being observed at rest, so starting a set already
    // at the top of the movement never fires a phantom rep.
    this._armed          = false;
    // Which side credited the rep that is currently in flight — counted, but
    // not yet returned to rest. Only that side may close the cycle; see the
    // arming rule in update().
    this._repSide        = null;
    // Set when the lift actually starts moving, not when the rest position is
    // reached — otherwise resting at the bottom for a few seconds before a
    // clean rep gets scored as a fast, sloppy rep.
    this._repMoveStart   = 0;
    this._lastRepTooFast = false;
    this._lastRepRom     = 0;

    // Per-side tracking, for angles + range-of-motion feedback only
    this._left  = this._blankSide();
    this._right = this._blankSide();

    // Rolling ROM history per side, used for the imbalance warning
    this._romLeft  = [];
    this._romRight = [];
    // Which sides banked a sample for each completed rep, so undo can take back
    // exactly what that rep put in.
    this._repRomSides = [];
  }

  _blankSide() {
    return {
      ema: null, angle: 0, raw: 0,
      prevRaw: null,      // previous frame's raw angle, for the motion estimate
      motion: 0,          // decaying deg/SECOND — how hard this limb is working
      progress: 0,        // smoothed — drives the gauge, so it must not jitter
      rawProgress: 0,     // unsmoothed — drives counting and ROM scoring
      peakProgress: 0,
      // Threshold confirmation is time-based. `*Since` is the moment the joint
      // crossed the line (the previous frame, not the first frame seen past
      // it); `*Confirmed` is the verdict this frame.
      peakSince: 0, restSince: 0,
      peakSamples: 0, restSamples: 0,
      peakConfirmed: false, restConfirmed: false,
      // Consecutive frames of real travel toward the peak / back to rest. This
      // is what stands in for the old frame count when the phone is so slow
      // that a single frame already spans the confirmation window.
      towardPeak: 0, towardRest: 0,
      lastProgress: null,
      // Last frame on which all three joints were seen, kept so a joint that
      // blinks out can be bridged instead of dropping the whole side.
      lastPts: null, lastPtsTime: 0, lastOkTime: 0,
      uncertain: false,
      detected: false,
    };
  }

  // Manual rep — tap-to-count fallback when camera detection is unreliable
  manualRep() {
    this._lastRepTime    = Date.now();
    this._lastRepTooFast = false;
    this._lastRepRom     = 1;
    this.reps++;
    // A tapped rep banks no ROM sample, so undo must not take one back.
    this._repRomSides.push({ left: false, right: false });
    if (this._repRomSides.length > ROM_HISTORY_LEN) this._repRomSides.shift();
    // A tapped rep also disarms the latch, so the camera cannot immediately
    // count the same physical rep a second time. It belongs to no side, so any
    // side may close it — a tap is often used precisely because the camera
    // cannot see the working limb.
    this._armed   = false;
    this._repSide = null;
    return this._payload({
      counted:   true,
      quality:   'manual',
      coach:     'Opakovanie pripočítané ručne',
      coachTone: 'neutral',
    });
  }

  // Undo last rep — corrects miscounts; never goes below 0
  undoRep() {
    if (this.reps <= 0) {
      return this._payload({ counted: false, quality: 'manual', coach: 'Niet čo odobrať', coachTone: 'neutral' });
    }
    this.reps--;
    // Drop the matching ROM samples so the imbalance warning stays honest.
    // Guarded: popping on an already-empty counter used to silently discard a
    // previous rep's range-of-motion sample. Only the sides that actually
    // banked a sample for the rep being undone are popped — update() pushes per
    // side, conditional on that side being detected, so popping both
    // unconditionally used to shift the two histories out of step with each
    // other and make the imbalance warning point at the wrong arm.
    const banked = this._repRomSides.pop();
    if (!banked || banked.left)  this._romLeft.pop();
    if (!banked || banked.right) this._romRight.pop();
    return this._payload({
      counted:   false,
      quality:   'manual',
      coach:     'Opakovanie odobraté',
      coachTone: 'neutral',
    });
  }

  _calcAngle(a, b, c) { return jointAngle(a, b, c); }

  // Time-constant smoothing. The weight is derived from how long the frame
  // actually took, so the amount of lag is a fixed number of milliseconds
  // rather than a fixed number of frames.
  _ema(newVal, prevVal, dt) {
    if (prevVal === null) return newVal;
    const a = 1 - Math.exp(-dt / EMA_TAU_MS);
    return a * newVal + (1 - a) * prevVal;
  }

  // Decides whether a threshold crossing is real yet.
  //
  //   fast phone  → the crossing must hold CONFIRM_MS, which at 30 fps is the
  //                 same two frames the old frame counter demanded, and at
  //                 60 fps is twice as many — noise rejection improves with
  //                 frame rate instead of the counting line moving.
  //   slow phone  → one frame already spans CONFIRM_MS, so the crossing is
  //                 accepted on that frame, provided the joint was genuinely
  //                 travelling that way over the previous frames. Without this
  //                 branch the joint had to overshoot the threshold by
  //                 2 x (speed / fps) degrees — up to 9 degrees at 10 fps,
  //                 which is most of the band between the counting line and
  //                 full range, and is why slow phones counted 1 rep in 5.
  _confirm(sd, kind, isThere, now, dt) {
    const sinceKey   = kind === 'peak' ? 'peakSince'   : 'restSince';
    const travelKey  = kind === 'peak' ? 'towardPeak'  : 'towardRest';
    const samplesKey = kind === 'peak' ? 'peakSamples' : 'restSamples';
    if (!isThere) { sd[sinceKey] = 0; sd[samplesKey] = 0; return false; }
    // Date the crossing to the previous frame — that is when it happened.
    if (sd[sinceKey] === 0) { sd[sinceKey] = now - dt; sd[samplesKey] = 0; }
    sd[samplesKey]++;
    if ((now - sd[sinceKey]) < CONFIRM_MS) return false;
    // Fast phone: the dwell already spans several frames, so it is its own
    // noise filter.
    if (dt < CONFIRM_MS) return true;
    // Slow phone: one frame spans the whole window, so believe it either
    // because the joint was travelling that way (a real crossing mid-rep) or
    // because it has now been sitting there for a second frame (a joint parked
    // at rest, which is how the counter arms itself before the first rep — the
    // travel test alone left it disarmed through the whole opening rep).
    return sd[travelKey] >= 1 || sd[samplesKey] >= 2;
  }

  // Measures one side. Reports where the joint sits inside the exercise's own
  // band — it does NOT count anything.
  _tickSide(sideData, pose, detector, sideName, now, dt) {
    sideData.detected  = false;
    sideData.uncertain = false;
    if (!this.exercise) return sideData;

    const { a, b, c } = this.exercise.joints;
    const pts = this._resolveJoints(sideData, pose, detector, sideName, a, b, c, now);
    if (!pts) {
      // Nothing measurable this frame. FREEZE the crossing state — do not clear
      // it. A wrist that blinks out for a frame or two mid-rep is ordinary, and
      // clearing here throws away a crossing that was already under way: with a
      // dropout every third frame this cost four reps out of five. Only once
      // the side has been gone longer than the bridging window is the state
      // abandoned, so a crossing cannot be confirmed across a real absence.
      if (sideData.lastOkTime && (now - sideData.lastOkTime) > KP_STALE_MAX_MS) {
        sideData.peakSince     = 0;
        sideData.restSince     = 0;
        sideData.peakConfirmed = false;
        sideData.restConfirmed = false;
        sideData.towardPeak    = 0;
        sideData.towardRest    = 0;
      }
      return sideData;
    }
    const [pa, pb, pc] = pts.joints;
    sideData.uncertain = pts.uncertain;

    const raw = this._calcAngle(pa, pb, pc);
    // A joint cannot swing two full turns a second. A frame that claims it did
    // is the model putting a keypoint on the wrong limb, and on a slow phone a
    // single such frame is enough to confirm a crossing all by itself. Measure
    // it for the display, but never let it move the latch.
    const outlier = sideData.prevRaw !== null && dt > 0 &&
                    (Math.abs(raw - sideData.prevRaw) / dt) * 1000 > MAX_JOINT_DPS;
    // Joint speed in degrees per second. A limb holding a brace position reads
    // ~0 no matter how confidently the model sees it, which is what lets the
    // counter ignore it — and it now means the same thing at any frame rate.
    const delta      = sideData.prevRaw === null ? 0 : Math.abs(raw - sideData.prevRaw);
    const dps        = dt > 0 ? (delta / dt) * 1000 : 0;
    const decay      = Math.exp(-dt / MOTION_TAU_MS);
    sideData.prevRaw = raw;
    sideData.motion  = decay * sideData.motion + (1 - decay) * dps;
    sideData.raw     = raw;
    sideData.ema     = this._ema(raw, sideData.ema, dt);
    sideData.angle   = Math.round(sideData.ema);

    const cfg  = this.counting;
    const span = cfg.idealPeak - cfg.restThreshold;   // signed: +ve for 'increase'
    // 0 = at rest, 1 = at the full-range ideal. Clamped, so a rep that goes
    // past the ideal reads as a clean 1 rather than overflowing the gauge.
    const norm = v => span === 0 ? 0 : Math.max(0, Math.min(1, (v - cfg.restThreshold) / span));
    sideData.progress    = norm(sideData.ema);   // smooth, for the gauge
    sideData.rawProgress = norm(raw);            // honest, for counting + scoring

    // Range of motion is scored on the RAW angle. Scoring it on the smoothed
    // one under-reports how far the user actually travelled — an EMA trailing a
    // 1.4s rep lags by around 7 degrees, which is enough to mark a genuinely
    // full rep as shallow, and enough to miss the counting line entirely.
    sideData.peakProgress = Math.max(sideData.peakProgress, sideData.rawProgress);

    // Direction of travel, used to believe a crossing on a slow phone.
    if (sideData.lastProgress !== null) {
      const d = sideData.rawProgress - sideData.lastProgress;
      if      (d >  PROGRESS_EPS) { sideData.towardPeak++; sideData.towardRest = 0; }
      else if (d < -PROGRESS_EPS) { sideData.towardRest++; sideData.towardPeak = 0; }
    }
    sideData.lastProgress = sideData.rawProgress;

    // Threshold crossings are judged on the raw angle — see above — and then
    // confirmed over a span of TIME, not a count of frames.
    if (outlier) {
      sideData.peakConfirmed = false;
      sideData.restConfirmed = false;
    } else {
      sideData.peakConfirmed = this._confirm(sideData, 'peak', this._atPeak(raw), now, dt);
      sideData.restConfirmed = this._confirm(sideData, 'rest', this._atRest(raw), now, dt);
    }

    sideData.confidence = (pa.score + pb.score + pc.score) / 3;
    sideData.detected   = true;
    sideData.lastOkTime = now;
    return sideData;
  }

  // Finds the three joints of the measured angle, in three descending tiers:
  // trusted, low-confidence-but-usable, and — for the two proximal joints only
  // — the last known position, for up to KP_STALE_MAX_MS.
  //
  // The point of the tiers: a hip disappearing behind a thigh at the bottom of
  // a squat used to void the entire side, and with both sides voided the app
  // counted nothing and told the user to step back. Measured on this codebase,
  // a hip score of 0.55 counted five reps out of five and 0.49 counted zero.
  //
  // The DISTAL joint (c) is never substituted from history. It is the end that
  // travels, so a stale copy of it would fabricate a held position and, with
  // it, phantom reps.
  _resolveJoints(sideData, pose, detector, sideName, a, b, c, now) {
    const loose = (name) => (detector.kpLoose ? detector.kpLoose(pose, name) : null);
    let uncertain = false;

    const pick = (name) => {
      const trusted = detector.kp(pose, name);
      if (trusted) return trusted;
      const weak = loose(name);
      if (weak) { uncertain = true; return weak; }
      return null;
    };

    let pa = pick(`${sideName}_${a}`);
    let pb = pick(`${sideName}_${b}`);
    const pc = pick(`${sideName}_${c}`);

    if (!pc) return null;   // the travelling end must be seen for real

    const fresh = sideData.lastPts && (now - sideData.lastPtsTime) <= KP_STALE_MAX_MS;
    if (!pa && fresh) { pa = sideData.lastPts.a; uncertain = true; }
    if (!pb && fresh) { pb = sideData.lastPts.b; uncertain = true; }
    if (!pa || !pb) return null;

    if (!uncertain) {
      sideData.lastPts     = { a: pa, b: pb, c: pc };
      sideData.lastPtsTime = now;
    }
    return { joints: [pa, pb, pc], uncertain };
  }

  // True when the angle has crossed peakThreshold in the movement's direction.
  // Takes the RAW angle — see _tickSide for why smoothing is not used here.
  _atPeak(angle) {
    const cfg = this.counting;
    return cfg.direction === 'increase' ? angle >= cfg.peakThreshold : angle <= cfg.peakThreshold;
  }

  // True when the angle has come back past restThreshold, plus hysteresis.
  // The extra margin is what stops jitter from re-arming a held position.
  _atRest(angle) {
    const cfg = this.counting;
    const h   = cfg.hysteresis ?? 6;
    return cfg.direction === 'increase' ? angle <= cfg.restThreshold - h
                                        : angle >= cfg.restThreshold + h;
  }

  // Where peakThreshold falls on the 0-1 progress scale — i.e. how much of the
  // ideal range you must cover before the rep is credited at all.
  _countProgress() {
    const cfg  = this.counting;
    const span = cfg.idealPeak - cfg.restThreshold;
    return span === 0 ? 1 : Math.max(0, Math.min(1, (cfg.peakThreshold - cfg.restThreshold) / span));
  }

  _sideRom(history, sideData) {
    if (!sideData.detected && !history.length) return null;
    const avg = this._romAvg(history);
    return avg === null ? sideData.peakProgress : avg;
  }

  _romAvg(arr) {
    if (!arr.length) return null;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  // Range-of-motion imbalance. Compares how far each side actually travels,
  // not how many reps each side "scored" — a lagging arm that still moves on
  // every rep used to be invisible, and a side that merely lost tracking for a
  // moment used to be reported as lagging forever.
  _imbalance() {
    // On a single-arm movement the idle side never travels, so comparing the two
    // would report it as "lagging" on every single rep. There is nothing to
    // compare, so nothing is claimed.
    if (this.exercise?.unilateral) return null;
    const l = this._romAvg(this._romLeft);
    const r = this._romAvg(this._romRight);
    if (l === null || r === null) return null;
    if (this._romLeft.length < 2 || this._romRight.length < 2) return null;
    if (Math.abs(l - r) < ROM_IMBALANCE_GAP) return null;
    return l < r ? 'left' : 'right';   // the shallower side is the lagging one
  }

  _payload(extra) {
    if (extra && extra.formComplete) extra = { ...extra, cycle: 1 };
    const cycle = this._armed
      ? 0.5 * (this._activeProgress ?? 0)                 // lifting  →  0 to 50%
      : 0.5 + 0.5 * (1 - (this._activeProgress ?? 0));    // returning → 50 to 100%
    return {
      reps:         this.reps,
      angle:        this.angle,
      counted:      false,
      quality:      'none',
      leftAngle:    this._left.detected  ? this._left.angle  : null,
      rightAngle:   this._right.detected ? this._right.angle : null,
      activeSide:   this._activeSide ?? null,
      imbalance:    this._imbalance(),
      // Per-side range of motion as a fraction of this exercise's ideal.
      // Prefers the rolling average over completed reps; before any rep has
      // closed it shows how far the side has travelled so far this rep.
      leftRom:      this._sideRom(this._romLeft,  this._left),
      rightRom:     this._sideRom(this._romRight, this._right),
      progress:     this._activeProgress ?? 0,
      cycle:        Math.max(0, Math.min(1, cycle)),
      phase:        this._armed ? 'lifting' : 'returning',
      fullRange:    this._lastRepRom >= SHALLOW_REP_PROGRESS,
      tooFast:      this._lastRepTooFast,
      formComplete: false,
      coach:        '',
      coachTone:    'neutral',
      ...extra,
    };
  }

  update(pose, detector) {
    if (!this.exercise) return this._payload({ coach: 'Neznámy cvik — použi ručné počítadlo' });

    // Frame interval drives every rate in the engine. The first frame has no
    // predecessor, and a gap (backgrounded tab, stalled camera) is capped so it
    // cannot be read as one enormous movement.
    const now = Date.now();
    const dt  = this._lastFrameTime
      ? Math.min(MAX_FRAME_MS, Math.max(1, now - this._lastFrameTime))
      : DEFAULT_FRAME_MS;
    this._lastFrameTime = now;
    this._frameMs       = dt;

    const L = this._tickSide(this._left,  pose, detector, 'left',  now, dt);
    const R = this._tickSide(this._right, pose, detector, 'right', now, dt);

    if (!L.detected && !R.detected) {
      this._activeSide     = null;
      this._activeProgress = 0;
      // Distinguish "you were here a moment ago" from "you were never in
      // frame". The first is a joint being covered or a bad inference and the
      // fix is to move the camera; the second is framing, and telling someone
      // to step back when their hip is simply hidden behind their own thigh
      // sends them further away from the fix.
      const lostRecently = this._lastSeenTime && (now - this._lastSeenTime) < 1500;
      return this._payload({
        quality:   'none',
        coach:     lostRecently
          ? 'Stratil som kĺb — otoč sa bokom ku kamere alebo uprav jej výšku'
          : 'Nevidím kĺby — odstúp, nech si celý v zábere',
        coachTone: 'bad',
      });
    }
    this._lastSeenTime = now;

    // Active side = the side actually performing the rep, i.e. the one that has
    // travelled furthest through this exercise's range. Confidence only breaks a
    // near-tie, when the two sides are genuinely moving together.
    //
    // Picking purely on confidence — which this used to do — silently broke every
    // single-arm movement: if the camera happened to see the IDLE arm better, the
    // counter watched an arm that never moves and credited nothing for the entire
    // set, while the coach told the user to "curl higher". The same failure hit
    // anyone with a left/right strength difference whose weaker arm was the
    // better-lit one, and the imbalance warning could not explain it because that
    // warning only arms itself after a rep has been counted.
    let activeSide;
    if (L.detected && R.detected) {
      const lm = L.motion > MOTION_FLOOR_DPS;
      const rm = R.motion > MOTION_FLOOR_DPS;
      if (lm !== rm) {
        // Exactly one limb is moving — that is the one doing the exercise, and
        // no amount of confidence in the other one should override it.
        activeSide = lm ? 'left' : 'right';
      } else if (!lm && !rm && L.restConfirmed !== R.restConfirmed) {
        // Nothing is moving yet and exactly one limb is sitting in the start
        // position: that is the one about to do the work, and the other is a
        // brace parked mid-range. Without this the lead comparison below hands
        // the counter to the braced arm of a row — it is further through the
        // range by definition — and the latch cannot arm, so the opening rep of
        // the set is lost. It only showed up on slow phones, where the set
        // begins before the first movement frame arrives.
        activeSide = L.restConfirmed ? 'left' : 'right';
      } else {
        // Both working (or both still): the side further through the range leads.
        // peakProgress holds that lead through the return phase, so the choice
        // stays stable for the whole rep instead of flickering at the turnaround.
        const lead = s => Math.max(s.peakProgress, s.rawProgress);
        const dl = lead(L), dr = lead(R);
        activeSide = Math.abs(dl - dr) > SIDE_LEAD_MARGIN
          ? (dl > dr ? 'left' : 'right')
          : (L.confidence >= R.confidence ? 'left' : 'right');
      }
    } else {
      activeSide = L.detected ? 'left' : 'right';
    }
    const act = activeSide === 'left' ? L : R;

    this._activeSide     = activeSide;
    this._activeProgress = act.progress;
    this.angle           = act.angle;

    const cfg        = this.counting;
    const cooldownOk = (now - this._lastRepTime) > REP_COOLDOWN_MS;

    let counted      = false;
    let formComplete = false;

    // ── Rep credited on the way up ──────────────────────────────────────────
    // Start the tempo clock on the first frame of real movement
    if (this._armed && this._repMoveStart === 0 && act.rawProgress > 0.1) {
      this._repMoveStart = now;
    }

    if (this._armed && act.peakConfirmed && cooldownOk) {
      this._armed          = false;
      this._lastRepTime    = now;
      this._lastRepTooFast = this._repMoveStart > 0 &&
                             (now - this._repMoveStart) < (cfg.minRepMs ?? 800);
      this._repSide        = activeSide;
      this.reps++;
      counted = true;
    }

    // ── Rep cycle closed on the way back down ───────────────────────────────
    // This is also the only way to arm the next rep, which is what makes a
    // held position count exactly once.
    // Which side is allowed to close the cycle. It must be the side that
    // credited the rep, not simply whichever side this frame picked as active.
    // On a one-arm movement the idle limb hangs inside the rest band, so the
    // moment the working arm pauses at the top its motion decays, the
    // start-position tie-break above hands `activeSide` to the idle limb, and
    // that limb's permanently-true restConfirmed re-arms the latch while the
    // weight is still locked out. The next frame of movement then credits a
    // second rep from a peak the arm never left: measured at 6 counted for 3
    // performed on every curl held about a second at the top. Falling back to
    // `act` when the rep side is not visible keeps a dropout from freezing the
    // set instead of merely refusing the phantom.
    const repSideData = this._repSide === 'left' ? L : this._repSide === 'right' ? R : null;
    const armSide     = repSideData && repSideData.detected ? repSideData : act;

    if (!this._armed && armSide.restConfirmed) {
      this._armed        = true;
      this._repMoveStart = 0;
      this._repSide      = null;
      formComplete       = this.reps > 0;

      if (formComplete) {
        // Bank how far each side travelled during the rep just finished
        this._lastRepRom = armSide.peakProgress;
        if (L.detected) this._romLeft.push(L.peakProgress);
        if (R.detected) this._romRight.push(R.peakProgress);
        this._repRomSides.push({ left: L.detected, right: R.detected });
        if (this._romLeft.length  > ROM_HISTORY_LEN) this._romLeft.shift();
        if (this._romRight.length > ROM_HISTORY_LEN) this._romRight.shift();
        if (this._repRomSides.length > ROM_HISTORY_LEN) this._repRomSides.shift();
      }
      this._left.peakProgress  = 0;
      this._right.peakProgress = 0;
    }

    const conf    = act.confidence;
    // A reading that leaned on a low-confidence or bridged keypoint is still
    // worth counting, but it must never be reported as a clean one.
    const quality = act.uncertain
      ? (conf > 0.4 ? 'fair' : 'poor')
      : (conf > 0.7 ? 'good' : conf > 0.5 ? 'fair' : 'poor');
    const coach   = this._coach({ act, L, R, quality, counted, formComplete });

    return this._payload({ counted, quality, formComplete, ...coach });
  }

  // Picks the single most useful sentence to put in front of the user right
  // now. Ordered by urgency: tracking problems first, then form, then tempo.
  _coach({ act, L, R, quality, counted, formComplete }) {
    const cfg    = this.counting;
    const cues   = this.exercise.cues || {};
    const countP = this._countProgress();

    if (quality === 'poor') {
      return {
        coach: act.uncertain
          ? 'Kĺb je zakrytý — uprav uhol kamery alebo si vyhrň oblečenie'
          : 'Slabé sledovanie — pridaj svetlo alebo sa posuň do záberu',
        coachTone: 'bad',
      };
    }

    // Credited, but NOT yet judged. At this instant the user has only just
    // crossed the counting line — they are still travelling toward their real
    // peak, so scoring range of motion here marks every honest full rep as
    // shallow. Tempo is already known, so that one can be said immediately.
    if (counted) {
      if (this._lastRepTooFast) {
        return { coach: `Opakovanie ${this.reps} — príliš rýchlo, kontroluj váhu`, coachTone: 'warn' };
      }
      return { coach: `Opakovanie ${this.reps} ✓`, coachTone: 'good' };
    }

    // Cycle closed — the peak actually reached is now known, so this is where
    // the range-of-motion verdict belongs.
    if (formComplete) {
      if (this._lastRepRom >= SHALLOW_REP_PROGRESS) {
        return { coach: `Opakovanie ${this.reps} — plný rozsah 💪`, coachTone: 'good' };
      }
      const pct = Math.round(this._lastRepRom * 100);
      return {
        coach:     `Opakovanie ${this.reps} — len ${pct} % rozsahu · ${cues.concentric || 'choď ďalej'}`,
        coachTone: 'warn',
      };
    }

    // Lifting phase: not yet armed enough to score
    if (this._armed) {
      if (act.rawProgress >= SHALLOW_REP_PROGRESS) {
        return { coach: 'Plný rozsah — teraz sa vráť kontrolovane', coachTone: 'good' };
      }
      if (act.rawProgress >= countP) {
        // Past the counting line but short of the ideal — this is exactly the
        // half-rep the user wants flagged.
        const gap = Math.round(Math.abs(cfg.idealPeak - act.raw));
        return { coach: `${cues.concentric || 'Choď ďalej'} — ešte ${gap}°`, coachTone: 'warn' };
      }
      if (act.rawProgress > 0.08) {
        return { coach: cues.concentric || 'Pokračuj', coachTone: 'neutral' };
      }
      return { coach: 'Pripravené — začni opakovanie', coachTone: 'neutral' };
    }

    // Returning phase: the rep is credited but the cycle isn't closed yet.
    // Until they get back past restThreshold the next rep will NOT count, so
    // say so plainly rather than letting them wonder why nothing moves.
    if (act.progress > 0.35) {
      return { coach: cues.eccentric || 'Vráť sa do východiskovej polohy', coachTone: 'warn' };
    }
    return { coach: `Skoro — ${cues.eccentric || 'vráť sa úplne'}`, coachTone: 'neutral' };
  }
}


// ─── Workout History Manager ──────────────────────────────────────────────────

class WorkoutHistory {
  constructor()      { this.KEY = 'dc_history_v1'; }
  setNamespace(ns)   { this.KEY = ns ? `dc_${ns}history_v1` : 'dc_history_v1'; }
  // Anything that is not an array (a corrupted or hand-edited key) is treated
  // as empty rather than being handed to callers that will iterate it.
  _load()            { try { const v = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(v) ? v : []; } catch { return []; } }
  _save(arr)         { try { localStorage.setItem(this.KEY, JSON.stringify(arr)); } catch (_) {} }
  list()             { return this._load(); }
  clear()            { try { localStorage.removeItem(this.KEY); } catch (_) {} }

  // Returns the stored record — callers need the assigned id and date to
  // export the session that was just saved.
  add(entry) {
    const history = this._load();
    // Date.now() alone is not unique: two sessions saved inside the same
    // millisecond share an id, and delete(id) then removes both of them.
    let id = Date.now();
    while (history.some(e => e && e.id === id)) id++;
    const stored  = { ...entry, id, date: Date.now() };
    history.unshift(stored);
    if (history.length > 150) history.pop(); // cap at 150 sessions
    this._save(history);
    return stored;
  }

  delete(id) {
    this._save(this._load().filter(e => e.id !== id));
  }
}


// ─── Workout Preset Manager ───────────────────────────────────────────────────

class WorkoutManager {
  constructor()     { this.KEY = 'dc_presets_v1'; }
  setNamespace(ns)  { this.KEY = ns ? `dc_${ns}presets_v1` : 'dc_presets_v1'; }
  _load()           { try { const v = JSON.parse(localStorage.getItem(this.KEY)); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch { return {}; } }
  _save(data)       { try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (_) {} }
  list()            { return Object.keys(this._load()); }
  get(name)         { return this._load()[name] || null; }

  save(name, { exerciseId, sets, reps, restBetweenSets }) {
    if (!name.trim()) return false;
    const data = this._load();
    data[name.trim()] = { exerciseId, sets, reps, restBetweenSets, savedAt: Date.now() };
    this._save(data);
    return true;
  }

  // Presets drive the same state machine plans do, so they get the same
  // treatment on the way out. A preset naming an exercise that no longer
  // exists — or carrying a non-numeric count from an older build or a
  // hand-edited key — used to reach the setup screen intact, blank the
  // exercise picker, and start a workout whose RepCounter had no exercise and
  // therefore could not count a single rep.
  getSanitised(name) {
    const p = this.get(name);
    if (!p || !EXERCISES.some(e => e.id === p.exerciseId)) return null;
    const clamp = (v, lo, hi, dflt) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
    };
    return {
      exerciseId:      p.exerciseId,
      sets:            clamp(p.sets, 1, 20, 3),
      reps:            clamp(p.reps, 1, 50, 12),
      restBetweenSets: clamp(p.restBetweenSets, 0, 300, DEFAULT_REST_BETWEEN_SETS),
    };
  }

  delete(name) {
    const data = this._load();
    delete data[name];
    this._save(data);
  }
}


// ─── Weight Memory ────────────────────────────────────────────────────────────

class WeightMemory {
  constructor()    { this.KEY = 'dc_weight_memory_v1'; }
  setNamespace(ns) { this.KEY = ns ? `dc_${ns}weight_memory_v1` : 'dc_weight_memory_v1'; }
  _load()          { try { const v = JSON.parse(localStorage.getItem(this.KEY)); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch { return {}; } }
  get(exerciseId)  { const w = Number(this._load()[exerciseId]); return Number.isFinite(w) && w > 0 ? w : 0; }
  set(exerciseId, weight) {
    const data = this._load();
    data[exerciseId] = weight;
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (_) {}
  }
}


// ─── Calibration Store ────────────────────────────────────────────────────────
//
// One record per exercise per profile: the rest and peak angles this person
// actually reaches. `{ skipped: true }` is a real answer too — it means "asked,
// declined", so the app stops offering it every session.

class CalibrationStore {
  constructor()     { this.KEY = 'dc_calibration_v1'; }
  setNamespace(ns)  { this.KEY = ns ? `dc_${ns}calibration_v1` : 'dc_calibration_v1'; }
  _load()     { try { const v = JSON.parse(localStorage.getItem(this.KEY)); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch { return {}; } }
  _save(data) { try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (_) {} }

  // The raw record, including a decline. Use this to decide whether to ASK.
  entry(exerciseId) {
    const e = this._load()[exerciseId];
    return (e && typeof e === 'object') ? e : null;
  }

  // A usable band, or null. Use this to decide whether to COUNT differently.
  // Anything malformed reads as absent rather than being handed to the engine.
  get(exerciseId) {
    const e = this.entry(exerciseId);
    if (!e || e.skipped) return null;
    const rest = Number(e.rest), peak = Number(e.peak);
    if (!Number.isFinite(rest) || !Number.isFinite(peak)) return null;
    if (Math.abs(peak - rest) < CALIB_MIN_SPAN_DEG) return null;
    return { rest, peak, at: Number(e.at) || 0 };
  }

  set(exerciseId, { rest, peak }) {
    const data = this._load();
    data[exerciseId] = { rest: Math.round(rest), peak: Math.round(peak), at: Date.now() };
    this._save(data);
  }

  skip(exerciseId) {
    const data = this._load();
    data[exerciseId] = { skipped: true, at: Date.now() };
    this._save(data);
  }

  clear(exerciseId) {
    const data = this._load();
    delete data[exerciseId];
    this._save(data);
  }
}


// ─── Workout Plan Manager ─────────────────────────────────────────────────────

class WorkoutPlanManager {
  constructor()     { this.KEY = 'dc_plans_v1'; }
  setNamespace(ns)  { this.KEY = ns ? `dc_${ns}plans_v1` : 'dc_plans_v1'; }
  _load()     { try { const v = JSON.parse(localStorage.getItem(this.KEY)); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch { return {}; } }
  _save(data) { try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (_) {} }
  list()      { return Object.keys(this._load()); }
  get(name)   { return this._load()[name] || null; }

  save(name, plan) {
    if (!name.trim()) return false;
    const data = this._load();
    data[name.trim()] = { plan, savedAt: Date.now() };
    this._save(data);
    return true;
  }

  // A stored plan drives the whole workout state machine, so it is sanitised on
  // the way out: an item naming an exercise that no longer exists, or carrying a
  // non-numeric set/rep count, used to produce a RepCounter with no exercise and
  // an unfinishable set.
  getSanitised(name) {
    const saved = this.get(name);
    const raw   = Array.isArray(saved?.plan) ? saved.plan : [];
    const clamp = (v, lo, hi, dflt) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
    };
    return raw
      .filter(it => it && EXERCISES.some(e => e.id === it.exerciseId))
      .map(it => ({
        exerciseId:        it.exerciseId,
        sets:              clamp(it.sets, 1, 20, 3),
        reps:              clamp(it.reps, 1, 50, 12),
        restBetweenSets:   clamp(it.restBetweenSets, 0, 300, DEFAULT_REST_BETWEEN_SETS),
        restAfterExercise: clamp(it.restAfterExercise, 0, 300, 60),
      }));
  }

  delete(name) {
    const data = this._load();
    delete data[name];
    this._save(data);
  }
}
