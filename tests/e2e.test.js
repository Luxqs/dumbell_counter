// End-to-end tests: boots the real index.html in jsdom with stubbed camera,
// pose model, audio and rAF, then drives complete workouts through the UI.
// Run with:  npm install && node tests/e2e.test.js
const fs=require('fs'),path=require('path'),assert=require('assert');
const {JSDOM}=require('jsdom');
const APP=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(APP,'index.html'),'utf8')
  .replace(/<script src="https:\/\/[^"]+"><\/script>/g,'')
  .replace(/<script src="(js\/[^"]+)"><\/script>/g,'');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/'});
const {window}=dom, doc=window.document;

// ── stubs ────────────────────────────────────────────────────────────────
let raf=[],rafId=0;
window.requestAnimationFrame=cb=>{raf.push({id:++rafId,cb});return rafId;};
window.cancelAnimationFrame=id=>{raf=raf.filter(r=>r.id!==id);};
window.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},set strokeStyle(v){},set fillStyle(v){},set lineWidth(v){}});
Object.defineProperties(window.HTMLMediaElement.prototype,{
  readyState:{get:()=>4,configurable:true},
  videoWidth:{get:()=>640,configurable:true},
  videoHeight:{get:()=>480,configurable:true},
});
window.HTMLMediaElement.prototype.play=()=>Promise.resolve();
Object.defineProperty(window.HTMLMediaElement.prototype,'srcObject',{configurable:true,
  set(v){this._src=v; if(v) setTimeout(()=>this.dispatchEvent(new window.Event('loadedmetadata')),0);},
  get(){return this._src||null;}});
window.AudioContext=class{constructor(){this.state='running';this.currentTime=0;this.destination={};}
  createOscillator(){return{connect(){},start(){},stop(){},frequency:{},type:''};}
  createGain(){return{connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}};}
  resume(){}};
window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
Object.defineProperty(window.navigator,'wakeLock',{value:{request:async()=>({release:async()=>{},addEventListener(){}})},configurable:true});
window.confirm=()=>true; window.alert=m=>{throw new Error('alert: '+m);};
window.URL.createObjectURL=()=>'blob:x'; window.URL.revokeObjectURL=()=>{};
const downloads=[];
const origCreate=doc.createElement.bind(doc);
doc.createElement=tag=>{const el=origCreate(tag);
  if(tag==='a') el.click=function(){downloads.push({name:this.download,href:this.href});};
  return el;};

// pose the fake detector will report
let ANGLE=170, EXJOINTS={a:'shoulder',b:'elbow',c:'wrist'};
const mkPose=()=>{const kps=[];const names=['nose','left_eye','right_eye','left_ear','right_ear','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle'];
  const r=ANGLE*Math.PI/180;
  const pos={};
  for(const side of ['left','right']){
    pos[`${side}_${EXJOINTS.a}`]={x:100,y:0};pos[`${side}_${EXJOINTS.b}`]={x:0,y:0};
    pos[`${side}_${EXJOINTS.c}`]={x:100*Math.cos(r),y:100*Math.sin(r)};
  }
  for(const n of names) kps.push({name:n,score:0.9,x:(pos[n]||{x:50}).x,y:(pos[n]||{y:50}).y});
  return {keypoints:kps,score:0.9};};
window.poseDetection={SupportedModels:{MoveNet:'MoveNet'},movenet:{modelType:{SINGLEPOSE_THUNDER:'thunder'}},
  createDetector:async()=>({estimatePoses:async()=>[mkPose()]})};

// Boot manually: jsdom fires its own DOMContentLoaded, so leaving the app's
// own boot line in place would construct TWO Apps bound to the same DOM.
const sources=['js/config.js','js/export.js','js/core.js','js/app.js']
  .map(f=>fs.readFileSync(path.join(APP,f),'utf8')).join('\n;\n')
  .replace(/window\.addEventListener\('DOMContentLoaded'[\s\S]*$/,'');
window.eval(sources+`
;window.__boot=()=>{ window.app = new App(); };
 window.__get=n=>eval(n);`);
const G=n=>window.__get(n);

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pump(n=1){for(let i=0;i<n;i++){const q=raf;raf=[];for(const r of q){await r.cb();}await sleep(0);}}
const $=id=>doc.getElementById(id);
const active=()=>['setup','loading','workout','rest','complete','history'].find(s=>$('screen-'+s).classList.contains('active'));

let pass=0,fail=0;
const t=async(name,fn)=>{try{await fn();console.log('  ✓ '+name);pass++;}catch(e){console.log('  ✗ '+name+'\n      '+e.message);fail++;}};

(async()=>{
window.__boot();
await sleep(20);
const app=window.app;
const EXERCISES=G('EXERCISES');

console.log('\n▸ boot');
await t('lands on setup with the profile modal open',()=>{
  assert.strictEqual(active(),'setup');
  assert.ok($('profile-modal').classList.contains('active'));
});
await t('preset + plan selects are populated on first run (regression)',()=>{
  assert.ok($('preset-select').options.length>=1,'preset select empty');
  assert.ok($('plan-select').options.length>=1,'plan select empty');
  assert.ok($('preset-plan-select').options.length>1,'template list empty');
  assert.strictEqual($('btn-delete-preset').disabled,true,'delete-preset enabled with nothing selected');
  assert.ok($('plan-list').textContent.includes('Nothing here yet'),'empty-plan message missing');
  assert.strictEqual($('btn-start-plan').disabled,true);
});
await t('exercise select lists every configured exercise',()=>{
  assert.strictEqual($('exercise-select').options.length,EXERCISES.length);
  assert.strictEqual($('plan-add-exercise').options.length,EXERCISES.length,'plan builder has its own picker');
});

console.log('\n▸ setup UX: two clearly separated modes');
await t('opens on "One exercise" with the plan panel hidden',()=>{
  assert.strictEqual($('tab-single').getAttribute('aria-selected'),'true');
  assert.strictEqual($('tab-plan').getAttribute('aria-selected'),'false');
  assert.strictEqual($('panel-single').hidden,false);
  assert.strictEqual($('panel-plan').hidden,true,'both workflows visible at once');
});
await t('switching to "Full workout" hides every single-exercise control',()=>{
  $('tab-plan').click();
  assert.strictEqual($('panel-single').hidden,true);
  assert.strictEqual($('panel-plan').hidden,false);
  assert.strictEqual($('tab-plan').getAttribute('aria-selected'),'true');
  assert.strictEqual($('tab-single').tabIndex,-1,'hidden tab still in the tab order');
  $('tab-single').click();
  assert.strictEqual($('panel-single').hidden,false);
});
await t('arrow keys move between modes',()=>{
  $('tab-single').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.strictEqual($('panel-plan').hidden,false);
  $('tab-plan').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.strictEqual($('panel-single').hidden,false);
});
await t('the Start button is explained in plain language underneath it',()=>{
  $('exercise-select').value='bicep-curl';
  $('exercise-select').dispatchEvent(new window.Event('change'));
  $('sets-display').value='4';$('sets-display').dispatchEvent(new window.Event('change'));
  $('reps-display').value='10';$('reps-display').dispatchEvent(new window.Event('change'));
  $('rest-sets-input').value='45';$('rest-sets-input').dispatchEvent(new window.Event('change'));
  const txt=$('single-summary').textContent;
  assert.ok(/4 × 10 reps of Bicep Curl/.test(txt),txt);
  assert.ok(/45s rest between sets/.test(txt),txt);
  assert.ok(/about \d+ min/.test(txt),txt);
});
await t('the setup screen shows where to put the camera before you start',()=>{
  assert.ok($('setup-camera-hint').textContent.length>5,'camera placement hint missing');
});

console.log('\n▸ profile');
await t('creating a profile closes the modal and namespaces storage',()=>{
  $('profile-name-input').value='Luxqs <b>';
  $('btn-create-profile').click();
  assert.ok(!$('profile-modal').classList.contains('active'));
  assert.ok($('profile-indicator').textContent.includes('Luxqs'));
  assert.strictEqual(app.history.KEY,'dc_u_Luxqs__b__history_v1',app.history.KEY);
});
await t('profile name is escaped, not injected',()=>{
  app._showProfileModal();
  assert.strictEqual($('profile-list').querySelectorAll('b').length,0,'HTML injected from profile name');
  assert.ok($('profile-list').textContent.includes('<b>'));
  app._hideProfileModal();
});

console.log('\n▸ plan builder');
await t('template plan loads and renders',()=>{
  $('tab-plan').click();
  $('preset-plan-select').value='beginner-full-body';
  $('btn-load-preset-plan').click();
  assert.strictEqual(app.workoutPlan.length,6);
  assert.strictEqual($('plan-list').querySelectorAll('.plan-item').length,6);
  assert.strictEqual($('btn-start-plan').disabled,false);
});
await t('template names are readable and the description sits below',()=>{
  const opts=[...$('preset-plan-select').options].slice(1).map(o=>o.textContent);
  assert.ok(opts.every(t=>t.length<=28),'template option labels too long: '+opts.join(' | '));
  assert.ok(!opts.some(t=>t.includes('—')&&t.split('—').length>2),'description still in the option label');
  $('preset-plan-select').value='ppl-push';
  $('preset-plan-select').dispatchEvent(new window.Event('change'));
  const d=$('preset-plan-desc').textContent;
  assert.ok(/exercises/.test(d)&&/sets/.test(d),'description not shown: "'+d+'"');
});
await t('plan rows start collapsed and open on tap',()=>{
  const head=$('plan-list').querySelector('.plan-item-head');
  const panel=$('plan-list').querySelector('.plan-item-edit');
  assert.strictEqual(panel.hidden,true,'plan rows render expanded');
  assert.strictEqual(head.getAttribute('aria-expanded'),'false');
  assert.ok(/\d+ sets × \d+ reps/.test(head.textContent),'no one-line recap: '+head.textContent);
  head.click();
  assert.strictEqual(panel.hidden,false);
  assert.strictEqual(head.getAttribute('aria-expanded'),'true');
  head.click();
  assert.strictEqual(panel.hidden,true);
});
await t('editing a field updates that row\'s recap without collapsing it',()=>{
  const head=$('plan-list').querySelector('.plan-item-head');
  head.click();
  const inp=$('plan-list').querySelector('[data-field="reps"]');
  inp.value='7'; inp.dispatchEvent(new window.Event('change'));
  assert.strictEqual(app.workoutPlan[0].reps,7);
  assert.ok(/× 7 reps/.test(head.textContent),head.textContent);
  assert.strictEqual($('plan-list').querySelector('.plan-item-edit').hidden,false,'row collapsed mid-edit');
});
await t('reorder + remove keep the model and the DOM in step',()=>{
  const first=app.workoutPlan[0].exerciseId,second=app.workoutPlan[1].exerciseId;
  $('plan-list').querySelectorAll('[data-action="down"]')[0].click();
  assert.strictEqual(app.workoutPlan[0].exerciseId,second);
  assert.strictEqual(app.workoutPlan[1].exerciseId,first);
  $('plan-list').querySelectorAll('[data-action="remove"]')[0].click();
  assert.strictEqual(app.workoutPlan.length,5);
  assert.strictEqual($('plan-list').querySelectorAll('.plan-item').length,5);
});
await t('inline plan fields clamp out-of-range input',()=>{
  const inp=$('plan-list').querySelector('[data-field="sets"]');
  inp.value='999';inp.dispatchEvent(new window.Event('change'));
  assert.strictEqual(app.workoutPlan[0].sets,20);
  inp.value='-3';inp.dispatchEvent(new window.Event('change'));
  assert.strictEqual(app.workoutPlan[0].sets,1);
});
await t('the plan builder adds from its OWN fields, not the other panel (regression)',()=>{
  app.workoutPlan=[];app._renderPlanList();
  // Deliberately set the single-exercise panel to something different: the old
  // build silently copied these values into the plan item.
  $('exercise-select').value='goblet-squat';
  $('sets-display').value='9';$('sets-display').dispatchEvent(new window.Event('change'));
  $('plan-add-exercise').value='pullup';
  $('plan-add-sets').value='5';$('plan-add-reps').value='8';
  $('plan-add-rest').value='120';$('plan-add-after').value='30';
  $('btn-add-to-plan').click();
  assert.strictEqual(app.workoutPlan.length,1);
  assert.strictEqual(JSON.stringify(app.workoutPlan[0]),
    JSON.stringify({exerciseId:'pullup',sets:5,reps:8,restBetweenSets:120,restAfterExercise:30}));
});
await t('plan builder clamps out-of-range entries',()=>{
  $('plan-add-sets').value='999';$('plan-add-reps').value='0';
  $('plan-add-rest').value='-5';$('plan-add-after').value='abc';
  $('btn-add-to-plan').click();
  const it=app.workoutPlan[app.workoutPlan.length-1];
  assert.strictEqual(JSON.stringify([it.sets,it.reps,it.restBetweenSets,it.restAfterExercise]),
                     JSON.stringify([20,1,0,60]));
});
await t('the plan states its own total before you commit',()=>{
  const txt=$('plan-summary-line').textContent;
  assert.ok(/2 exercises/.test(txt),txt);
  assert.ok(/sets/.test(txt)&&/about \d+ min/.test(txt),txt);
});
await t('a saved plan holding a dead exercise is sanitised on load',()=>{
  app.wpm.save('legacy',[{exerciseId:'jazzercise',sets:3,reps:10},{exerciseId:'bicep-curl',sets:2,reps:8,restBetweenSets:0,restAfterExercise:0}]);
  app._populatePlanSelect();
  $('plan-select').value='legacy';
  $('btn-load-plan').click();
  assert.strictEqual(app.workoutPlan.length,1);
  assert.strictEqual(app.workoutPlan[0].exerciseId,'bicep-curl');
});

console.log('\n▸ full 2-exercise plan workout, end to end');
app.workoutPlan=[
  {exerciseId:'bicep-curl',sets:2,reps:2,restBetweenSets:0,restAfterExercise:0},
  {exerciseId:'dumbbell-row',sets:1,reps:2,restBetweenSets:0,restAfterExercise:0}];
app._renderPlanList();
async function doReps(n){
  const ex=EXERCISES.find(e=>e.id===app.exerciseId);EXJOINTS=ex.joints;
  const c=ex.counting,inc=c.direction==='increase';
  const rest=c.restThreshold+(inc?-15:15),peak=c.idealPeak;
  ANGLE=rest;await pump(6);
  for(let k=0;k<n;k++){
    for(let f=1;f<=18;f++){ANGLE=rest+(peak-rest)*f/18;await pump(1);}
    for(let f=1;f<=18;f++){ANGLE=peak+(rest-peak)*f/18;await pump(1);}
    await sleep(300);   // clear REP_COOLDOWN_MS between reps
  }
}
await t('start plan → camera + workout screen',async()=>{
  $('btn-start-plan').click();
  await sleep(60);await pump(1);
  assert.strictEqual(active(),'workout');
  assert.strictEqual(app.exerciseId,'bicep-curl');
  assert.ok($('workout-title').textContent.includes('1 / 2'));
});
await t('set 1: two camera reps trigger the RPE prompt',async()=>{
  await doReps(2);
  await sleep(500);
  assert.strictEqual(app.counter.reps,2,'reps='+app.counter.reps);
  assert.ok($('rpe-overlay').classList.contains('active'),'RPE overlay not shown');
  assert.strictEqual($('rpe-overlay').querySelector('.rpe-title').textContent,'Set 1 of 2 — How hard was that?');
});
await t('RPE choice is recorded and rest starts',async()=>{
  $('rpe-overlay').querySelector('[data-rpe="8"]').click();
  assert.strictEqual(app.currentExerciseSetData[0].rpe,8);
  assert.strictEqual(active(),'rest');
  await sleep(450);
  assert.strictEqual(active(),'workout');
  assert.strictEqual(app.currentSet,2);
  assert.strictEqual(app.counter.reps,0,'counter not reset between sets');
});
await t('set 2 finishes the exercise and transitions to the next one',async()=>{
  await pump(1);
  await doReps(2);await sleep(500);
  $('rpe-overlay').querySelector('.rpe-skip').click();
  assert.strictEqual(active(),'rest');
  assert.ok($('rest-next-exercise').textContent.includes('Dumbbell Row'));
  await sleep(450);await pump(1);
  assert.strictEqual(app.exerciseId,'dumbbell-row');
  assert.strictEqual(app.currentSet,1);
  assert.strictEqual(app.planResults.length,1);
  assert.strictEqual(app.planResults[0].totalReps,4);
});
await t('manual tap counter finishes the last exercise',async()=>{
  $('btn-tap-count').click();$('btn-tap-count').click();
  await sleep(500);
  $('rpe-overlay').querySelector('[data-rpe="9"]').click();
  assert.strictEqual(active(),'complete');
});
await t('complete screen shows a plan summary and stops all timers',()=>{
  assert.strictEqual($('complete-plan-stats').style.display,'');
  assert.strictEqual($('complete-single-stats').style.display,'none');
  assert.strictEqual($('plan-summary-list').querySelectorAll('.plan-summary-item').length,2);
  assert.strictEqual(app._workoutTimerInterval,null,'workout timer still running');
  assert.strictEqual(app.stream,null,'camera still open');
});
await t('the session was written to history with real per-set data',()=>{
  const h=app.history.list();
  assert.strictEqual(h.length,1);
  assert.strictEqual(h[0].exercises.length,2);
  assert.strictEqual(h[0].exercises[0].totalReps,4);
  assert.strictEqual(h[0].exercises[0].setData.length,2);
  assert.strictEqual(h[0].exercises[0].setData[0].rpe,8);
  assert.strictEqual(h[0].exercises[1].setData[0].rpe,9);
});

console.log('\n▸ export');
await t('.FIT download is offered and produces a well-formed file',()=>{
  downloads.length=0;
  $('btn-export-fit').click();
  assert.strictEqual(downloads.length,1);
  assert.ok(/\.fit$/.test(downloads[0].name),downloads[0].name);
  const b=Buffer.from(G('buildStrengthFit')(app._lastSessionEntry,{tzOffsetSec:0}));
  assert.strictEqual(b.readUInt16LE(b.length-2),G('crcOf')([...b.slice(0,b.length-2)]));
});
await t('.TCX download is offered',()=>{
  downloads.length=0;$('btn-export-tcx').click();
  assert.ok(/\.tcx$/.test(downloads[0].name));
});
await t('Strava button stays hidden while unconfigured',()=>{
  assert.strictEqual($('btn-strava-upload').style.display,'none');
});

console.log('\n▸ history screen');
await t('history renders and export downloads JSON',()=>{
  $('btn-home').click();
  $('btn-history').click();
  assert.strictEqual(active(),'history');
  assert.strictEqual($('history-list').querySelectorAll('.history-card').length,1);
  downloads.length=0;$('btn-export-history').click();
  assert.strictEqual(downloads.length,1);
  assert.ok(/^workout-history-\d{4}-\d{2}-\d{2}\.json$/.test(downloads[0].name),downloads[0].name);
});
await t('a malformed history entry does not blank the screen (regression)',()=>{
  const raw=JSON.parse(window.localStorage.getItem(app.history.KEY));
  raw.push({id:1,date:Date.now(),totalDuration:60});           // no exercises at all
  raw.push({id:2,date:Date.now(),totalDuration:60,exercises:'oops'});
  window.localStorage.setItem(app.history.KEY,JSON.stringify(raw));
  app._renderHistoryList();
  assert.strictEqual($('history-list').querySelectorAll('.history-card').length,3);
  app._getPrevSessionData('bicep-curl');                        // must not throw
});
await t('deleting a history entry re-renders',()=>{
  $('history-list').querySelector('.history-card-delete').click();
  assert.strictEqual($('history-list').querySelectorAll('.history-card').length,2);
});

console.log('\n▸ single-exercise workout + weight handling');
await t('weight stepper clamps at 200 kg (regression)',async()=>{
  $('btn-history-back').click();
  $('exercise-select').value='bicep-curl';
  $('sets-display').value='1';$('sets-display').dispatchEvent(new window.Event('change'));
  $('reps-display').value='1';$('reps-display').dispatchEvent(new window.Event('change'));
  $('rest-sets-input').value='0';$('rest-sets-input').dispatchEvent(new window.Event('change'));
  $('btn-start').click();await sleep(60);await pump(1);
  assert.strictEqual(active(),'workout');
  $('weight-input').value='199';
  for(let i=0;i<5;i++)$('btn-weight-plus').click();
  assert.strictEqual(Number($('weight-input').value),200);
  for(let i=0;i<200;i++)$('btn-weight-minus').click();
  assert.strictEqual(Number($('weight-input').value||0),0);
});
await t('a detection failure does not kill the loop (regression)',async()=>{
  const good=app.detector.detect.bind(app.detector);
  const quiet=console.error; console.error=()=>{};
  app.detector.detect=async()=>{throw new Error('simulated WebGL context loss');};
  await pump(8);
  console.error=quiet;
  assert.strictEqual(app._detectFailures,8,'errors were not caught: '+app._detectFailures);
  assert.ok(raf.length>0,'detection loop died after an error');
  assert.strictEqual(app._processing,false,'frame guard left stuck after an error');
  app.detector.detect=good;
  await pump(2);
  assert.strictEqual(app._detectFailures,0,'failure counter did not reset on recovery');
  assert.ok(raf.length>0,'loop did not survive recovery');
});
await t('finishing a single-exercise workout renders single stats',async()=>{
  $('weight-input').value='20';$('weight-input').dispatchEvent(new window.Event('change'));
  $('btn-tap-count').click();
  await sleep(500);
  $('rpe-overlay').querySelector('[data-rpe="7"]').click();
  assert.strictEqual(active(),'complete');
  assert.strictEqual($('complete-single-stats').style.display,'');
  assert.strictEqual($('complete-exercise').textContent,'Bicep Curl');
  assert.strictEqual($('complete-volume').textContent,'20.0 kg');
});
await t('remembered weight is pre-filled next time',async()=>{
  $('btn-home').click();
  $('btn-start').click();await sleep(60);await pump(1);
  assert.strictEqual(Number($('weight-input').value),20);
  $('btn-back').click();
  assert.strictEqual(active(),'setup');
});

console.log('\n▸ accessibility');
await t('Escape closes the RPE overlay',async()=>{
  app.rpeOverlay.classList.add('active');
  doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.ok(!app.rpeOverlay.classList.contains('active'),'Escape did nothing');
});
await t('Escape closes the profile modal only once a profile exists',()=>{
  app._showProfileModal();
  doc.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.ok(!$('profile-modal').classList.contains('active'));
});
await t('the audio toggle exposes its on/off state',()=>{
  const before=$('btn-audio-toggle').getAttribute('aria-pressed');
  $('btn-audio-toggle').click();
  assert.notStrictEqual($('btn-audio-toggle').getAttribute('aria-pressed'),before,'aria-pressed never changes');
  $('btn-audio-toggle').click();
  assert.strictEqual($('btn-audio-toggle').getAttribute('aria-pressed'),before);
});
await t('progress bars report a value, not just a width',()=>{
  app.currentSet=1;app.targetSets=2;app.targetReps=4;
  app._updateCountUI({reps:2,angle:90,quality:'good',leftAngle:null,rightAngle:null,
    activeSide:null,imbalance:null,progress:0,cycle:0,phase:'lifting',coach:'',coachTone:'neutral',
    leftRom:null,rightRom:null});
  assert.strictEqual($('bar-set-track').getAttribute('aria-valuenow'),'50');
  assert.strictEqual($('bar-overall-track').getAttribute('aria-valuenow'),'25');
});
await t('every form control on the setup screen has an accessible name',()=>{
  const unnamed=[...doc.querySelectorAll('#screen-setup select, #screen-setup input')].filter(el=>{
    if(el.getAttribute('aria-label'))return false;
    if(el.closest('label'))return false;
    return !(el.id&&doc.querySelector(`label[for="${el.id}"]`));
  }).map(el=>el.id||el.outerHTML.slice(0,50));
  assert.strictEqual(unnamed.length,0,'unnamed: '+unnamed.join(', '));
});
await t('long rests read as minutes, not a three-digit number',()=>{
  app.restRemaining=180;app._renderCountdown();
  assert.strictEqual($('rest-countdown').textContent,'3:00');
  assert.strictEqual($('rest-countdown-label').textContent,'min : sec');
  app.restRemaining=45;app._renderCountdown();
  assert.strictEqual($('rest-countdown').textContent,'45');
  assert.strictEqual($('rest-countdown-label').textContent,'seconds');
});

console.log('\n▸ teardown');
await t('leaving the workout clears every timer and the camera',()=>{
  assert.strictEqual(app.isRunning,false);
  assert.strictEqual(app.stream,null);
  assert.strictEqual(app._workoutTimerInterval,null);
  assert.strictEqual(app.restTimer,null);
  assert.ok(!$('rpe-overlay').classList.contains('active'));
});
await t('switching profile isolates presets, plans and history',()=>{
  app._showProfileModal();
  $('profile-name-input').value='Second';
  $('btn-create-profile').click();
  assert.strictEqual(app.history.list().length,0);
  assert.strictEqual(app.workoutPlan.length,0);
  assert.ok($('plan-list').textContent.includes('Nothing here yet'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
