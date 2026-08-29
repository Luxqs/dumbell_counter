// ─── Utility ──────────────────────────────────────────────────────────────────

// Escapes HTML special characters to prevent XSS when inserting user-controlled
// strings into innerHTML. Always call this on profile names, plan names, etc.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ─── App ──────────────────────────────────────────────────────────────────────

class App {
  constructor() {
    this.detector      = new PoseDetector();
    this.counter       = null;
    this.audio         = new AudioManager();
    this.profiles      = new ProfileManager();
    this.wm            = new WorkoutManager();
    this.wpm           = new WorkoutPlanManager();
    this.history       = new WorkoutHistory();
    this.weightMemory  = new WeightMemory();
    this.strava        = new StravaClient(typeof STRAVA_CONFIG !== 'undefined' ? STRAVA_CONFIG : null);

    // The workout that was just saved, kept so the export buttons have
    // something concrete to serialise rather than re-deriving it from state.
    this._lastSessionEntry = null;

    // Single exercise config
    this.exerciseId           = EXERCISES[0].id;
    this.targetSets           = 3;
    this.targetReps           = 12;
    this.restBetweenSets      = DEFAULT_REST_BETWEEN_SETS;
    this.restBetweenExercises = 60;

    // Workout state
    this.currentSet  = 1;
    this.isRunning   = false;
    this.isPaused    = false;
    this.animationId = null;
    this.stream      = null;
    this._processing    = false; // frame-drop guard
    this._setCompleting = false; // prevents _completeSet() double-call

    // Rest timer
    this.restTimer     = null;
    this.restRemaining = 0;

    // Plan state
    this.workoutPlan           = [];
    this.planIndex             = 0;
    this.isRunningPlan         = false;
    this.planResults           = [];
    this._isExerciseTransition = false;
    this._activePlanName       = null;

    // Set-level data collection
    this.currentSetWeight       = 0;   // weight entered for current exercise (kg)
    this.currentExerciseSetData = [];  // [{reps, weight, rpe, duration}] per exercise

    // Workout timer
    this.workoutStartTime      = 0;
    this.setStartTime          = 0;
    this._workoutTimerInterval = null;

    // Wake lock
    this._wakeLock = null;

    // Flash timeout ref
    this._flashTimeout = null;

    // Pending 400ms auto-complete timeout — must be cancellable, otherwise
    // leaving the workout inside that window fires _completeSet() afterwards
    // and pops the RPE overlay on top of the setup screen.
    this._pendingCompleteTimeout = null;

    this._cacheDOM();
    this._populateExercises();
    this._populatePresetPlans();
    this._bindSetup();
    this._bindWorkout();
    this._bindProfileModal();
    this._bindRPEOverlay();
    this._init();
  }

  // ── DOM Cache ────────────────────────────────────────────────────────────

  _cacheDOM() {
    const $ = id => document.getElementById(id);
    this.screens = {
      setup:    $('screen-setup'),
      loading:  $('screen-loading'),
      workout:  $('screen-workout'),
      rest:     $('screen-rest'),
      complete: $('screen-complete'),
      history:  $('screen-history'),
    };
    this.setup = {
      exerciseSelect:        $('exercise-select'),
      setsDisplay:           $('sets-display'),
      repsDisplay:           $('reps-display'),
      btnSetsMinus:          $('btn-sets-minus'),
      btnSetsPlus:           $('btn-sets-plus'),
      btnRepsMinus:          $('btn-reps-minus'),
      btnRepsPlus:           $('btn-reps-plus'),
      restSetsInput:         $('rest-sets-input'),
      btnRestSetsMinus:      $('btn-rest-sets-minus'),
      btnRestSetsPlus:       $('btn-rest-sets-plus'),
      tabSingle:             $('tab-single'),
      tabPlan:               $('tab-plan'),
      panelSingle:           $('panel-single'),
      panelPlan:             $('panel-plan'),
      singleSummary:         $('single-summary'),
      setupCameraHint:       $('setup-camera-hint'),
      planAddExercise:       $('plan-add-exercise'),
      planAddSets:           $('plan-add-sets'),
      planAddReps:           $('plan-add-reps'),
      planAddRest:           $('plan-add-rest'),
      planAddAfter:          $('plan-add-after'),
      planSummaryLine:       $('plan-summary-line'),
      presetName:            $('preset-name'),
      btnSavePreset:         $('btn-save-preset'),
      presetSelect:          $('preset-select'),
      btnDeletePreset:       $('btn-delete-preset'),
      exerciseTips:          $('exercise-tips'),
      btnStart:              $('btn-start'),
      btnAddToPlan:          $('btn-add-to-plan'),
      planList:              $('plan-list'),
      planName:              $('plan-name'),
      btnSavePlan:           $('btn-save-plan'),
      planSelect:            $('plan-select'),
      btnLoadPlan:           $('btn-load-plan'),
      btnDeletePlan:         $('btn-delete-plan'),
      btnStartPlan:          $('btn-start-plan'),
      presetPlanSelect:      $('preset-plan-select'),
      presetPlanDesc:        $('preset-plan-desc'),
      btnLoadPresetPlan:     $('btn-load-preset-plan'),
      btnHistory:            $('btn-history'),
    };
    this.workout = {
      title:            $('workout-title'),
      subtitle:         $('workout-set-subtitle'),
      video:            $('camera-feed'),
      canvas:           $('pose-canvas'),
      angleDisplay:     $('angle-display'),
      qualityBadge:     $('quality-badge'),
      cameraHint:       $('camera-hint'),
      setDisplay:       $('set-display'),
      repDisplay:       $('rep-display'),
      repCount:         $('rep-count'),
      targetRepsDisplay:$('target-reps-display'),
      barOverall:       $('bar-overall'),
      barSet:           $('bar-set'),
      barOverallTrack:  $('bar-overall-track'),
      barSetTrack:      $('bar-set-track'),
      pctOverall:       $('pct-overall'),
      pctSet:           $('pct-set'),
      btnPause:         $('btn-pause'),
      btnNext:          $('btn-next-set'),
      btnBack:          $('btn-back'),
      flashOverlay:     $('flash-overlay'),
      btnAudio:         $('btn-audio-toggle'),
      totalTimer:       $('workout-total-timer'),
      setTimer:         $('workout-set-timer'),
      weightInput:      $('weight-input'),
      btnWeightMinus:   $('btn-weight-minus'),
      btnWeightPlus:    $('btn-weight-plus'),
      leftAngle:        $('left-angle'),
      rightAngle:       $('right-angle'),
      leftChip:         $('bilateral-left'),
      rightChip:        $('bilateral-right'),
      imbalanceWarning: $('imbalance-warning'),
      btnTapCount:      $('btn-tap-count'),
      btnUndoRep:       $('btn-undo-rep'),
      prevSessionHint:  $('prev-session-hint'),
      formGaugeFill:    $('form-gauge-fill'),
      formCoachText:    $('form-coach-text'),
      formPhase:        $('form-phase'),
      formRomLeft:      $('form-rom-left'),
      formRomRight:     $('form-rom-right'),
      cameraWrapper:    document.querySelector('.camera-wrapper'),
    };
    this.rest = {
      setDone:      $('rest-set-done'),
      countdown:    $('rest-countdown'),
      countdownLabel: $('rest-countdown-label'),
      tip:          $('rest-tip'),
      nextExercise: $('rest-next-exercise'),
      btnSkip:      $('btn-skip-rest'),
      btnExtend:    $('btn-rest-extend'),
    };
    this.complete = {
      exerciseName:    $('complete-exercise'),
      totalSets:       $('complete-sets'),
      totalReps:       $('complete-reps'),
      totalVolume:     $('complete-volume'),
      totalTime:       $('complete-time'),
      planTime:        $('complete-plan-time'),
      btnAgain:        $('btn-do-again'),
      btnHome:         $('btn-home'),
      singleStats:     $('complete-single-stats'),
      btnExportFit:    $('btn-export-fit'),
      btnExportTcx:    $('btn-export-tcx'),
      btnStrava:       $('btn-strava-upload'),
      shareHint:       $('share-hint'),
      planStats:       $('complete-plan-stats'),
      planSummaryList: $('plan-summary-list'),
      heading:         document.querySelector('#screen-complete h1'),
    };
    this.historyScreen = {
      list:      $('history-list'),
      btnBack:   $('btn-history-back'),
      btnExport: $('btn-export-history'),
    };
    this.rpeOverlay       = $('rpe-overlay');
    this.loadingMsg       = $('loading-msg');
    this.profileModal     = $('profile-modal');
    this.profileList      = $('profile-list');
    this.profileNameInput = $('profile-name-input');
    this.btnCreateProfile = $('btn-create-profile');
    this.profileIndicator = $('profile-indicator');
    this.btnSwitchProfile    = $('btn-switch-profile');
    this.btnProfileModalClose = $('btn-profile-modal-close');
  }

  // ── Populate UI ──────────────────────────────────────────────────────────

  _populateExercises() {
    // Two independent pickers: one for the single-exercise panel, one inside the
    // plan builder. They used to be the same control, which is what made "+ Add
    // Current Exercise" so confusing — it silently read a dropdown in a
    // different column that the user had set for a different purpose.
    [this.setup.exerciseSelect, this.setup.planAddExercise].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '';
      EXERCISES.forEach(ex => {
        const opt = document.createElement('option');
        opt.value = ex.id;
        opt.textContent = ex.name;
        sel.appendChild(opt);
      });
    });
    this._updateTips();
  }

  _populatePresets() {
    const sel   = this.setup.presetSelect;
    const names = this.wm.list();
    sel.innerHTML = '<option value="">— Load preset —</option>';
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
    // Delete is only valid when a named preset is actually selected
    this.setup.btnDeletePreset.disabled = true;
  }

  _populatePlanSelect() {
    const sel   = this.setup.planSelect;
    const names = this.wpm.list();
    sel.innerHTML = '<option value="">— Load saved plan —</option>';
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
  }

  _populatePresetPlans() {
    const sel = this.setup.presetPlanSelect;
    sel.innerHTML = '<option value="">— Choose a template —</option>';
    PRESET_PLANS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      // Name only. "Name — description" was long enough that the select clipped
      // it mid-word on a phone, so every template read as "PPL – Push Day — Pu…".
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    this._updatePresetPlanDesc();
  }

  // The description the option label no longer has room for, shown in full.
  _updatePresetPlanDesc() {
    const el = this.setup.presetPlanDesc;
    if (!el) return;
    const tpl = PRESET_PLANS.find(p => p.id === this.setup.presetPlanSelect.value);
    if (!tpl) { el.textContent = ''; return; }
    const sets = tpl.plan.reduce((n, it) => n + it.sets, 0);
    el.textContent = `${tpl.description} · ${tpl.plan.length} exercises · ${sets} sets`;
  }

  _updateTips() {
    const ex = EXERCISES.find(e => e.id === this.setup.exerciseSelect.value);
    this.setup.exerciseTips.textContent = ex ? ex.tips : '';
    // Where to put the phone is the first thing that goes wrong for a new user,
    // and until now it was only shown once the workout had already started.
    if (this.setup.setupCameraHint) this.setup.setupCameraHint.textContent = ex?.cameraHint || '';
    this._updateSingleSummary();
  }

  // Plain-language recap under the Start button, so the numbers above are never
  // ambiguous: it spells out what one tap is about to begin.
  _updateSingleSummary() {
    const el = this.setup.singleSummary;
    if (!el) return;
    const ex   = EXERCISES.find(e => e.id === this.setup.exerciseSelect.value);
    const sets = this.targetSets, reps = this.targetReps, rest = this.restBetweenSets;
    if (!ex) { el.textContent = ''; return; }
    const mins = Math.max(1, Math.round((sets * reps * 3 + (sets - 1) * rest) / 60));
    el.textContent = `${sets} × ${reps} reps of ${ex.name}, `
                   + `${rest ? `${rest}s rest between sets` : 'no rest between sets'} · about ${mins} min`;
  }

  // Same idea for the plan panel: total work, in words, before you commit.
  _updatePlanSummary() {
    const el = this.setup.planSummaryLine;
    if (!el) return;
    const plan = this.workoutPlan;
    if (!plan.length) { el.textContent = ''; return; }
    const sets = plan.reduce((n, it) => n + it.sets, 0);
    const secs = plan.reduce((t, it) =>
      t + it.sets * it.reps * 3 + (it.sets - 1) * it.restBetweenSets + (it.restAfterExercise ?? 0), 0);
    el.textContent = `${plan.length} exercise${plan.length !== 1 ? 's' : ''} · ${sets} sets · `
                   + `about ${Math.max(1, Math.round(secs / 60))} min`;
  }

  _renderPlanList() {
    const list = this.setup.planList;
    list.innerHTML = '';

    if (this.workoutPlan.length === 0) {
      list.innerHTML = '<p class="plan-empty">Nothing here yet — load a template above, '
                     + 'or add your first exercise below.</p>';
      this.setup.btnStartPlan.disabled = true;
      this._updatePlanSummary();
      return;
    }

    this.workoutPlan.forEach((item, i) => {
      const ex     = EXERCISES.find(e => e.id === item.exerciseId);
      // Exercise names come from trusted config — escaping as belt-and-suspenders
      const exName = escapeHtml(ex?.name || item.exerciseId);
      const div = document.createElement('div');
      div.className = 'plan-item';
      // Collapsed by default. Rendering four editable fields per exercise made a
      // six-exercise workout roughly 2500px tall on a phone — you could not see
      // your own session without scrolling through it. The row now states what it
      // does in one line and opens for editing on tap.
      div.innerHTML = `
        <button type="button" class="plan-item-head" data-action="toggle" data-idx="${i}"
                aria-expanded="false" aria-controls="plan-edit-${i}">
          <span class="plan-item-num">${i + 1}</span>
          <span class="plan-item-info">
            <span class="plan-item-name">${exName}</span>
            <span class="plan-item-recap">${this._planItemRecap(item)}</span>
          </span>
          <span class="plan-item-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="plan-item-edit" id="plan-edit-${i}" hidden>
          <div class="plan-add-fields">
            <label class="plan-field-label">Sets
              <input type="number" class="plan-field-input" data-field="sets" data-idx="${i}" min="1" max="20" value="${item.sets}" inputmode="numeric" />
            </label>
            <label class="plan-field-label">Reps
              <input type="number" class="plan-field-input" data-field="reps" data-idx="${i}" min="1" max="50" value="${item.reps}" inputmode="numeric" />
            </label>
            <label class="plan-field-label">Rest&nbsp;(s)
              <input type="number" class="plan-field-input" data-field="restBetweenSets" data-idx="${i}" min="0" max="300" value="${item.restBetweenSets}" inputmode="numeric" />
            </label>
            <label class="plan-field-label">After&nbsp;(s)
              <input type="number" class="plan-field-input" data-field="restAfterExercise" data-idx="${i}" min="0" max="300" value="${item.restAfterExercise ?? 60}" inputmode="numeric" />
            </label>
          </div>
          <div class="plan-item-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="up"   data-idx="${i}"
                    aria-label="Move ${exName} earlier">↑ Up</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="down" data-idx="${i}"
                    aria-label="Move ${exName} later">↓ Down</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="remove"  data-idx="${i}"
                    aria-label="Remove ${exName} from the workout">✕ Remove</button>
          </div>
        </div>
      `;
      list.appendChild(div);
    });

    list.querySelectorAll('.plan-field-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx   = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        let val = parseInt(input.value) || 0;
        if      (field === 'sets')             val = Math.min(20,  Math.max(1,  val));
        else if (field === 'reps')             val = Math.min(50,  Math.max(1,  val));
        else if (field === 'restBetweenSets')  val = Math.min(300, Math.max(0,  val));
        else if (field === 'restAfterExercise')val = Math.min(300, Math.max(0,  val));
        input.value = val;
        this.workoutPlan[idx][field] = val;
        // Keep the collapsed one-liner truthful without re-rendering the list,
        // which would collapse the row the user is still editing.
        const recap = list.querySelector(`.plan-item-head[data-idx="${idx}"] .plan-item-recap`);
        if (recap) recap.textContent = this._planItemRecap(this.workoutPlan[idx]);
        this._updatePlanSummary();
      });
    });

    list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const idx    = parseInt(btn.dataset.idx);
        if (action === 'toggle') {
          const panel = list.querySelector(`#plan-edit-${idx}`);
          if (!panel) return;
          const open = panel.hidden;
          panel.hidden = !open;
          btn.setAttribute('aria-expanded', String(open));
          btn.classList.toggle('open', open);
        } else if (action === 'up' && idx > 0) {
          [this.workoutPlan[idx], this.workoutPlan[idx - 1]] = [this.workoutPlan[idx - 1], this.workoutPlan[idx]];
          this._renderPlanList();
        } else if (action === 'down' && idx < this.workoutPlan.length - 1) {
          [this.workoutPlan[idx], this.workoutPlan[idx + 1]] = [this.workoutPlan[idx + 1], this.workoutPlan[idx]];
          this._renderPlanList();
        } else if (action === 'remove') {
          this.workoutPlan.splice(idx, 1);
          this._renderPlanList();
        }
      });
    });

    this.setup.btnStartPlan.disabled = false;
    this._updatePlanSummary();
  }

  // One honest sentence per plan row, so the collapsed list is still readable.
  _planItemRecap(item) {
    const after = item.restAfterExercise ?? 60;
    return `${item.sets} sets × ${item.reps} reps · ${item.restBetweenSets}s rest`
         + (after ? ` · ${after}s after` : '');
  }

  // ── Profile Modal ────────────────────────────────────────────────────────

  _bindProfileModal() {
    this.btnCreateProfile.addEventListener('click', () => {
      const name = this.profileNameInput.value.trim();
      if (!name) { this.profileNameInput.focus(); return; }
      this.profiles.create(name);
      this.profileNameInput.value = '';
      this._applyActiveProfile();
      this._hideProfileModal();
      this._toast(`Profile "${name}" selected!`);
    });

    this.profileNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.btnCreateProfile.click();
    });

    this.btnSwitchProfile.addEventListener('click', () => this._showProfileModal());

    // Close modal via × button or clicking the backdrop — only when a profile is active
    if (this.btnProfileModalClose) {
      this.btnProfileModalClose.addEventListener('click', () => this._hideProfileModal());
    }
    this.profileModal.addEventListener('click', e => {
      // Backdrop dismiss only once a profile exists — during first-run
      // onboarding this used to drop the user into an unnamed profile.
      if (e.target === this.profileModal && this.profiles.getActive()) {
        this._hideProfileModal();
      }
    });
  }

  _showProfileModal() {
    this._profileReturnFocus = document.activeElement;
    this._renderProfileList();
    // Show close button only when a profile is already active (user is switching, not onboarding)
    const hasActive = !!this.profiles.getActive();
    if (this.btnProfileModalClose) this.btnProfileModalClose.classList.toggle('visible', hasActive);
    this.profileModal.classList.add('active');
    this.profileNameInput.focus();
  }

  _hideProfileModal() {
    this.profileModal.classList.remove('active');
    if (this._profileReturnFocus?.isConnected) this._profileReturnFocus.focus();
    this._profileReturnFocus = null;
  }

  _renderProfileList() {
    const names  = this.profiles.list();
    const active = this.profiles.getActive();
    this.profileList.innerHTML = '';

    if (names.length === 0) {
      this.profileList.innerHTML = '<p class="profile-empty">No profiles yet — create one below.</p>';
      return;
    }

    names.forEach(name => {
      const safeName = escapeHtml(name);
      const div = document.createElement('div');
      div.className = 'profile-item' + (name === active ? ' active' : '');
      // FIX: user-controlled name escaped before insertion into innerHTML
      div.innerHTML = `
        <span class="profile-item-name">${safeName}</span>
        <div class="profile-item-actions">
          <button class="btn btn-secondary btn-inline" style="padding:11px 14px; font-size:.85rem;"
                  aria-label="Use profile ${safeName}">Select</button>
          <button class="btn-icon danger" title="Delete profile"
                  aria-label="Delete profile ${safeName}">✕</button>
        </div>
      `;
      // Use DOM methods for event binding — avoids data-attribute XSS vectors
      div.querySelector('.btn-secondary').addEventListener('click', () => {
        this.profiles.setActive(name);
        this._applyActiveProfile();
        this._hideProfileModal();
        this._toast(`Profile "${name}" selected!`);
      });
      div.querySelector('.btn-icon.danger').addEventListener('click', () => {
        if (!confirm(`Delete profile "${name}"? This does NOT delete your workout data.`)) return;
        this.profiles.delete(name);
        if (!this.profiles.getActive()) this._applyActiveProfile();
        this._renderProfileList();
      });
      this.profileList.appendChild(div);
    });
  }

  _applyActiveProfile() {
    const active = this.profiles.getActive();
    const ns     = active ? this.profiles.namespace(active) : '';
    this.wm.setNamespace(ns);
    this.wpm.setNamespace(ns);
    this.history.setNamespace(ns);
    this.weightMemory.setNamespace(ns);
    this.profileIndicator.textContent = active ? `👤 ${active}` : '';
    this._populatePresets();
    this._populatePlanSelect();
    this.workoutPlan = [];
    this._renderPlanList();
  }

  // ── RPE Overlay ──────────────────────────────────────────────────────────

  _bindRPEOverlay() {
    this.rpeOverlay.querySelectorAll('.rpe-btn').forEach(btn => {
      btn.addEventListener('click', () => this._onRPESelected(parseInt(btn.dataset.rpe)));
    });
    const skip = this.rpeOverlay.querySelector('.rpe-skip');
    if (skip) skip.addEventListener('click', () => this._onRPESelected(null));

    // Escape is the universal "get me out of this dialog" key and neither
    // overlay honoured it. The profile modal only closes when a profile already
    // exists — the same rule its ✕ button follows.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (this.rpeOverlay.classList.contains('active')) {
        e.preventDefault();
        this._onRPESelected(null);
      } else if (this.profileModal.classList.contains('active') && this.profiles.getActive()) {
        e.preventDefault();
        this._hideProfileModal();
      }
    });
  }

  _showRPEPrompt(setNum, totalSets) {
    const heading = this.rpeOverlay.querySelector('.rpe-title');
    if (heading) heading.textContent = `Set ${setNum} of ${totalSets} — How hard was that?`;
    this.rpeOverlay.classList.add('active');
    // Without this, an opaque sheet covers the screen while focus is still on a
    // button behind it: Tab walks invisible controls and there is no way out.
    this._rpeReturnFocus = document.activeElement;
    this.rpeOverlay.querySelector('.rpe-btn')?.focus();
  }

  _onRPESelected(rpe) {
    this.rpeOverlay.classList.remove('active');
    if (this._rpeReturnFocus?.isConnected) this._rpeReturnFocus.focus();
    this._rpeReturnFocus = null;
    if (this.currentExerciseSetData.length > 0) {
      this.currentExerciseSetData[this.currentExerciseSetData.length - 1].rpe = rpe;
    }
    this._proceedAfterSet();
  }

  // ── Bind Events: Setup ───────────────────────────────────────────────────

  _bindSetup() {
    const s = this.setup;
    const clampRest = v => Math.min(300, Math.max(0, parseInt(v) || 0));

    s.exerciseSelect.addEventListener('change', () => this._updateTips());

    // Every setup control ends by refreshing the plain-language recap, so the
    // numbers on screen and the sentence under the button can never disagree.
    const sync = () => this._updateSingleSummary();

    s.btnSetsMinus.addEventListener('click', () => { this.targetSets = Math.max(1,  this.targetSets - 1); s.setsDisplay.value = this.targetSets; sync(); });
    s.btnSetsPlus .addEventListener('click', () => { this.targetSets = Math.min(20, this.targetSets + 1); s.setsDisplay.value = this.targetSets; sync(); });
    s.setsDisplay .addEventListener('change',() => { this.targetSets = Math.min(20, Math.max(1, parseInt(s.setsDisplay.value) || 1)); s.setsDisplay.value = this.targetSets; sync(); });

    s.btnRepsMinus.addEventListener('click', () => { this.targetReps = Math.max(1,  this.targetReps - 1); s.repsDisplay.value = this.targetReps; sync(); });
    s.btnRepsPlus .addEventListener('click', () => { this.targetReps = Math.min(50, this.targetReps + 1); s.repsDisplay.value = this.targetReps; sync(); });
    s.repsDisplay .addEventListener('change',() => { this.targetReps = Math.min(50, Math.max(1, parseInt(s.repsDisplay.value) || 1)); s.repsDisplay.value = this.targetReps; sync(); });

    s.btnRestSetsMinus.addEventListener('click', () => { this.restBetweenSets = clampRest(this.restBetweenSets - 10); s.restSetsInput.value = this.restBetweenSets; sync(); });
    s.btnRestSetsPlus .addEventListener('click', () => { this.restBetweenSets = clampRest(this.restBetweenSets + 10); s.restSetsInput.value = this.restBetweenSets; sync(); });
    s.restSetsInput   .addEventListener('change',() => { this.restBetweenSets = clampRest(s.restSetsInput.value);   s.restSetsInput.value = this.restBetweenSets; sync(); });

    // Mode tabs — the first and most important decision on the screen
    s.tabSingle.addEventListener('click', () => this._setMode('single'));
    s.tabPlan  .addEventListener('click', () => this._setMode('plan'));
    [s.tabSingle, s.tabPlan].forEach(tab => {
      tab.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        this._setMode(this._mode === 'single' ? 'plan' : 'single', true);
      });
    });

    s.btnSavePreset.addEventListener('click', () => {
      const name = s.presetName.value.trim();
      if (!name) { s.presetName.focus(); return; }
      this.wm.save(name, { exerciseId: s.exerciseSelect.value, sets: this.targetSets, reps: this.targetReps, restBetweenSets: this.restBetweenSets });
      this._populatePresets();
      s.presetName.value = '';
      this._toast('Preset saved!');
    });

    s.presetSelect.addEventListener('change', () => {
      const name   = s.presetSelect.value;
      const preset = this.wm.get(name);
      // Sync delete button: disabled when placeholder ("") is selected
      s.btnDeletePreset.disabled = !name;
      if (!preset) return;
      s.exerciseSelect.value = preset.exerciseId;
      this.targetSets        = preset.sets;
      this.targetReps        = preset.reps;
      this.restBetweenSets   = preset.restBetweenSets ?? DEFAULT_REST_BETWEEN_SETS;
      s.setsDisplay.value    = this.targetSets;
      s.repsDisplay.value    = this.targetReps;
      s.restSetsInput.value  = this.restBetweenSets;
      this._updateTips();          // also refreshes the recap line
      this._toast(`Loaded: ${name}`);
    });

    s.btnDeletePreset.addEventListener('click', () => {
      const name = s.presetSelect.value;
      if (!name) return;
      this.wm.delete(name);
      this._populatePresets();
      this._toast('Preset deleted');
    });

    s.presetPlanSelect.addEventListener('change', () => this._updatePresetPlanDesc());

    s.btnLoadPresetPlan.addEventListener('click', () => {
      const id = s.presetPlanSelect.value;
      if (!id) return;
      const template = PRESET_PLANS.find(p => p.id === id);
      if (!template) return;
      this.workoutPlan      = template.plan.map(item => ({ ...item }));
      this._activePlanName  = template.name;
      this._renderPlanList();
      this._toast(`"${template.name}" loaded — ${template.plan.length} exercises`);
    });

    s.btnAddToPlan.addEventListener('click', () => {
      // Reads the plan builder's OWN fields. Previously it copied whatever was
      // set in the single-exercise column, an invisible dependency that made the
      // resulting plan item look arbitrary.
      const num = (el, lo, hi, dflt) => {
        const n = parseInt(el?.value, 10);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
      };
      const exerciseId = s.planAddExercise.value;
      const ex = EXERCISES.find(e => e.id === exerciseId);
      if (!ex) return;
      this.workoutPlan.push({
        exerciseId,
        sets:              num(s.planAddSets,  1, 20,  3),
        reps:              num(s.planAddReps,  1, 50,  12),
        restBetweenSets:   num(s.planAddRest,  0, 300, DEFAULT_REST_BETWEEN_SETS),
        restAfterExercise: num(s.planAddAfter, 0, 300, 60),
      });
      this._renderPlanList();
      this._toast(`${ex.name} added`);
    });

    s.btnSavePlan.addEventListener('click', () => {
      const name = s.planName.value.trim();
      if (!name) { s.planName.focus(); return; }
      if (this.workoutPlan.length === 0) { this._toast('Plan is empty!'); return; }
      this.wpm.save(name, this.workoutPlan);
      this._activePlanName = name;
      this._populatePlanSelect();
      s.planName.value = '';
      this._toast('Plan saved!');
    });

    s.btnLoadPlan.addEventListener('click', () => {
      const name = s.planSelect.value;
      if (!name) return;
      // Sanitised on load: a plan saved by an older build (or holding an
      // exercise that no longer exists) used to reach _startWorkout intact and
      // build a RepCounter with no exercise, giving an unfinishable set.
      const plan = this.wpm.getSanitised(name);
      if (!plan.length) { this._toast('That plan has no usable exercises'); return; }
      this.workoutPlan     = plan;
      this._activePlanName = name;
      this._setMode('plan');
      this._renderPlanList();
      this._toast(`"${name}" loaded — ${plan.length} exercise${plan.length !== 1 ? 's' : ''}`);
    });

    s.btnDeletePlan.addEventListener('click', () => {
      const name = s.planSelect.value;
      if (!name) return;
      this.wpm.delete(name);
      this._populatePlanSelect();
      this._toast('Plan deleted');
    });

    s.btnStartPlan.addEventListener('click', () => { if (this.workoutPlan.length) this._startWorkout(true); });
    s.btnStart    .addEventListener('click', () => this._startWorkout(false));

    if (s.btnHistory) s.btnHistory.addEventListener('click', () => this._showHistoryScreen());
  }

  // Switches the setup screen between the two workflows. They are deliberately
  // mutually exclusive: showing both at once is what made it impossible to tell
  // which controls belonged to which kind of workout.
  _setMode(mode, focusTab = false) {
    this._mode = mode;
    const single = mode === 'single';
    const s = this.setup;
    s.tabSingle.classList.toggle('active', single);
    s.tabPlan  .classList.toggle('active', !single);
    s.tabSingle.setAttribute('aria-selected', String(single));
    s.tabPlan  .setAttribute('aria-selected', String(!single));
    s.tabSingle.tabIndex = single ? 0 : -1;
    s.tabPlan  .tabIndex = single ? -1 : 0;
    s.panelSingle.hidden = !single;
    s.panelPlan  .hidden = single;
    if (focusTab) (single ? s.tabSingle : s.tabPlan).focus();
  }

  // ── Bind Events: Workout ─────────────────────────────────────────────────

  _bindWorkout() {
    const w = this.workout;

    w.btnBack.addEventListener('click', () => {
      if (confirm('End workout and return to setup?')) this._goSetup();
    });

    w.btnPause.addEventListener('click', () => {
      if (this.isPaused) {
        this.isPaused = false;
        w.btnPause.textContent = '⏸ Pause';
        this._acquireWakeLock();
        this._loop();
      } else {
        this.isPaused = true;
        w.btnPause.textContent = '▶ Resume';
        cancelAnimationFrame(this.animationId);
        this._releaseWakeLock();
      }
    });

    // FIX: guard prevents double-call when auto-complete 400ms timeout is in flight
    w.btnNext.addEventListener('click', () => {
      if (this._setCompleting) return;
      this._completeSet();
    });

    w.btnAudio.addEventListener('click', () => this._setAudioButton(this.audio.toggle()));

    // Tap-to-count: manual rep fallback when camera is unreliable
    w.btnTapCount.addEventListener('click', () => {
      if (!this.isRunning || this.isPaused || this._setCompleting) return;
      const result = this.counter.manualRep();
      this._updateCountUI(result);
      this._flashRep();
      this.audio.playRep();
      if (result.reps >= this.targetReps) {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        clearTimeout(this._pendingCompleteTimeout);
        this._pendingCompleteTimeout = setTimeout(() => this._completeSet(), 400);
      }
    });

    // Undo last rep — removes one miscount, disables itself at 0
    if (w.btnUndoRep) {
      w.btnUndoRep.addEventListener('click', () => {
        if (!this.isRunning || this.isPaused || this._setCompleting) return;
        if (this.counter.reps <= 0) return;
        const result = this.counter.undoRep();
        this._updateCountUI(result);
      });
    }

    // 'input' keeps the live value in sync; persistence waits for 'change'
    // (blur / Enter) so typing "12.5" doesn't store 1, then 12, then 12.5.
    w.weightInput.addEventListener('input', () => {
      this.currentSetWeight = parseFloat(w.weightInput.value) || 0;
    });
    w.weightInput.addEventListener('change', () => {
      const val = Math.min(200, Math.max(0, parseFloat(w.weightInput.value) || 0));
      w.weightInput.value   = val || '';
      this.currentSetWeight = val;
      if (val > 0) this.weightMemory.set(this.exerciseId, val);
    });

    // Weight stepper buttons — ±2.5 kg per tap, no keyboard needed mid-exercise
    if (w.btnWeightMinus) {
      w.btnWeightMinus.addEventListener('click', () => {
        const cur = parseFloat(w.weightInput.value) || 0;
        const next = Math.max(0, Math.round((cur - 2.5) * 10) / 10);
        w.weightInput.value = next || '';
        this.currentSetWeight = next;
        if (next > 0) this.weightMemory.set(this.exerciseId, next);
      });
    }
    if (w.btnWeightPlus) {
      w.btnWeightPlus.addEventListener('click', () => {
        const cur = parseFloat(w.weightInput.value) || 0;
        // Clamped to the same 200 kg ceiling the input itself declares — the
        // stepper used to walk straight past it.
        const next = Math.min(200, Math.round((cur + 2.5) * 10) / 10);
        w.weightInput.value = next;
        this.currentSetWeight = next;
        this.weightMemory.set(this.exerciseId, next);
      });
    }

    this.rest.btnSkip.addEventListener('click', () => this._endRest());

    // Extend rest by 30 s — also grow restTotal so the ring arc stays consistent
    if (this.rest.btnExtend) {
      this.rest.btnExtend.addEventListener('click', () => {
        this.restRemaining = Math.min(this.restRemaining + 30, 300);
        this.restTotal     = Math.max(this.restTotal, this.restRemaining);
        this._renderCountdown();
        this._updateRestRing(this.restRemaining, this.restTotal);
      });
    }

    if (this.complete.btnExportFit) {
      this.complete.btnExportFit.addEventListener('click', () => this._exportSession('fit'));
    }
    if (this.complete.btnExportTcx) {
      this.complete.btnExportTcx.addEventListener('click', () => this._exportSession('tcx'));
    }
    if (this.complete.btnStrava) {
      this.complete.btnStrava.addEventListener('click', () => this._sendToStrava());
    }

    this.complete.btnAgain.addEventListener('click', () => this._startWorkout(this.isRunningPlan));
    this.complete.btnHome .addEventListener('click', () => this._goSetup());

    if (this.historyScreen.btnBack) {
      this.historyScreen.btnBack.addEventListener('click', () => this._showScreen('setup'));
    }

    if (this.historyScreen.btnExport) {
      this.historyScreen.btnExport.addEventListener('click', () => this._exportHistory());
    }

    // Re-acquire wake lock if page becomes visible (wake lock is auto-released on hide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isRunning && !this.isPaused) {
        this._acquireWakeLock();
      }
    });
  }

  // The glyph alone carried the on/off state, which told a screen-reader user
  // nothing — and the beep is the only rep confirmation you get with the phone
  // propped up at arm's length.
  _setAudioButton(enabled) {
    const b = this.workout.btnAudio;
    if (!b) return;
    b.textContent = enabled ? '🔔' : '🔕';
    b.title       = enabled ? 'Mute beep sound' : 'Enable beep sound';
    b.setAttribute('aria-pressed', String(enabled));
  }

  // ── Wake Lock ────────────────────────────────────────────────────────────

  async _acquireWakeLock() {
    // visibilitychange can fire repeatedly; without these guards every return to
    // the tab requested a fresh sentinel and dropped the previous one on the
    // floor, so nothing was ever released.
    if (!('wakeLock' in navigator) || this._wakeLock || this._wakeLockPending) return;
    this._wakeLockPending = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        if (this._wakeLock === sentinel) this._wakeLock = null;
      });
      // Released while the request was still in flight (user left the workout)
      if (!this.isRunning) { sentinel.release().catch(() => {}); return; }
      this._wakeLock = sentinel;
    } catch (_) {
      this._wakeLock = null;
    } finally {
      this._wakeLockPending = false;
    }
  }

  _releaseWakeLock() {
    if (this._wakeLock) { this._wakeLock.release().catch(() => {}); this._wakeLock = null; }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async _init() {
    this._setMode('single');
    this._setAudioButton(this.audio.enabled);
    // If we came back from Strava's consent page, swap the code for tokens
    // before doing anything else, so the URL is clean either way.
    try { await this.strava.completeAuth(); } catch (err) { console.warn(err.message); }

    // Always apply the profile namespaces — with no profile yet this resolves to
    // the default keys and, crucially, still populates the preset/plan selects
    // and renders the empty-plan message. Skipping it on first run left the
    // setup screen with blank dropdowns and an enabled "delete preset" button.
    this._applyActiveProfile();
    if (!this.profiles.getActive()) this._showProfileModal();
    this._showScreen('setup');
  }

  // ── Start workout ────────────────────────────────────────────────────────

  async _startWorkout(isPlan = false) {
    this.isRunningPlan   = isPlan;
    this._activePlanName = isPlan ? (this._activePlanName || 'Custom Plan') : null;

    if (isPlan) {
      // Every item is validated here too: "Do Again" and template loads both
      // re-enter through this path, and one bad item breaks the whole session.
      this.workoutPlan = this.workoutPlan.filter(
        it => it && EXERCISES.some(e => e.id === it.exerciseId));
      if (!this.workoutPlan.length) {
        this._toast('Plan has no valid exercises');
        this._showScreen('setup');
        return;
      }
      this.planIndex   = 0;
      this.planResults = [];
      const item           = this.workoutPlan[0];
      this.exerciseId      = item.exerciseId;
      this.targetSets      = item.sets;
      this.targetReps      = item.reps;
      this.restBetweenSets = item.restBetweenSets;
    } else {
      this.exerciseId           = this.setup.exerciseSelect.value;
      this.targetSets           = Math.min(20, Math.max(1,   parseInt(this.setup.setsDisplay.value)    || 1));
      this.targetReps           = Math.min(50, Math.max(1,   parseInt(this.setup.repsDisplay.value)    || 1));
      this.restBetweenSets      = Math.min(300, Math.max(0,  parseInt(this.setup.restSetsInput.value)  || 0));
      // Rest between exercises is a per-plan-item value now (restAfterExercise);
      // this only survives as the fallback for a plan item that omits it.
    }

    this.currentSet             = 1;
    this._isExerciseTransition  = false;
    this._setCompleting         = false;
    this.currentExerciseSetData = [];
    this.currentSetWeight       = 0;
    this.counter                = new RepCounter(this.exerciseId);

    if (this.workout.weightInput) this.workout.weightInput.value = '';

    const rememberedWeight = this.weightMemory.get(this.exerciseId);
    if (this.workout.weightInput) {
      this.workout.weightInput.value = rememberedWeight > 0 ? rememberedWeight : '';
    }
    this.currentSetWeight = rememberedWeight;

    this.workoutStartTime = Date.now();
    this.setStartTime     = Date.now();
    clearInterval(this._workoutTimerInterval);
    this._workoutTimerInterval = setInterval(() => this._updateTimerDisplays(), 1000);

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
      await this._waitForVideoMetadata(video);
      await video.play();
      // The wrapper is hard-coded 4/3 in CSS while the camera only gets 640x480
      // as a hint. If it hands back 16:9, object-fit:cover crops the video but
      // the canvas stretches — the skeleton drifts off the body. Pin the
      // wrapper to whatever aspect the camera actually produced.
      this._syncCameraAspect();
    } catch (err) {
      // err.message for a denied permission is "Permission denied" — true and
      // useless. Say what went wrong and what fixes it.
      const byName = {
        NotAllowedError:    'Camera access was blocked. Allow the camera for this page in your browser settings, then try again.',
        NotFoundError:      'No camera found on this device.',
        NotReadableError:   'The camera is already in use by another app. Close it and try again.',
        OverconstrainedError: 'This camera cannot provide the requested video format.',
        SecurityError:      'The browser blocked the camera. A camera only works over https:// or on localhost.',
      };
      alert(byName[err.name] || ('Could not start camera: ' + err.message));
      clearInterval(this._workoutTimerInterval);
      this._showScreen('setup');
      return;
    }

    this._showScreen('workout');
    this._updateWorkoutUI();
    this.isRunning   = true;
    this.isPaused    = false;
    this._processing = false;
    this.workout.btnPause.textContent = '⏸ Pause';
    await this._acquireWakeLock();
    this._loop();
  }

  // Waits until the camera reports real dimensions.
  //
  // Resolving on `loadedmetadata` alone is a deadlock waiting to happen: if the
  // stream is ready before the listener is attached the event has already been
  // dispatched, nothing ever resolves, and the app sits on the loading screen
  // forever with no error and no way back. The current readyState is checked
  // first, and a timeout backstops both paths — a camera that never reports
  // metadata should still let the workout start rather than hang.
  _waitForVideoMetadata(video, timeoutMs = 8000) {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      video.addEventListener('loadedmetadata', finish);
    });
  }

  _syncCameraAspect() {
    const video   = this.workout.video;
    const wrapper = video?.parentElement;
    if (!wrapper || !video.videoWidth || !video.videoHeight) return;
    wrapper.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  }

  // ── Detection loop ───────────────────────────────────────────────────────

  _loop() {
    if (!this.isRunning || this.isPaused) return;
    this.animationId = requestAnimationFrame(() => this._tick());
  }

  async _tick() {
    if (!this.isRunning || this.isPaused) return;
    if (this._processing) { this._loop(); return; } // skip frame, prev inference still running
    this._processing = true;

    try {
      const pose = await this.detector.detect(this.workout.video);
      this.detector.drawSkeleton(this.workout.canvas, this.workout.video, pose,
                                 this.exerciseId, this._lastFormColor || '#ef4444');

      if (pose) {
        const result = this.counter.update(pose, this.detector);
        this._updateCountUI(result);

        if (result.counted) {
          this._flashRep();
          this.audio.playRep();
          if (result.reps >= this.targetReps) {
            // Stop the loop immediately — prevents any more ticks during the 400ms delay
            this.isRunning   = false;
            this._processing = false;
            cancelAnimationFrame(this.animationId);
            clearTimeout(this._pendingCompleteTimeout);
            this._pendingCompleteTimeout = setTimeout(() => this._completeSet(), 400);
            return;
          }
        }
      }
      this._detectFailures = 0;
    } catch (err) {
      // A single bad frame — a lost WebGL context, a camera stall, a model
      // hiccup — must not end the session. Before this catch existed the
      // rejection escaped _tick(), the trailing _loop() below never ran, and
      // the counter froze for good with nothing on screen to say why.
      console.error('Detection frame failed:', err);
      this._detectFailures = (this._detectFailures || 0) + 1;
      if (this._detectFailures === 5) {
        this._toast('Camera detection is struggling — use 👆 +1 Rep if it stalls');
      }
    } finally {
      this._processing = false;
    }

    this._loop();
  }

  // ── Timers ───────────────────────────────────────────────────────────────

  _updateTimerDisplays() {
    const total = Math.round((Date.now() - this.workoutStartTime) / 1000);
    const set   = Math.round((Date.now() - this.setStartTime)     / 1000);
    if (this.workout.totalTimer) this.workout.totalTimer.textContent = this._fmtTime(total);
    if (this.workout.setTimer)   this.workout.setTimer.textContent   = this._fmtTime(set);
  }

  _fmtTime(secs) {
    return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
  }

  _stopTimers() {
    clearInterval(this._workoutTimerInterval);
    this._workoutTimerInterval = null;
  }

  // ── Set completion flow ──────────────────────────────────────────────────

  _completeSet() {
    // FIX: Guard against double-call (auto-complete timeout + user clicking "Next Set")
    if (this._setCompleting) return;
    this._setCompleting = true;

    cancelAnimationFrame(this.animationId);
    this.isRunning = false;

    const setDuration = Math.round((Date.now() - this.setStartTime) / 1000);

    this.currentExerciseSetData.push({
      reps:     this.counter.reps,
      weight:   this.currentSetWeight,
      rpe:      null,           // filled in by RPE prompt
      duration: setDuration,
    });

    this._showRPEPrompt(this.currentSet, this.targetSets);
  }

  _proceedAfterSet() {
    // _setCompleting is intentionally kept true until the NEXT set actively begins,
    // so that stray button presses during rest cannot re-trigger completion.
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
    this.rest.setDone.textContent        = `Set ${this.currentSet} of ${this.targetSets} complete! ✓`;
    const nextSet = this.currentSet + 1;
    const isLast  = nextSet >= this.targetSets;
    this.rest.tip.textContent = isLast
      ? `Last set coming — ${this.targetReps} reps · Give it everything!`
      : `Up next: Set ${nextSet} of ${this.targetSets} · ${this.targetReps} reps`;
    this.rest.nextExercise.style.display = 'none';
    this._startRest(this.restBetweenSets);
  }

  _showExerciseTransition() {
    this._recordPlanResult();
    const nextItem = this.workoutPlan[this.planIndex + 1];
    const nextEx   = EXERCISES.find(e => e.id === nextItem.exerciseId);
    const duration = this.workoutPlan[this.planIndex].restAfterExercise ?? this.restBetweenExercises;

    this.rest.setDone.textContent   = `Exercise ${this.planIndex + 1} / ${this.workoutPlan.length} complete!`;
    this.rest.tip.textContent       = 'Prepare for the next exercise!';
    this.rest.nextExercise.textContent = `Up next: ${nextEx?.name || nextItem.exerciseId}`;
    this.rest.nextExercise.style.display = '';
    this._isExerciseTransition = true;
    this._startRest(duration);
  }

  _startRest(totalSeconds) {
    clearInterval(this.restTimer);
    this.restRemaining = totalSeconds;
    this.restTotal     = totalSeconds;   // mutable total — updated when user presses +30s
    this._renderCountdown();
    this._updateRestRing(totalSeconds, totalSeconds);
    this._showScreen('rest');

    this._restEnding = false;
    if (totalSeconds <= 0) {
      clearTimeout(this._zeroRestTimeout);
      this._zeroRestTimeout = setTimeout(() => this._endRest(), 300);
      return;
    }

    this.restTimer = setInterval(() => {
      this.restRemaining--;
      this._renderCountdown();
      this._updateRestRing(this.restRemaining, this.restTotal); // use instance var, not closure
      if (this.restRemaining > 0 && this.restRemaining <= 3) this.audio.playCountdown();
      if (this.restRemaining <= 0) this._endRest();
    }, 1000);
  }

  // A 180 s rest (the 5×5 template) used to render as the bare number "180"
  // under the word "seconds" — technically true, unreadable at a glance.
  _renderCountdown() {
    const secs = Math.max(0, this.restRemaining);
    const big  = secs >= 60;
    this.rest.countdown.textContent = big
      ? `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`
      : secs;
    if (this.rest.countdownLabel) this.rest.countdownLabel.textContent = big ? 'min : sec' : 'seconds';
  }

  _updateRestRing(remaining, total) {
    const ring = document.getElementById('rest-ring-progress');
    if (!ring) return;
    const offset = total > 0 ? 326.73 * (1 - remaining / total) : 0;
    ring.style.strokeDashoffset = offset;
  }

  _endRest() {
    // Re-entrancy guard: Skip Rest, the 1s interval hitting 0 and the
    // zero-length-rest timeout can all land in the same tick. Without this
    // the set counter advances twice (or an exercise is skipped entirely).
    if (this._restEnding) return;
    this._restEnding = true;

    clearInterval(this.restTimer);
    this.restTimer = null;
    clearTimeout(this._zeroRestTimeout);
    this._zeroRestTimeout = null;
    this.rest.nextExercise.style.display = 'none';
    this.audio.playRestEnd();

    if (this._isExerciseTransition) {
      this._isExerciseTransition = false;
      this._loadNextPlanExercise();
    } else {
      this.currentSet++;
      this.setStartTime   = Date.now();
      this._setCompleting = false;  // FIX: reset guard so next set can complete normally
      this.counter.reset();
      this._showScreen('workout');
      this._updateWorkoutUI();
      this.isRunning   = true;
      this.isPaused    = false;
      this._processing = false;
      this.workout.btnPause.textContent = '⏸ Pause';
      this._acquireWakeLock();
      this._loop();
    }
  }

  _loadNextPlanExercise() {
    this.planIndex++;
    const item           = this.workoutPlan[this.planIndex];
    this.exerciseId      = item.exerciseId;
    this.targetSets      = item.sets;
    this.targetReps      = item.reps;
    this.restBetweenSets = item.restBetweenSets;
    this.currentSet      = 1;
    this.setStartTime    = Date.now();
    this._setCompleting         = false;  // FIX: reset guard for new exercise
    this.currentExerciseSetData = [];
    // Pre-fill remembered weight for new exercise — falls back to 0 if none stored
    const nextWeight = this.weightMemory.get(this.exerciseId);
    this.currentSetWeight = nextWeight;
    if (this.workout.weightInput) this.workout.weightInput.value = nextWeight > 0 ? nextWeight : '';
    this.counter = new RepCounter(this.exerciseId);

    this._showScreen('workout');
    this._updateWorkoutUI();
    this.isRunning   = true;
    this.isPaused    = false;
    this._processing = false;
    this.workout.btnPause.textContent = '⏸ Pause';
    this._acquireWakeLock();
    this._loop();
  }

  _recordPlanResult() {
    const item = this.workoutPlan[this.planIndex];
    const ex   = EXERCISES.find(e => e.id === item.exerciseId);
    // FIX: use actual set data instead of (sets-1)*targetReps + counter.reps,
    // which incorrectly assumes all previous sets hit exact target reps.
    const totalReps = this.currentExerciseSetData.reduce((sum, d) => sum + d.reps, 0);
    this.planResults.push({
      exerciseId:   item.exerciseId,
      exerciseName: ex?.name || item.exerciseId,
      // Sets actually performed — a workout ended early via "Finish" used to
      // be recorded as if every planned set had been completed.
      sets:         this.currentExerciseSetData.length || this.targetSets,
      totalReps,
      setData:      [...this.currentExerciseSetData],
    });
  }

  _showComplete() {
    this._stopTimers();
    this._stopCamera();
    this._releaseWakeLock();

    const totalSecs = Math.round((Date.now() - this.workoutStartTime) / 1000);

    if (this.isRunningPlan) {
      this._recordPlanResult();
      this._lastSessionEntry = this.history.add({
        planName: this._activePlanName, exercises: this.planResults, totalDuration: totalSecs });
    } else {
      const ex        = EXERCISES.find(e => e.id === this.exerciseId);
      // FIX: use actual set data for accurate total
      const totalReps = this.currentExerciseSetData.reduce((sum, d) => sum + d.reps, 0);
      this._lastSessionEntry = this.history.add({
        planName: null,
        exercises: [{
          exerciseId:   this.exerciseId,
          exerciseName: ex?.name || this.exerciseId,
          sets:         this.currentExerciseSetData.length || this.targetSets,
          totalReps,
          setData:      [...this.currentExerciseSetData],
        }],
        totalDuration: totalSecs,
      });
    }

    // Render complete screen
    if (this.isRunningPlan) {
      this.complete.singleStats.style.display = 'none';
      this.complete.planStats.style.display   = '';
      this.complete.heading.textContent        = 'Plan Complete!';

      this.complete.planSummaryList.innerHTML = '';
      this.planResults.forEach((r, i) => {
        const avgWeight = r.setData.length
          ? (r.setData.reduce((s, d) => s + (d.weight || 0), 0) / r.setData.length).toFixed(1)
          : 0;
        const div = document.createElement('div');
        div.className = 'plan-summary-item';
        // FIX: escape exercise name (belt-and-suspenders, comes from config)
        div.innerHTML = `
          <span class="plan-summary-name">${i + 1}. ${escapeHtml(r.exerciseName)}</span>
          <span class="plan-summary-meta">${r.sets} sets · ${r.totalReps} reps${avgWeight > 0 ? ` · ${avgWeight} kg` : ''}</span>
        `;
        this.complete.planSummaryList.appendChild(div);
      });

      if (this.complete.planTime) this.complete.planTime.textContent = this._fmtTime(totalSecs);

    } else {
      this.complete.singleStats.style.display = '';
      this.complete.planStats.style.display   = 'none';
      this.complete.heading.textContent        = 'Workout Complete!';
      const ex        = EXERCISES.find(e => e.id === this.exerciseId);
      const totalReps = this.currentExerciseSetData.reduce((sum, d) => sum + d.reps, 0);
      const avgWeight = this.currentExerciseSetData.length
        ? (this.currentExerciseSetData.reduce((s, d) => s + (d.weight || 0), 0) / this.currentExerciseSetData.length).toFixed(1)
        : 0;
      const totalVolume = this.currentExerciseSetData.reduce((sum, d) => sum + (d.reps * (d.weight || 0)), 0);
      this.complete.exerciseName.textContent = ex?.name || '';
      const setsDone = this.currentExerciseSetData.length || this.targetSets;
      this.complete.totalSets.textContent    = setsDone === this.targetSets
        ? `${setsDone} sets`
        : `${setsDone} of ${this.targetSets} sets`;
      this.complete.totalReps.textContent    = `${totalReps} reps${avgWeight > 0 ? ` · ${avgWeight} kg avg` : ''}`;
      if (this.complete.totalVolume) this.complete.totalVolume.textContent = totalVolume > 0 ? `${totalVolume.toFixed(1)} kg` : '—';
      if (this.complete.totalTime)   this.complete.totalTime.textContent   = this._fmtTime(totalSecs);
    }

    this._refreshStravaButton();
    this._shareHint('.FIT keeps every set, rep and weight. Garmin Connect → <b>+</b> → '
                  + 'Import Data; Strava → <b>+</b> → Upload Activity.');
    this._showScreen('complete');
  }

  // ── Export / share ───────────────────────────────────────────────────────

  _shareHint(msg, cls = '') {
    const el = this.complete.shareHint;
    if (!el) return;
    el.innerHTML = msg;
    el.className = 'share-hint' + (cls ? ' ' + cls : '');
  }

  _sessionFileName(ext) {
    const entry = this._lastSessionEntry;
    const d     = new Date(entry?.date || Date.now());
    const stamp = d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const label = (entry?.planName || entry?.exercises?.[0]?.exerciseName || 'workout')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${label}-${stamp}.${ext}`;
  }

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking synchronously can cancel the download in some browsers
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  _exportSession(kind) {
    const entry = this._lastSessionEntry;
    if (!entry) { this._shareHint('Nothing to export yet.', 'fail'); return; }
    try {
      if (kind === 'fit') {
        // Negated because getTimezoneOffset() reports minutes to ADD to local
        // time to reach UTC — the opposite sign from what FIT wants.
        const tzOffsetSec = -new Date(entry.date).getTimezoneOffset() * 60;
        const bytes = buildStrengthFit(entry, { tzOffsetSec });
        this._download(new Blob([bytes], { type: 'application/octet-stream' }),
                       this._sessionFileName('fit'));
        this._shareHint('Saved. <b>Garmin Connect</b> → + → Import Data, or '
                      + '<b>Strava</b> → + → Upload Activity. Sets, reps and weight are all in there.', 'ok');
      } else {
        this._download(new Blob([buildTcx(entry)], { type: 'application/vnd.garmin.tcx+xml' }),
                       this._sessionFileName('tcx'));
        this._shareHint('Saved as .TCX. Use this only if .FIT is rejected — '
                      + 'TCX cannot carry per-set reps and weight.', 'ok');
      }
    } catch (err) {
      this._shareHint('Export failed: ' + escapeHtml(err.message), 'fail');
    }
  }

  _refreshStravaButton() {
    const btn = this.complete.btnStrava;
    if (!btn) return;
    // Hidden unless a proxy is actually configured — a button that cannot
    // possibly work is worse than no button.
    if (!this.strava.configured) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.textContent = this.strava.connected ? '🔶 Send to Strava' : '🔶 Connect Strava';
  }

  async _sendToStrava() {
    const btn   = this.complete.btnStrava;
    const entry = this._lastSessionEntry;
    if (!entry) return;
    if (!this.strava.connected) { this.strava.beginAuth(); return; }
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Uploading…';
    try {
      const tzOffsetSec = -new Date(entry.date).getTimezoneOffset() * 60;
      const bytes = buildStrengthFit(entry, { tzOffsetSec });
      await this.strava.uploadFit(bytes, this._sessionFileName('fit'));
      this._shareHint('Sent to Strava. It takes a few seconds to appear in your feed.', 'ok');
    } catch (err) {
      this._shareHint('Strava upload failed: ' + escapeHtml(err.message)
                    + ' — the .FIT download still works.', 'fail');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  _goSetup() {
    cancelAnimationFrame(this.animationId);
    clearInterval(this.restTimer);
    this.restTimer = null;
    clearTimeout(this._pendingCompleteTimeout);
    this._pendingCompleteTimeout = null;
    clearTimeout(this._zeroRestTimeout);
    this._zeroRestTimeout = null;
    this._restEnding = false;
    this._stopTimers();
    this.isRunning          = false;
    this.isPaused           = false;
    this.isRunningPlan      = false;
    this._isExerciseTransition = false;
    this._processing        = false;
    this._setCompleting     = false;
    this.rpeOverlay.classList.remove('active');
    this._releaseWakeLock();
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

  // ── History Screen ───────────────────────────────────────────────────────

  _showHistoryScreen() {
    this._renderHistoryList();
    this._showScreen('history');
  }

  _exportHistory() {
    const data = this.history.list();
    if (!data.length) { this._toast('No history to export'); return; }
    // Routed through _download(): the anchor has to be in the document and the
    // object URL must outlive the click, which the old inline version got wrong
    // in exactly the way _download() was written to avoid.
    this._download(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `workout-history-${new Date().toISOString().slice(0, 10)}.json`);
    this._toast(`Exported ${data.length} workout${data.length !== 1 ? 's' : ''}`);
  }

  _renderHistoryList() {
    const container = this.historyScreen.list;
    const entries   = this.history.list();
    container.innerHTML = '';

    if (!entries.length) {
      container.innerHTML = '<p class="history-empty">No workouts recorded yet.<br>Complete a workout to see it here.</p>';
      return;
    }

    entries.forEach(entry => {
      const date    = new Date(entry.date);
      const dateStr = date.toLocaleDateString(undefined,  { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString(undefined,  { hour: '2-digit', minute: '2-digit' });
      // One entry written by an older version — or a hand-edited localStorage
      // key — used to throw here and blank the entire history screen.
      const exercises = Array.isArray(entry.exercises) ? entry.exercises : [];
      // FIX: escape plan name and exercise names — user-controlled strings
      const title   = escapeHtml(entry.planName || exercises[0]?.exerciseName || 'Workout');

      const exerciseRows = exercises.map(ex => {
        const totalReps = ex.totalReps ?? (ex.setData?.reduce((s, d) => s + d.reps, 0) ?? 0);
        const avgWeight = ex.setData?.length
          ? ex.setData.reduce((s, d) => s + (d.weight || 0), 0) / ex.setData.length
          : 0;
        const rpeVals = (ex.setData || []).filter(d => d.rpe != null).map(d => d.rpe);
        const rpeStr  = rpeVals.length
          ? ` · RPE ${(rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1)}`
          : '';
        return `
          <div class="history-exercise-row">
            <div>
              <div class="history-exercise-name">${escapeHtml(ex.exerciseName)}</div>
              <div class="history-exercise-detail">${ex.sets} sets${rpeStr}</div>
            </div>
            <span class="history-exercise-stats">
              ${totalReps} reps${avgWeight > 0 ? `<br>${avgWeight.toFixed(1)}&nbsp;kg` : ''}
            </span>
          </div>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'history-card';
      card.innerHTML = `
        <div class="history-card-header">
          <span class="history-card-title">${title}</span>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span class="history-card-date">${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</span>
            <button class="btn-icon danger history-card-delete" title="Delete this entry" aria-label="Delete the ${title} workout from ${escapeHtml(dateStr)}">✕</button>
          </div>
        </div>
        <div class="history-card-meta">
          <span>⏱ ${this._fmtTime(entry.totalDuration || 0)}</span>
          <span>💪 ${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="history-exercise-list">${exerciseRows}</div>
      `;
      card.querySelector('.history-card-delete').addEventListener('click', () => {
        if (!confirm('Delete this workout entry?')) return;
        this.history.delete(entry.id);
        this._renderHistoryList();
      });
      container.appendChild(card);
    });
  }

  // ── UI Updates ───────────────────────────────────────────────────────────

  _updateWorkoutUI() {
    const ex    = EXERCISES.find(e => e.id === this.exerciseId);
    let title   = ex?.name || '';
    if (this.isRunningPlan) title += ` (${this.planIndex + 1} / ${this.workoutPlan.length})`;
    this.workout.title.textContent = title;
    this.workout.targetRepsDisplay.textContent = this.targetReps;

    // Subtitle: "Set 1 of 3 · 12 reps" — visible without looking away from camera
    if (this.workout.subtitle) {
      this.workout.subtitle.textContent = `Set ${this.currentSet} of ${this.targetSets} · ${this.targetReps} reps`;
    }

    // "Next Set" → "Finish ▶" on the last set so users know it leads to completion
    if (this.workout.btnNext) {
      const isLast = this.currentSet >= this.targetSets;
      this.workout.btnNext.textContent = isLast ? 'Finish ▶' : 'Next Set ▶';
    }

    if (this.workout.cameraHint) this.workout.cameraHint.textContent = ex?.cameraHint || '';

    // Progressive overload hint — show last recorded result for this exercise
    const hint = this.workout.prevSessionHint;
    if (hint) {
      const prev = this._getPrevSessionData(this.exerciseId);
      if (prev) {
        const totalReps = prev.totalReps ?? (prev.setData?.reduce((s, d) => s + d.reps, 0) ?? 0);
        const avgWeight = prev.setData?.length
          ? prev.setData.reduce((s, d) => s + (d.weight || 0), 0) / prev.setData.length
          : 0;
        hint.textContent = avgWeight > 0
          ? `↗ Last session: ${totalReps} reps @ ${avgWeight.toFixed(1)} kg avg`
          : `↗ Last session: ${totalReps} reps`;
        hint.style.display = '';
      } else {
        hint.textContent = '';
        hint.style.display = 'none';
      }
    }

    this._lastCoach     = null;
    this._lastFormColor  = '#ef4444';
    this._updateBilateral({ leftAngle: null, rightAngle: null, activeSide: null, imbalance: null });
    this._updateCountUI({
      reps: 0, angle: 0, quality: 'none',
      leftAngle: null, rightAngle: null, activeSide: null, imbalance: null,
      progress: 0, cycle: 0, phase: 'lifting',
      coach: `Get set — ${ex?.cues?.concentric || 'start when ready'}`, coachTone: 'neutral',
      leftRom: null, rightRom: null,
    });
    if (this.workout.setTimer) this.workout.setTimer.textContent = '00:00';
  }

  _getPrevSessionData(exerciseId) {
    const entries = this.history.list();
    for (const entry of entries) {
      const list = Array.isArray(entry.exercises) ? entry.exercises : [];
      const ex   = list.find(e => e.exerciseId === exerciseId);
      if (ex) return ex;
    }
    return null;
  }

  _updateCountUI(result) {
    const { reps, angle, quality, leftAngle, rightAngle, activeSide, imbalance } = result;
    const w = this.workout;
    w.repCount.textContent     = reps;
    w.angleDisplay.textContent = `${angle}°`;
    w.setDisplay.textContent   = `${this.currentSet} / ${this.targetSets}`;
    w.repDisplay.textContent   = `${reps} / ${this.targetReps}`;

    const setProgress     = Math.min(reps / this.targetReps, 1);
    const overallProgress = Math.min(((this.currentSet - 1) * this.targetReps + reps) / (this.targetSets * this.targetReps), 1);
    w.barSet.style.width     = `${setProgress * 100}%`;
    w.barOverall.style.width = `${overallProgress * 100}%`;
    w.pctSet.textContent     = `${Math.round(setProgress * 100)}%`;
    w.pctOverall.textContent = `${Math.round(overallProgress * 100)}%`;
    // The visible percentage lives in a separate span, so without this the bars
    // are two anonymous divs as far as assistive tech is concerned.
    w.barSetTrack?.setAttribute('aria-valuenow', Math.round(setProgress * 100));
    w.barOverallTrack?.setAttribute('aria-valuenow', Math.round(overallProgress * 100));

    // Pulse Next Set button when target reps are reached
    if (w.btnNext) w.btnNext.classList.toggle('reps-done', reps >= this.targetReps && this.targetReps > 0);

    // Disable undo button at 0 reps (nothing to undo)
    if (w.btnUndoRep) w.btnUndoRep.disabled = reps <= 0;

    this._updateQualityBadge(quality);
    this._updateBilateral({ leftAngle, rightAngle, activeSide, imbalance });
    this._updateFormFeedback(result);

    // The big rep number carries the same colour signal, for anyone reading
    // the count rather than the gauge.
    if (w.repCount) w.repCount.style.color = this._formColor(result.cycle ?? 0);
  }

  // Red (0) → amber (0.5) → green (1). Hue alone carries the signal, so the
  // gauge, the camera frame and the skeleton all agree without extra state.
  _formColor(t) {
    const x = Math.max(0, Math.min(1, t));
    return `hsl(${Math.round(x * 120)}, 82%, ${Math.round(46 + 8 * x)}%)`;
  }

  _updateFormFeedback(r) {
    const w = this.workout;

    // The skeleton is tinted by how far through the LIFT the user is, so the
    // limb goes green exactly when they hit full range. The gauge and frame
    // track the whole rep CYCLE, so they only complete once the weight is back
    // down — that is the part people skip, and the part the colour should own.
    const liftColor  = this._formColor(r.progress ?? 0);
    const cycleColor = this._formColor(r.cycle ?? 0);
    this._lastFormColor = liftColor;

    if (w.cameraWrapper) w.cameraWrapper.style.setProperty('--form-color', cycleColor);
    if (w.formGaugeFill) {
      w.formGaugeFill.style.width           = `${Math.round((r.cycle ?? 0) * 100)}%`;
      w.formGaugeFill.style.backgroundColor = cycleColor;
    }
    if (w.formPhase) {
      w.formPhase.textContent = r.phase === 'returning' ? 'Return' : 'Lift';
    }

    // A rep verdict is produced on exactly ONE frame. Rendered naively it shows
    // for ~50ms and is gone before anyone can read it, which makes the whole
    // feedback loop pointless. Verdicts get a dwell time; only a tracking
    // failure ('bad') is urgent enough to cut one short.
    const now       = Date.now();
    const isVerdict = r.counted || r.formComplete;
    if (isVerdict) {
      this._coachHoldUntil = now + COACH_DWELL_MS;
      this._heldCoach      = { text: r.coach, tone: r.coachTone || 'good' };
    }
    const holding = now < (this._coachHoldUntil || 0) && r.coachTone !== 'bad';
    const show    = holding ? this._heldCoach : { text: r.coach, tone: r.coachTone || 'neutral' };

    if (w.formCoachText && show.text !== undefined && show.text !== this._lastCoach) {
      w.formCoachText.textContent = show.text;
      w.formCoachText.className   = `form-coach-text tone-${show.tone}`;
      this._lastCoach = show.text;
      if (isVerdict) {
        w.formCoachText.classList.remove('pop');
        void w.formCoachText.offsetWidth;   // restart the animation
        w.formCoachText.classList.add('pop');
      }
    }

    // A finished rep flashes the camera frame green. The gauge itself is left
    // to reset to zero, because that honestly signals "next rep starting".
    if (r.formComplete && w.cameraWrapper) {
      w.cameraWrapper.classList.add('rep-complete');
      clearTimeout(this._repFlashTimeout);
      this._repFlashTimeout = setTimeout(
        () => w.cameraWrapper.classList.remove('rep-complete'), REP_FLASH_MS);
    }

    // Per-side range of motion, as a percentage of this exercise's ideal
    const pct = v => v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
    if (w.formRomLeft) {
      w.formRomLeft.innerHTML = `L <b>${pct(r.leftRom)}</b>`;
      w.formRomLeft.classList.toggle('lagging', r.imbalance === 'left');
    }
    if (w.formRomRight) {
      w.formRomRight.innerHTML = `R <b>${pct(r.rightRom)}</b>`;
      w.formRomRight.classList.toggle('lagging', r.imbalance === 'right');
    }
  }

  _updateQualityBadge(quality) {
    const badge = this.workout.qualityBadge;
    if (!badge) return;
    const map = {
      good:   { text: '● Good signal',  cls: 'good' },
      fair:   { text: '● Fair signal',  cls: 'fair' },
      poor:   { text: '⚠ Poor signal',  cls: 'poor' },
      none:   { text: '✕ No signal',    cls: 'none' },
      manual: { text: '✋ Manual mode',  cls: 'none' },
    };
    const info = map[quality] || map.none;
    badge.textContent = info.text;
    badge.className   = `quality-badge ${info.cls}`;

    // Promote tap-to-count button when camera detection is unreliable
    const tapBtn = this.workout.btnTapCount;
    if (tapBtn) tapBtn.classList.toggle('tap-urgent', quality === 'poor' || quality === 'none');
  }

  _updateBilateral({ leftAngle, rightAngle, activeSide, imbalance }) {
    const w = this.workout;
    if (!w.leftChip || !w.rightChip) return;

    if (w.leftAngle)  w.leftAngle.textContent  = leftAngle  !== null ? `${leftAngle}°`  : '--';
    if (w.rightAngle) w.rightAngle.textContent = rightAngle !== null ? `${rightAngle}°` : '--';

    w.leftChip.classList.toggle('active-side',  activeSide === 'left');
    w.rightChip.classList.toggle('active-side', activeSide === 'right');

    if (w.imbalanceWarning) {
      if (imbalance) {
        w.imbalanceWarning.textContent = `⚠ ${imbalance === 'left' ? 'Left' : 'Right'} side lagging — check form`;
        w.imbalanceWarning.classList.add('active');
      } else {
        w.imbalanceWarning.classList.remove('active');
      }
    }
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
      if (el) el.classList.toggle('active', k === name);
    });
  }

  // ── Toast ────────────────────────────────────────────────────────────────

  _toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => t.classList.remove('show'), 2200);
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
