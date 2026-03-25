class App {
  constructor() {
    this.detector = new PoseDetector();
    this.counter = null;
    this.wm = new WorkoutManager();
    this.wpm = new WorkoutPlanManager();

    // Single exercise config
    this.exerciseId = EXERCISES[0].id;
    this.targetSets = 3;
    this.targetReps = 12;
    this.restBetweenSets = DEFAULT_REST_BETWEEN_SETS;
    this.restBetweenReps = DEFAULT_REST_BETWEEN_REPS;

    // Workout state
    this.currentSet = 1;
    this.isRunning = false;
    this.isPaused = false;
    this.animationId = null;
    this.stream = null;

    // Rest timer
    this.restTimer = null;
    this.restRemaining = 0;

    // Plan state
    this.workoutPlan = [];
    this.planIndex = 0;
    this.isRunningPlan = false;
    this.planResults = [];
    this._isExerciseTransition = false;

    // Rep rest
    this._repRestUntil = 0;

    // Flash effect timeout
    this._flashTimeout = null;

    this._cacheDOM();
    this._populateExercises();
    this._populatePresets();
    this._populatePlanSelect();
    this._renderPlanList();
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
      // Rest times
      restSetsDisplay: $('rest-sets-display'),
      btnRestSetsMinus: $('btn-rest-sets-minus'),
      btnRestSetsPlus: $('btn-rest-sets-plus'),
      restRepsDisplay: $('rest-reps-display'),
      btnRestRepsMinus: $('btn-rest-reps-minus'),
      btnRestRepsPlus: $('btn-rest-reps-plus'),
      // Presets
      presetName: $('preset-name'),
      btnSavePreset: $('btn-save-preset'),
      presetSelect: $('preset-select'),
      btnDeletePreset: $('btn-delete-preset'),
      exerciseTips: $('exercise-tips'),
      btnStart: $('btn-start'),
      // Plan
      btnAddToPlan: $('btn-add-to-plan'),
      planList: $('plan-list'),
      planName: $('plan-name'),
      btnSavePlan: $('btn-save-plan'),
      planSelect: $('plan-select'),
      btnLoadPlan: $('btn-load-plan'),
      btnDeletePlan: $('btn-delete-plan'),
      btnStartPlan: $('btn-start-plan'),
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
      repRestBadge: $('rep-rest-badge'),
      repRestCountdown: $('rep-rest-countdown'),
    };
    this.rest = {
      setDone: $('rest-set-done'),
      countdown: $('rest-countdown'),
      tip: $('rest-tip'),
      nextExercise: $('rest-next-exercise'),
      btnSkip: $('btn-skip-rest'),
    };
    this.complete = {
      exerciseName: $('complete-exercise'),
      totalSets: $('complete-sets'),
      totalReps: $('complete-reps'),
      btnAgain: $('btn-do-again'),
      btnHome: $('btn-home'),
      singleStats: $('complete-single-stats'),
      planStats: $('complete-plan-stats'),
      planSummaryList: $('plan-summary-list'),
      heading: document.querySelector('#screen-complete h1'),
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

  _populatePlanSelect() {
    const sel = this.setup.planSelect;
    const names = this.wpm.list();
    sel.innerHTML = '<option value="">— Load saved plan —</option>';
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
  }

  _updateTips() {
    const ex = EXERCISES.find(e => e.id === this.setup.exerciseSelect.value);
    this.setup.exerciseTips.textContent = ex ? ex.tips : '';
  }

  _renderPlanList() {
    const list = this.setup.planList;
    list.innerHTML = '';

    if (this.workoutPlan.length === 0) {
      list.innerHTML = '<p class="plan-empty">No exercises added yet. Configure above and click "+ Add".</p>';
      this.setup.btnStartPlan.style.display = 'none';
      return;
    }

    this.workoutPlan.forEach((item, i) => {
      const ex = EXERCISES.find(e => e.id === item.exerciseId);
      const div = document.createElement('div');
      div.className = 'plan-item';
      div.innerHTML = `
        <div class="plan-item-num">${i + 1}</div>
        <div class="plan-item-info">
          <div class="plan-item-name">${ex?.name || item.exerciseId}</div>
          <div class="plan-item-meta">${item.sets} sets × ${item.reps} reps &nbsp;|&nbsp; Set rest: ${item.restBetweenSets}s &nbsp;|&nbsp; Rep rest: ${item.restBetweenReps}s</div>
        </div>
        <div class="plan-item-actions">
          <button class="btn-icon" data-action="up" data-idx="${i}" title="Move up">↑</button>
          <button class="btn-icon" data-action="down" data-idx="${i}" title="Move down">↓</button>
          <button class="btn-icon danger" data-action="remove" data-idx="${i}" title="Remove">✕</button>
        </div>
      `;
      list.appendChild(div);
    });

    list.querySelectorAll('.btn-icon').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.idx);
        if (action === 'up' && idx > 0) {
          [this.workoutPlan[idx], this.workoutPlan[idx - 1]] = [this.workoutPlan[idx - 1], this.workoutPlan[idx]];
        } else if (action === 'down' && idx < this.workoutPlan.length - 1) {
          [this.workoutPlan[idx], this.workoutPlan[idx + 1]] = [this.workoutPlan[idx + 1], this.workoutPlan[idx]];
        } else if (action === 'remove') {
          this.workoutPlan.splice(idx, 1);
        }
        this._renderPlanList();
      });
    });

    this.setup.btnStartPlan.style.display = '';
  }

  // ── Bind Events: Setup screen ────────────────────────────────────────────

  _bindSetup() {
    const s = this.setup;

    s.exerciseSelect.addEventListener('change', () => this._updateTips());

    // Sets / Reps steppers
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

    // Rest time steppers
    s.btnRestSetsMinus.addEventListener('click', () => {
      this.restBetweenSets = Math.max(0, this.restBetweenSets - 5);
      s.restSetsDisplay.textContent = this.restBetweenSets;
    });
    s.btnRestSetsPlus.addEventListener('click', () => {
      this.restBetweenSets = Math.min(300, this.restBetweenSets + 5);
      s.restSetsDisplay.textContent = this.restBetweenSets;
    });
    s.btnRestRepsMinus.addEventListener('click', () => {
      this.restBetweenReps = Math.max(0, this.restBetweenReps - 1);
      s.restRepsDisplay.textContent = this.restBetweenReps;
    });
    s.btnRestRepsPlus.addEventListener('click', () => {
      this.restBetweenReps = Math.min(60, this.restBetweenReps + 1);
      s.restRepsDisplay.textContent = this.restBetweenReps;
    });

    // Presets
    s.btnSavePreset.addEventListener('click', () => {
      const name = s.presetName.value.trim();
      if (!name) { s.presetName.focus(); return; }
      this.wm.save(name, {
        exerciseId: s.exerciseSelect.value,
        sets: this.targetSets,
        reps: this.targetReps,
        restBetweenSets: this.restBetweenSets,
        restBetweenReps: this.restBetweenReps,
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
      this.restBetweenSets = preset.restBetweenSets ?? DEFAULT_REST_BETWEEN_SETS;
      this.restBetweenReps = preset.restBetweenReps ?? DEFAULT_REST_BETWEEN_REPS;
      s.setsDisplay.textContent = this.targetSets;
      s.repsDisplay.textContent = this.targetReps;
      s.restSetsDisplay.textContent = this.restBetweenSets;
      s.restRepsDisplay.textContent = this.restBetweenReps;
      this._updateTips();
    });

    s.btnDeletePreset.addEventListener('click', () => {
      const name = s.presetSelect.value;
      if (!name) return;
      this.wm.delete(name);
      this._populatePresets();
      this._toast('Preset deleted');
    });

    // Plan management
    s.btnAddToPlan.addEventListener('click', () => {
      this.workoutPlan.push({
        exerciseId: s.exerciseSelect.value,
        sets: this.targetSets,
        reps: this.targetReps,
        restBetweenSets: this.restBetweenSets,
        restBetweenReps: this.restBetweenReps,
      });
      this._renderPlanList();
      this._toast('Added to plan!');
    });

    s.btnSavePlan.addEventListener('click', () => {
      const name = s.planName.value.trim();
      if (!name) { s.planName.focus(); return; }
      if (this.workoutPlan.length === 0) { this._toast('Plan is empty!'); return; }
      this.wpm.save(name, this.workoutPlan);
      this._populatePlanSelect();
      s.planName.value = '';
      this._toast('Plan saved!');
    });

    s.btnLoadPlan.addEventListener('click', () => {
      const name = s.planSelect.value;
      if (!name) return;
      const saved = this.wpm.get(name);
      if (!saved) return;
      this.workoutPlan = saved.plan;
      this._renderPlanList();
      this._toast('Plan loaded!');
    });

    s.btnDeletePlan.addEventListener('click', () => {
      const name = s.planSelect.value;
      if (!name) return;
      this.wpm.delete(name);
      this._populatePlanSelect();
      this._toast('Plan deleted');
    });

    s.btnStartPlan.addEventListener('click', () => {
      if (this.workoutPlan.length === 0) return;
      this._startWorkout(true);
    });

    s.btnStart.addEventListener('click', () => this._startWorkout(false));
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

    this.complete.btnAgain.addEventListener('click', () => this._startWorkout(this.isRunningPlan));
    this.complete.btnHome.addEventListener('click', () => this._goSetup());
  }

  // ── Initialise ───────────────────────────────────────────────────────────

  async _init() {
    this._showScreen('setup');
  }

  // ── Workflow ─────────────────────────────────────────────────────────────

  async _startWorkout(isPlan = false) {
    this.isRunningPlan = isPlan;

    if (isPlan) {
      this.planIndex = 0;
      this.planResults = [];
      const item = this.workoutPlan[0];
      this.exerciseId = item.exerciseId;
      this.targetSets = item.sets;
      this.targetReps = item.reps;
      this.restBetweenSets = item.restBetweenSets;
      this.restBetweenReps = item.restBetweenReps;
    } else {
      this.exerciseId = this.setup.exerciseSelect.value;
    }

    this.currentSet = 1;
    this._repRestUntil = 0;
    this._isExerciseTransition = false;
    this.counter = new RepCounter(this.exerciseId);
    this.counter.reset();

    this._showScreen('loading');

    try {
      if (!this.detector.ready) {
        await this.detector.init(msg => { this.loadingMsg.textContent = msg; });
      }

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

    // Handle between-rep rest period
    if (Date.now() < this._repRestUntil) {
      const remaining = Math.ceil((this._repRestUntil - Date.now()) / 1000);
      this.workout.repRestBadge.style.display = '';
      this.workout.repRestCountdown.textContent = remaining;
      this._loop();
      return;
    } else {
      this.workout.repRestBadge.style.display = 'none';
    }

    if (pose) {
      const result = this.counter.update(pose, this.detector);
      this._updateCountUI(result);

      if (result.counted) {
        this._flashRep();
        if (this.restBetweenReps > 0) {
          this._repRestUntil = Date.now() + this.restBetweenReps * 1000;
        }
        if (result.reps >= this.targetReps) {
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
      if (this.isRunningPlan && this.planIndex < this.workoutPlan.length - 1) {
        this._showExerciseTransition();
      } else {
        this._showComplete();
      }
    } else {
      this._showRest();
    }
  }

  _showRest() {
    this.rest.setDone.textContent = `Set ${this.currentSet} of ${this.targetSets} complete!`;
    this.rest.tip.textContent = 'Rest up, next set coming!';
    this.rest.nextExercise.style.display = 'none';
    this.restRemaining = this.restBetweenSets;
    this.rest.countdown.textContent = this.restRemaining;
    this._showScreen('rest');

    if (this.restBetweenSets <= 0) {
      setTimeout(() => this._endRest(), 300);
      return;
    }

    this.restTimer = setInterval(() => {
      this.restRemaining--;
      this.rest.countdown.textContent = this.restRemaining;
      if (this.restRemaining <= 0) this._endRest();
    }, 1000);
  }

  _showExerciseTransition() {
    this._recordPlanResult();
    const nextItem = this.workoutPlan[this.planIndex + 1];
    const nextEx = EXERCISES.find(e => e.id === nextItem.exerciseId);

    this.rest.setDone.textContent = `Exercise ${this.planIndex + 1} / ${this.workoutPlan.length} complete!`;
    this.rest.tip.textContent = 'Prepare for the next exercise!';
    this.rest.nextExercise.textContent = `Up next: ${nextEx?.name || nextItem.exerciseId}`;
    this.rest.nextExercise.style.display = '';
    this._isExerciseTransition = true;

    this.restRemaining = this.restBetweenSets;
    this.rest.countdown.textContent = this.restRemaining;
    this._showScreen('rest');

    if (this.restBetweenSets <= 0) {
      setTimeout(() => this._endRest(), 300);
      return;
    }

    this.restTimer = setInterval(() => {
      this.restRemaining--;
      this.rest.countdown.textContent = this.restRemaining;
      if (this.restRemaining <= 0) this._endRest();
    }, 1000);
  }

  _endRest() {
    clearInterval(this.restTimer);
    this.rest.nextExercise.style.display = 'none';

    if (this._isExerciseTransition) {
      this._isExerciseTransition = false;
      this._loadNextPlanExercise();
    } else {
      this.currentSet++;
      this.counter.reset();
      this._showScreen('workout');
      this._updateWorkoutUI();
      this.isRunning = true;
      this.isPaused = false;
      this.workout.btnPause.textContent = '⏸ Pause';
      this._loop();
    }
  }

  _loadNextPlanExercise() {
    this.planIndex++;
    const item = this.workoutPlan[this.planIndex];
    this.exerciseId = item.exerciseId;
    this.targetSets = item.sets;
    this.targetReps = item.reps;
    this.restBetweenSets = item.restBetweenSets;
    this.restBetweenReps = item.restBetweenReps;
    this.currentSet = 1;
    this._repRestUntil = 0;
    this.counter = new RepCounter(this.exerciseId);
    this.counter.reset();
    this._showScreen('workout');
    this._updateWorkoutUI();
    this.isRunning = true;
    this.isPaused = false;
    this.workout.btnPause.textContent = '⏸ Pause';
    this._loop();
  }

  _recordPlanResult() {
    const item = this.workoutPlan[this.planIndex];
    const ex = EXERCISES.find(e => e.id === item.exerciseId);
    const totalReps = (this.currentSet - 1) * this.targetReps + this.counter.reps;
    this.planResults.push({
      exerciseName: ex?.name || item.exerciseId,
      sets: this.targetSets,
      totalReps,
    });
  }

  _showComplete() {
    this._stopCamera();

    if (this.isRunningPlan) {
      this._recordPlanResult();
      this.complete.singleStats.style.display = 'none';
      this.complete.planStats.style.display = '';
      this.complete.heading.textContent = 'Plan Complete!';

      const list = this.complete.planSummaryList;
      list.innerHTML = '';
      this.planResults.forEach((r, i) => {
        const div = document.createElement('div');
        div.className = 'plan-summary-item';
        div.innerHTML = `<span class="plan-summary-name">${i + 1}. ${r.exerciseName}</span><span class="plan-summary-meta">${r.sets} sets · ${r.totalReps} reps</span>`;
        list.appendChild(div);
      });
    } else {
      this.complete.singleStats.style.display = '';
      this.complete.planStats.style.display = 'none';
      this.complete.heading.textContent = 'Workout Complete!';
      const ex = EXERCISES.find(e => e.id === this.exerciseId);
      const totalReps = (this.currentSet - 1) * this.targetReps + this.counter.reps;
      this.complete.exerciseName.textContent = ex?.name || '';
      this.complete.totalSets.textContent = `${this.targetSets} sets`;
      this.complete.totalReps.textContent = `${totalReps} reps`;
    }

    this._showScreen('complete');
  }

  _goSetup() {
    cancelAnimationFrame(this.animationId);
    clearInterval(this.restTimer);
    this.isRunning = false;
    this.isPaused = false;
    this.isRunningPlan = false;
    this._isExerciseTransition = false;
    this._repRestUntil = 0;
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
    let title = ex?.name || '';
    if (this.isRunningPlan) {
      title += ` (${this.planIndex + 1} / ${this.workoutPlan.length})`;
    }
    this.workout.title.textContent = title;
    this.workout.targetRepsDisplay.textContent = this.targetReps;
    this.workout.repRestBadge.style.display = 'none';
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
