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

  namespace(name) {
    return `u_${name.replace(/[^a-zA-Z0-9]/g, '_')}_`;
  }
}


// ─── Pose Detector (wraps TensorFlow.js MoveNet) ─────────────────────────────

class PoseDetector {
  constructor() {
    this.detector = null;
    this.ready    = false;
  }

  async init(onProgress) {
    onProgress?.('Loading pose model…');
    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        // THUNDER: more accurate joint positions than LIGHTNING
        modelType:       poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        enableSmoothing: false, // we do our own EMA smoothing per-exercise
      }
    );
    this.ready = true;
    onProgress?.('Model ready');
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
    return pose;
  }

  // Returns a keypoint only if confidence meets the threshold
  kp(pose, name) {
    if (!pose) return null;
    const k = pose._kpMap ? pose._kpMap[name] : pose.keypoints.find(p => p.name === name);
    return k && k.score >= MIN_KEYPOINT_CONFIDENCE ? k : null;
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
  constructor(exerciseId) {
    this.exercise = EXERCISES.find(e => e.id === exerciseId);
    if (!this.exercise) {
      // Graceful fallback: unknown exercise won't count reps but won't throw
      console.warn(`RepCounter: unknown exerciseId "${exerciseId}"`);
    }
    this.exerciseId = exerciseId;
    this.reset();
  }

  reset() {
    this.reps         = 0;
    this.angle        = 0;
    this._lastRepTime = 0;

    // Counter-level latch — see the header comment. Starts false and can only
    // be armed by actually being observed at rest, so starting a set already
    // at the top of the movement never fires a phantom rep.
    this._armed          = false;
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
  }

  _blankSide() {
    return {
      ema: null, angle: 0, raw: 0,
      prevRaw: null,      // previous frame's raw angle, for the motion estimate
      motion: 0,          // decaying deg/frame — how hard this limb is working
      progress: 0,        // smoothed — drives the gauge, so it must not jitter
      rawProgress: 0,     // unsmoothed — drives counting and ROM scoring
      peakProgress: 0,
      peakStreak: 0, restStreak: 0,
      detected: false,
    };
  }

  // Manual rep — tap-to-count fallback when camera detection is unreliable
  manualRep() {
    this._lastRepTime    = Date.now();
    this._lastRepTooFast = false;
    this._lastRepRom     = 1;
    this.reps++;
    // A tapped rep also disarms the latch, so the camera cannot immediately
    // count the same physical rep a second time.
    this._armed = false;
    return this._payload({
      counted:   true,
      quality:   'manual',
      coach:     'Rep counted by hand',
      coachTone: 'neutral',
    });
  }

  // Undo last rep — corrects miscounts; never goes below 0
  undoRep() {
    if (this.reps <= 0) {
      return this._payload({ counted: false, quality: 'manual', coach: 'No reps to remove', coachTone: 'neutral' });
    }
    this.reps--;
    // Drop the matching ROM samples so the imbalance warning stays honest.
    // Guarded: popping on an already-empty counter used to silently discard a
    // previous rep's range-of-motion sample.
    this._romLeft.pop();
    this._romRight.pop();
    return this._payload({
      counted:   false,
      quality:   'manual',
      coach:     'Rep removed',
      coachTone: 'neutral',
    });
  }

  _calcAngle(a, b, c) {
    const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let deg = Math.abs(r * 180 / Math.PI);
    if (deg > 180) deg = 360 - deg;
    return deg;
  }

  _ema(newVal, prevVal) {
    return prevVal === null ? newVal : EMA_ALPHA * newVal + (1 - EMA_ALPHA) * prevVal;
  }

  // Measures one side. Reports where the joint sits inside the exercise's own
  // band — it does NOT count anything.
  _tickSide(sideData, pose, detector, sideName) {
    sideData.detected = false;
    if (!this.exercise) return sideData;

    const { a, b, c } = this.exercise.joints;
    const pa = detector.kp(pose, `${sideName}_${a}`);
    const pb = detector.kp(pose, `${sideName}_${b}`);
    const pc = detector.kp(pose, `${sideName}_${c}`);
    if (!pa || !pb || !pc) return sideData;

    const raw      = this._calcAngle(pa, pb, pc);
    // How much this joint moved since the last frame, smoothed. A limb that is
    // holding a brace position reads ~0 here no matter how confidently the model
    // sees it, which is what lets the counter ignore it.
    const delta      = sideData.prevRaw === null ? 0 : Math.abs(raw - sideData.prevRaw);
    sideData.prevRaw = raw;
    sideData.motion  = MOTION_DECAY * sideData.motion + (1 - MOTION_DECAY) * delta;
    sideData.raw   = raw;
    sideData.ema   = this._ema(raw, sideData.ema);
    sideData.angle = Math.round(sideData.ema);

    const cfg  = this.exercise.counting;
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

    // Threshold crossings are likewise judged on the raw angle, then confirmed
    // over a couple of frames so a single bad inference can't fake a rep.
    sideData.peakStreak = this._atPeak(raw) ? sideData.peakStreak + 1 : 0;
    sideData.restStreak = this._atRest(raw) ? sideData.restStreak + 1 : 0;

    sideData.confidence = (pa.score + pb.score + pc.score) / 3;
    sideData.detected   = true;
    return sideData;
  }

  // True when the angle has crossed peakThreshold in the movement's direction.
  // Takes the RAW angle — see _tickSide for why smoothing is not used here.
  _atPeak(angle) {
    const cfg = this.exercise.counting;
    return cfg.direction === 'increase' ? angle >= cfg.peakThreshold : angle <= cfg.peakThreshold;
  }

  // True when the angle has come back past restThreshold, plus hysteresis.
  // The extra margin is what stops jitter from re-arming a held position.
  _atRest(angle) {
    const cfg = this.exercise.counting;
    const h   = cfg.hysteresis ?? 6;
    return cfg.direction === 'increase' ? angle <= cfg.restThreshold - h
                                        : angle >= cfg.restThreshold + h;
  }

  // Where peakThreshold falls on the 0-1 progress scale — i.e. how much of the
  // ideal range you must cover before the rep is credited at all.
  _countProgress() {
    const cfg  = this.exercise.counting;
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
    if (!this.exercise) return this._payload({ coach: 'Unknown exercise — use the tap counter' });

    const L = this._tickSide(this._left,  pose, detector, 'left');
    const R = this._tickSide(this._right, pose, detector, 'right');

    if (!L.detected && !R.detected) {
      this._activeSide     = null;
      this._activeProgress = 0;
      return this._payload({
        quality:   'none',
        coach:     'Can\'t see the joints — step back so your whole body is in frame',
        coachTone: 'bad',
      });
    }

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
      const lm = L.motion > MOTION_FLOOR;
      const rm = R.motion > MOTION_FLOOR;
      if (lm !== rm) {
        // Exactly one limb is moving — that is the one doing the exercise, and
        // no amount of confidence in the other one should override it.
        activeSide = lm ? 'left' : 'right';
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

    const now        = Date.now();
    const cfg        = this.exercise.counting;
    const cooldownOk = (now - this._lastRepTime) > REP_COOLDOWN_MS;

    let counted      = false;
    let formComplete = false;

    // ── Rep credited on the way up ──────────────────────────────────────────
    // Start the tempo clock on the first frame of real movement
    if (this._armed && this._repMoveStart === 0 && act.rawProgress > 0.1) {
      this._repMoveStart = now;
    }

    if (this._armed && act.peakStreak >= CONFIRM_FRAMES && cooldownOk) {
      this._armed          = false;
      this._lastRepTime    = now;
      this._lastRepTooFast = this._repMoveStart > 0 &&
                             (now - this._repMoveStart) < (cfg.minRepMs ?? 800);
      this.reps++;
      counted = true;
    }

    // ── Rep cycle closed on the way back down ───────────────────────────────
    // This is also the only way to arm the next rep, which is what makes a
    // held position count exactly once.
    if (!this._armed && act.restStreak >= CONFIRM_FRAMES) {
      this._armed        = true;
      this._repMoveStart = 0;
      formComplete       = this.reps > 0;

      if (formComplete) {
        // Bank how far each side travelled during the rep just finished
        this._lastRepRom = act.peakProgress;
        if (L.detected) this._romLeft.push(L.peakProgress);
        if (R.detected) this._romRight.push(R.peakProgress);
        if (this._romLeft.length  > ROM_HISTORY_LEN) this._romLeft.shift();
        if (this._romRight.length > ROM_HISTORY_LEN) this._romRight.shift();
      }
      this._left.peakProgress  = 0;
      this._right.peakProgress = 0;
    }

    const conf    = act.confidence;
    const quality = conf > 0.7 ? 'good' : conf > 0.5 ? 'fair' : 'poor';
    const coach   = this._coach({ act, L, R, quality, counted, formComplete });

    return this._payload({ counted, quality, formComplete, ...coach });
  }

  // Picks the single most useful sentence to put in front of the user right
  // now. Ordered by urgency: tracking problems first, then form, then tempo.
  _coach({ act, L, R, quality, counted, formComplete }) {
    const cfg    = this.exercise.counting;
    const cues   = this.exercise.cues || {};
    const countP = this._countProgress();

    if (quality === 'poor') {
      return { coach: 'Weak tracking — improve the light or move into frame', coachTone: 'bad' };
    }

    // Credited, but NOT yet judged. At this instant the user has only just
    // crossed the counting line — they are still travelling toward their real
    // peak, so scoring range of motion here marks every honest full rep as
    // shallow. Tempo is already known, so that one can be said immediately.
    if (counted) {
      if (this._lastRepTooFast) {
        return { coach: `Rep ${this.reps} — too fast, control the weight`, coachTone: 'warn' };
      }
      return { coach: `Rep ${this.reps} ✓`, coachTone: 'good' };
    }

    // Cycle closed — the peak actually reached is now known, so this is where
    // the range-of-motion verdict belongs.
    if (formComplete) {
      if (this._lastRepRom >= SHALLOW_REP_PROGRESS) {
        return { coach: `Rep ${this.reps} — full range 💪`, coachTone: 'good' };
      }
      const pct = Math.round(this._lastRepRom * 100);
      return {
        coach:     `Rep ${this.reps} — only ${pct}% range · ${cues.concentric || 'go further'}`,
        coachTone: 'warn',
      };
    }

    // Lifting phase: not yet armed enough to score
    if (this._armed) {
      if (act.rawProgress >= SHALLOW_REP_PROGRESS) {
        return { coach: 'Full range — now return under control', coachTone: 'good' };
      }
      if (act.rawProgress >= countP) {
        // Past the counting line but short of the ideal — this is exactly the
        // half-rep the user wants flagged.
        const gap = Math.round(Math.abs(cfg.idealPeak - act.raw));
        return { coach: `${cues.concentric || 'Go further'} — ${gap}° more`, coachTone: 'warn' };
      }
      if (act.rawProgress > 0.08) {
        return { coach: cues.concentric || 'Keep going', coachTone: 'neutral' };
      }
      return { coach: 'Ready — start the rep', coachTone: 'neutral' };
    }

    // Returning phase: the rep is credited but the cycle isn't closed yet.
    // Until they get back past restThreshold the next rep will NOT count, so
    // say so plainly rather than letting them wonder why nothing moves.
    if (act.progress > 0.35) {
      return { coach: cues.eccentric || 'Return to the start', coachTone: 'warn' };
    }
    return { coach: `Almost — ${cues.eccentric || 'return fully'}`, coachTone: 'neutral' };
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
    const stored  = { ...entry, id: Date.now(), date: Date.now() };
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
