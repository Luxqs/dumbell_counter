class App {
  constructor() {
    this.detector = new PoseDetector();
    this.counter = null;
    this.wm = new WorkoutManager();

    // Workout config
    this.exerciseId = EXERCISES[0].id;
    this.targetSets = 3;
    this.targetReps = 12;

    // Workout state
    this.currentSet = 1;
    this.isRunning = false;
    this.isPaused = false;
    this.animationId = null;
    this.stream = null;

    // Rest timer
    this.restTimer = null;
    this.restRemaining = REST_SECONDS;

    // Flash effect timeout
    this._flashTimeout = null;

    this._cacheDOM();
    this._populateExercises();
    this._populatePresets();
    this._bindSetup();
    this._bindWorkout();
    this._init();
  }

  // ── DOM Cache ────────────────────────────────────────────────────────────

  _cacheDOM() {
    const $ = id => document.getElementById(id);
    this.screens = {
      setup: $('screen-setup'),
      loading: $('screen-loading'),
      workout: $('screen-workout'),
      rest: $('screen-rest'),
      complete: $('screen-complete'),
    };
    this.setup = {
      exerciseSelect: $('exercise-select'),
      setsDisplay: $('sets-display'),
      repsDisplay: $('reps-display'),
      btnSetsMinus: $('btn-sets-minus'),
      btnSetsPlus: $('btn-sets-plus'),
      btnRepsMinus: $('btn-reps-minus'),
      btnRepsPlus: $('btn-reps-plus'),
      presetName: $('preset-name'),
      btnSavePreset: $('btn-save-preset'),
      presetSelect: $('preset-select'),
      btnDeletePreset: $('btn-delete-preset'),
      exerciseTips: $('exercise-tips'),
      btnStart: $('btn-start'),
    };
    this.workout = {
      title: $('workout-title'),
      video: $('camera-feed'),
      canvas: $('pose-canvas'),
      angleDisplay: $('angle-display'),
      setDisplay: $('set-display'),
      repDisplay: $('rep-display'),
      repCount: $('rep-count'),
      targetRepsDisplay: $('target-reps-display'),
      barOverall: $('bar-overall'),
      barSet: $('bar-set'),
      pctOverall: $('pct-overall'),
      pctSet: $('pct-set'),
      btnPause: $('btn-pause'),
      btnNext: $('btn-next-set'),
      btnBack: $('btn-back'),
      flashOverlay: $('flash-overlay'),
    };
    this.rest = {
      setDone: $('rest-set-done'),
      countdown: $('rest-countdown'),
      btnSkip: $('btn-skip-rest'),
    };
    this.complete = {
      exerciseName: $('complete-exercise'),
      totalSets: $('complete-sets'),
      totalReps: $('complete-reps'),
      btnAgain: $('btn-do-again'),
      btnHome: $('btn-home'),
    };
    this.loadingMsg = $('loading-msg');
  }

  // ── Populate UI ──────────────────────────────────────────────────────────

  _populateExercises() {
    const sel = this.setup.exerciseSelect;
    sel.innerHTML = '';
    EXERCISES.forEach(ex => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.name;
      sel.appendChild(opt);
    });
    this._updateTips();
  }

  _populatePresets() {
    const sel = this.setup.presetSelect;
    const names = this.wm.list();
    sel.innerHTML = '<option value="">— Load preset —</option>';
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
    this.setup.btnDeletePreset.disabled = names.length === 0;
  }

  _updateTips() {
    const ex = EXERCISES.find(e => e.id === this.setup.exerciseSelect.value);
    this.setup.exerciseTips.textContent = ex ? ex.tips : '';
  }

  // ── Bind Events: Setup screen ────────────────────────────────────────────

  _bindSetup() {
    const s = this.setup;

    s.exerciseSelect.addEventListener('change', () => this._updateTips());

    s.btnSetsMinus.addEventListener('click', () => {
      this.targetSets = Math.max(1, this.targetSets - 1);
      s.setsDisplay.textContent = this.targetSets;
    });
    s.btnSetsPlus.addEventListener('click', () => {
      this.targetSets = Math.min(20, this.targetSets + 1);
      s.setsDisplay.textContent = this.targetSets;
    });
    s.btnRepsMinus.addEventListener('click', () => {
      this.targetReps = Math.max(1, this.targetReps - 1);
      s.repsDisplay.textContent = this.targetReps;
    });
    s.btnRepsPlus.addEventListener('click', () => {
      this.targetReps = Math.min(50, this.targetReps + 1);
      s.repsDisplay.textContent = this.targetReps;
    });

    s.btnSavePreset.addEventListener('click', () => {
      const name = s.presetName.value.trim();
      if (!name) { s.presetName.focus(); return; }
      this.wm.save(name, {
        exerciseId: s.exerciseSelect.value,
        sets: this.targetSets,
        reps: this.targetReps,
      });
      this._populatePresets();
      s.presetName.value = '';
      this._toast('Preset saved!');
    });

    s.presetSelect.addEventListener('change', () => {
      const preset = this.wm.get(s.presetSelect.value);
      if (!preset) return;
      s.exerciseSelect.value = preset.exerciseId;
      this.targetSets = preset.sets;
      this.targetReps = preset.reps;
      s.setsDisplay.textContent = this.targetSets;
      s.repsDisplay.textContent = this.targetReps;
      this._updateTips();
    });

    s.btnDeletePreset.addEventListener('click', () => {
      const name = s.presetSelect.value;
      if (!name) return;
      this.wm.delete(name);
      this._populatePresets();
      this._toast('Preset deleted');
    });

    s.btnStart.addEventListener('click', () => this._startWorkout());
  }

  // ── Bind Events: Workout screen ──────────────────────────────────────────

  _bindWorkout() {
    const w = this.workout;

    w.btnBack.addEventListener('click', () => {
      if (confirm('End workout and return to setup?')) this._goSetup();
    });

    w.btnPause.addEventListener('click', () => {
      if (this.isPaused) {
        this.isPaused = false;
        w.btnPause.textContent = '⏸ Pause';
        this._loop();
      } else {
        this.isPaused = true;
        w.btnPause.textContent = '▶ Resume';
        cancelAnimationFrame(this.animationId);
      }
    });

    w.btnNext.addEventListener('click', () => this._completeSet());

    this.rest.btnSkip.addEventListener('click', () => this._endRest());

    this.complete.btnAgain.addEventListener('click', () => this._startWorkout());
    this.complete.btnHome.addEventListener('click', () => this._goSetup());
  }

  // ── Initialise TF.js ────────────────────────────────────────────────────

  async _init() {
    this._showScreen('setup');
  }

  // ── Workflow ─────────────────────────────────────────────────────────────

  async _startWorkout() {
    this.exerciseId = this.setup.exerciseSelect.value;
    this.currentSet = 1;
    this.counter = new RepCounter(this.exerciseId);
    this.counter.reset();

    this._showScreen('loading');

    try {
      // Load model if not already loaded
      if (!this.detector.ready) {
        await this.detector.init(msg => { this.loadingMsg.textContent = msg; });
      }

      // Request camera
      this.loadingMsg.textContent = 'Starting camera…';
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const video = this.workout.video;
      video.srcObject = this.stream;
      await new Promise(res => { video.onloadedmetadata = res; });
      await video.play();

    } catch (err) {
      alert('Could not start camera: ' + err.message);
      this._showScreen('setup');
      return;
    }

    this._showScreen('workout');
    this._updateWorkoutUI();
    this.isRunning = true;
    this.isPaused = false;
    this.workout.btnPause.textContent = '⏸ Pause';
    this._loop();
  }

  // ── Detection loop ───────────────────────────────────────────────────────

  _loop() {
    if (!this.isRunning || this.isPaused) return;
    this.animationId = requestAnimationFrame(() => this._tick());
  }

  async _tick() {
    if (!this.isRunning || this.isPaused) return;

    const video = this.workout.video;
    const pose = await this.detector.detect(video);

    this.detector.drawSkeleton(this.workout.canvas, video, pose, this.exerciseId);

    if (pose) {
      const result = this.counter.update(pose, this.detector);
      this._updateCountUI(result);

      if (result.counted) {
        this._flashRep();
        if (result.reps >= this.targetReps) {
          // Small delay so user sees the final count
          setTimeout(() => this._completeSet(), 400);
          return;
        }
      }
    }

    this._loop();
  }

  // ── Set / rest / completion ──────────────────────────────────────────────

  _completeSet() {
    cancelAnimationFrame(this.animationId);
    this.isRunning = false;

    if (this.currentSet >= this.targetSets) {
      this._showComplete();
    } else {
      this._showRest();
    }
  }

  _showRest() {
    this.rest.setDone.textContent = `Set ${this.currentSet} of ${this.targetSets} complete!`;
    this.restRemaining = REST_SECONDS;
    this.rest.countdown.textContent = this.restRemaining;
    this._showScreen('rest');

    this.restTimer = setInterval(() => {
      this.restRemaining--;
      this.rest.countdown.textContent = this.restRemaining;
      if (this.restRemaining <= 0) this._endRest();
    }, 1000);
  }

  _endRest() {
    clearInterval(this.restTimer);
    this.currentSet++;
    this.counter.reset();
    this._showScreen('workout');
    this._updateWorkoutUI();
    this.isRunning = true;
    this.isPaused = false;
    this.workout.btnPause.textContent = '⏸ Pause';
    this._loop();
  }

  _showComplete() {
    this._stopCamera();
    const ex = EXERCISES.find(e => e.id === this.exerciseId);
    const totalReps = (this.currentSet - 1) * this.targetReps + this.counter.reps;
    this.complete.exerciseName.textContent = ex?.name || '';
    this.complete.totalSets.textContent = `${this.targetSets} sets`;
    this.complete.totalReps.textContent = `${totalReps} reps`;
    this._showScreen('complete');
  }

  _goSetup() {
    cancelAnimationFrame(this.animationId);
    clearInterval(this.restTimer);
    this.isRunning = false;
    this.isPaused = false;
    this._stopCamera();
    this._showScreen('setup');
  }

  _stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.workout.video.srcObject = null;
    }
  }

  // ── UI Updates ───────────────────────────────────────────────────────────

  _updateWorkoutUI() {
    const ex = EXERCISES.find(e => e.id === this.exerciseId);
    this.workout.title.textContent = ex?.name || '';
    this.workout.targetRepsDisplay.textContent = this.targetReps;
    this._updateCountUI({ reps: 0, angle: 0, counted: false });
  }

  _updateCountUI({ reps, angle }) {
    const w = this.workout;
    w.repCount.textContent = reps;
    w.angleDisplay.textContent = `${angle}°`;
    w.setDisplay.textContent = `${this.currentSet} / ${this.targetSets}`;
    w.repDisplay.textContent = `${reps} / ${this.targetReps}`;

    const setProgress = Math.min(reps / this.targetReps, 1);
    const completedSets = this.currentSet - 1;
    const overallProgress = Math.min(
      (completedSets * this.targetReps + reps) / (this.targetSets * this.targetReps), 1
    );

    w.barSet.style.width = `${setProgress * 100}%`;
    w.barOverall.style.width = `${overallProgress * 100}%`;
    w.pctSet.textContent = `${Math.round(setProgress * 100)}%`;
    w.pctOverall.textContent = `${Math.round(overallProgress * 100)}%`;
  }

  _flashRep() {
    const overlay = this.workout.flashOverlay;
    overlay.classList.add('active');
    clearTimeout(this._flashTimeout);
    this._flashTimeout = setTimeout(() => overlay.classList.remove('active'), 300);
  }

  // ── Screen switching ─────────────────────────────────────────────────────

  _showScreen(name) {
    Object.entries(this.screens).forEach(([k, el]) => {
      el.classList.toggle('active', k === name);
    });
  }

  // ── Toast ────────────────────────────────────────────────────────────────

  _toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => t.classList.remove('show'), 2200);
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
