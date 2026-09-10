// Unit + integration tests for the counting engine, storage layer and exporters.
// Run with:  node tests/unit.test.js      (no dependencies)
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const SRC=p=>path.join(__dirname,'..',p);
let CLOCK=1700000000000;
// Frame interval the fake clock advances by. It is a VARIABLE, not the 33 ms
// constant it used to be: the engine confirms threshold crossings over a span
// of time, so a suite that only ever runs at 30 fps cannot see the failure this
// codebase actually had — every exercise scoring 1 rep in 5 at 8-12 fps, which
// is where MoveNet Thunder over WebGL sits on a mid-range phone.
let FRAME_MS=33;
const FakeDate=new Proxy(Date,{get(t,p){return p==='now'?()=>CLOCK:Reflect.get(t,p);}});
const store={};
const ctx={console,Date:FakeDate,Math,JSON,Object,Array,Map,Set,Number,Uint8Array,String,parseInt,parseFloat,isNaN,
  localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},window:{}};
vm.createContext(ctx);
// Symbols the suite reaches into. Pulled out one at a time inside a try, so the
// whole file still RUNS against an older checkout of js/ that is missing some of
// them — which is how every `(regression)` test in here is verified. A single
// destructuring export threw a ReferenceError before test one and made that
// check impossible.
const EXPORTS=['EXERCISES','PRESET_PLANS','RepCounter','PoseDetector','WorkoutPlanManager',
 'WorkoutHistory','WorkoutManager','WeightMemory','ProfileManager','buildStrengthFit','buildTcx',
 'crcOf','SIDE_LEAD_MARGIN','MIN_KEYPOINT_CONFIDENCE','KP_CONFIDENCE_HARD',
 'KP_CONFIDENCE_HARD_BY_JOINT','CONFIRM_MS','CalibrationStore','CalibrationRun',
 'deriveCountingBand','assessFraming','assessView','CALIB_MIN_SPAN_DEG','CALIB_MIN_REVERSALS',
 'CALIB_COUNT_FRACTION'];
vm.runInContext(fs.readFileSync(SRC('js/config.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/export.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/core.js'),'utf8')+
 '\n;globalThis.__X={};'+EXPORTS.map(n=>`try{__X[${JSON.stringify(n)}]=${n};}catch(_){}`).join(''),ctx);
Object.assign(ctx,ctx.__X);
let pass=0,fail=0;
const t=(name,fn)=>{try{fn();console.log('  ✓ '+name);pass++;}catch(e){console.log('  ✗ '+name+'\n      '+e.message);fail++;}};
// Mirrors PoseDetector's two tiers: a trusted lookup and a low-confidence one
// that still measures. Both are needed — a hip behind a thigh reads 0.3-0.4.
const det={
  kp:(p,n)=>{const k=p[n];return k&&k.score>=ctx.MIN_KEYPOINT_CONFIDENCE?k:null;},
  kpLoose:(p,n)=>{const k=p[n];if(!k)return null;
    const j=String(n).replace(/^(left|right)_/,'');
    const f=(ctx.KP_CONFIDENCE_HARD_BY_JOINT[j]??ctx.KP_CONFIDENCE_HARD);
    return k.score>=f?k:null;}};
function poseFor(ex,dL,dR,sL=0.9,sR=0.9){const p={};for(const[s,d,sc]of[['left',dL,sL],['right',dR,sR]]){const{a,b,c}=ex.joints,r=d*Math.PI/180;p[`${s}_${a}`]={x:100,y:0,score:sc};p[`${s}_${b}`]={x:0,y:0,score:sc};p[`${s}_${c}`]={x:100*Math.cos(r),y:100*Math.sin(r),score:sc};}return p;}
function drive(exId,fn){const ex=ctx.EXERCISES.find(e=>e.id===exId);const rc=new ctx.RepCounter(exId);let last;
  const step=(l,r,sl,sr)=>{CLOCK+=FRAME_MS;last=rc.update(poseFor(ex,l,r,sl,sr),det);return last;};
  fn({ex,cfg:ex.counting,rc,step,get last(){return last;}});return {rc,last};}
function cycles(o,{n=5,frames=18,lFrac=1,rFrac=1,hold=0,sl=0.9,sr=0.9,restPad=15}={}){
  const {cfg,step}=o;const inc=cfg.direction==='increase';
  const rest=cfg.restThreshold+(inc?-restPad:restPad);
  const pL=rest+(cfg.idealPeak-rest)*lFrac, pR=rest+(cfg.idealPeak-rest)*rFrac;
  for(let i=0;i<6;i++)step(rest,rest,sl,sr);
  for(let k=0;k<n;k++){
    for(let f=1;f<=frames;f++)step(rest+(pL-rest)*f/frames,rest+(pR-rest)*f/frames,sl,sr);
    for(let f=0;f<hold;f++)step(pL,pR,sl,sr);
    for(let f=1;f<=frames;f++)step(pL+(rest-pL)*f/frames,pR+(rest-pR)*f/frames,sl,sr);
  }
}
console.log('\n▸ counting — every exercise, full range, both sides');
for(const ex of ctx.EXERCISES) t(ex.id,()=>{const{rc}=drive(ex.id,o=>cycles(o,{n:5}));assert.strictEqual(rc.reps,5);});

console.log('\n▸ regression: weaker/idle side has the BEST tracking (used to count 0)');
t('bicep-curl, left at 55% ROM but best-tracked → still counts right arm',()=>{
  const{rc,last}=drive('bicep-curl',o=>cycles(o,{n:5,lFrac:0.55,rFrac:1,sl:0.98,sr:0.80}));
  assert.strictEqual(rc.reps,5,'reps='+rc.reps);
  assert.strictEqual(last.imbalance,'left','imbalance='+last.imbalance);
});
t('shoulder-press, right at 50% but best-tracked',()=>{
  const{rc}=drive('shoulder-press',o=>cycles(o,{n:4,lFrac:1,rFrac:0.5,sl:0.80,sr:0.98}));
  assert.strictEqual(rc.reps,4,'reps='+rc.reps);
});
t('dumbbell-row: idle arm braced at 90°, best-tracked → working arm counts',()=>{
  const ex=ctx.EXERCISES.find(e=>e.id==='dumbbell-row'),cfg=ex.counting;
  const rc=new ctx.RepCounter('dumbbell-row');let last;
  const step=(l,r)=>{CLOCK+=FRAME_MS;last=rc.update(poseFor(ex,l,r,0.98,0.80),det);};
  const rest=cfg.restThreshold+15, peak=cfg.idealPeak, idle=90;
  for(let i=0;i<6;i++)step(idle,rest);
  for(let k=0;k<5;k++){
    for(let f=1;f<=18;f++)step(idle,rest+(peak-rest)*f/18);
    for(let f=1;f<=18;f++)step(idle,peak+(rest-peak)*f/18);
  }
  assert.strictEqual(rc.reps,5,'reps='+rc.reps);
  assert.strictEqual(last.imbalance,null,'unilateral must not warn, got '+last.imbalance);
});
t('concentration-curl marked unilateral → no imbalance warning',()=>{
  const{last}=drive('concentration-curl',o=>cycles(o,{n:5,lFrac:0.4,rFrac:1,sl:0.8,sr:0.95}));
  assert.strictEqual(last.imbalance,null);
});

console.log('\n▸ latch safety');
for(const id of ['bench-press','bicep-curl','goblet-squat','pullup'])
  t(id+': 40-frame hold at top counts once per cycle',()=>{const{rc}=drive(id,o=>cycles(o,{n:3,hold:40}));assert.strictEqual(rc.reps,3);});
t('movement short of the counting line counts 0',()=>{
  const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl'),cfg=ex.counting;
  const cp=(cfg.peakThreshold-cfg.restThreshold)/(cfg.idealPeak-cfg.restThreshold);
  const{rc}=drive('bicep-curl',o=>cycles(o,{n:4,lFrac:cp*0.75,rFrac:cp*0.75}));
  assert.strictEqual(rc.reps,0);
});

t('one-arm work: idle limb parked at rest + a squeeze at the top counts ONCE (regression)',()=>{
  // The idle arm of a concentration curl hangs at about 170 deg, which IS the
  // rest band of a curl. When the working arm pauses at the top its motion
  // decays below MOTION_FLOOR_DPS, the "who is standing in the start position"
  // tie-break hands activeSide to the IDLE arm, and that arm's permanently-true
  // restConfirmed re-armed the latch while the weight was still locked out. The
  // next frame of movement then credited a second rep from a peak the arm had
  // never left: 6 counted for 3 performed, on every curl held about a second at
  // the top. Arming now belongs to the side that credited the rep.
  for(const id of ['concentration-curl','bicep-curl','hammer-curl']){
    const ex=ctx.EXERCISES.find(e=>e.id===id),cfg=ex.counting;
    const rc=new ctx.RepCounter(id);
    const step=(l,r)=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,l,r),det);};
    const IDLE=170,rest=cfg.restThreshold+15,peak=cfg.idealPeak;
    for(let i=0;i<10;i++)step(IDLE,rest);
    for(let k=0;k<3;k++){
      for(let f=1;f<=30;f++)step(IDLE,rest+(peak-rest)*f/30);
      for(let f=0;f<30;f++)step(IDLE,peak);                       // ~1 s squeeze
      for(let f=1;f<=30;f++)step(IDLE,peak+(rest-peak)*f/30);
      for(let f=0;f<3;f++) step(IDLE,rest);
    }
    assert.strictEqual(rc.reps,3,id+' reps='+rc.reps);
  }
});
t('a dropout on the rep-crediting side does not freeze the set',()=>{
  // The arming rule above must fall back to the other side rather than waiting
  // forever for a limb the camera has lost.
  const ex=ctx.EXERCISES.find(e=>e.id==='bench-press'),cfg=ex.counting;
  const rc=new ctx.RepCounter('bench-press');let i=0;
  const step=(a)=>{CLOCK+=FRAME_MS;const p=poseFor(ex,a,a);
    // right wrist vanishes for good after the first rep is credited
    if(rc.reps>=1) p['right_'+ex.joints.c].score=0.1;
    rc.update(p,det);i++;};
  const rest=cfg.restThreshold-15,peak=cfg.idealPeak;
  for(let k=0;k<6;k++)step(rest);
  for(let k=0;k<4;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18);
                       for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18);
                       for(let f=0;f<3;f++)step(rest);}
  assert.strictEqual(rc.reps,4,'reps='+rc.reps);
});

console.log('\n▸ regression: counting must not depend on frame rate');
// One rep of fixed real-world DURATION, sampled at different frame rates.
// Against the pre-fix engine (a 2-frame confirmation) every one of these
// reports 1 rep out of 5 at 8-12 fps, because the angular overshoot a frame
// count demands is 2 x (speed / fps) — up to 9 degrees, which is most of the
// band between the counting line and full range.
function repsAtFps(exId,fps,{repMs=2000,n=5,peak=null,holdMs=0,restFrames=3}={}){
  const ex=ctx.EXERCISES.find(e=>e.id===exId),cfg=ex.counting,inc=cfg.direction==='increase';
  const prev=FRAME_MS; FRAME_MS=Math.round(1000/fps);
  try{
    const rc=new ctx.RepCounter(exId);
    const rest=cfg.restThreshold+(inc?-15:15), top=peak??cfg.idealPeak;
    const half=Math.max(1,Math.round((repMs/2)/FRAME_MS));
    const hold=Math.round(holdMs/FRAME_MS);
    const step=a=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,a,a),det);};
    for(let i=0;i<Math.max(3,Math.round(fps/2));i++)step(rest);
    for(let k=0;k<n;k++){
      for(let f=1;f<=half;f++)step(rest+(top-rest)*f/half);
      for(let f=0;f<hold;f++)step(top);
      for(let f=1;f<=half;f++)step(top+(rest-top)*f/half);
      for(let i=0;i<restFrames;i++)step(rest);
    }
    return rc.reps;
  } finally { FRAME_MS=prev; }
}
for(const fps of [8,10,12,15,20,30,60])
  t(`every exercise counts 5 of 5 at ${fps} fps, 2 s per rep (regression)`,()=>{
    for(const ex of ctx.EXERCISES){
      const r=repsAtFps(ex.id,fps);
      assert.strictEqual(r,5,`${ex.id} at ${fps} fps counted ${r}`);
    }
  });
for(const fps of [10,12,15,30])
  t(`continuous tempo, no pause at the bottom, still counts 5 of 5 at ${fps} fps (regression)`,()=>{
    // The harsher case: a lifter who turns the rep around without pausing gives
    // the engine a single frame in the rest band, and the pre-fix two-frame
    // confirmation could never re-arm from it — the set scored one rep and
    // stopped, while the coach kept saying "go higher".
    for(const ex of ctx.EXERCISES){
      const r=repsAtFps(ex.id,fps,{restFrames:0});
      assert.strictEqual(r,5,`${ex.id} at ${fps} fps counted ${r}`);
    }
  });
t('a braced idle limb does not steal the opening rep at 10 fps (regression)',()=>{
  // The row's bracing arm is parked mid-range, so it "leads" the working arm on
  // every stationary frame before the set starts. Choosing it left the latch
  // unarmed through the whole first rep — visible only on a slow phone, where
  // the set begins before the first movement frame arrives.
  const prev=FRAME_MS; FRAME_MS=100;
  try{
    const ex=ctx.EXERCISES.find(e=>e.id==='dumbbell-row'),cfg=ex.counting;
    const rc=new ctx.RepCounter('dumbbell-row');
    const step=(l,r)=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,l,r,0.98,0.80),det);};
    const rest=cfg.restThreshold+15,peak=cfg.idealPeak,idle=90;
    for(let i=0;i<8;i++)step(idle,rest);
    for(let k=0;k<5;k++){
      for(let f=1;f<=10;f++)step(idle,rest+(peak-rest)*f/10);
      for(let f=1;f<=10;f++)step(idle,peak+(rest-peak)*f/10);
      for(let i=0;i<3;i++)step(idle,rest);
    }
    assert.strictEqual(rc.reps,5,'reps='+rc.reps);
  } finally { FRAME_MS=prev; }
});
t('a 40-frame hold at the top still counts once per cycle at 10 fps',()=>{
  assert.strictEqual(repsAtFps('bench-press',10,{holdMs:4000,n:3}),3);
});
t('an impossibly fast single frame cannot confirm a rep',()=>{
  // At a low frame rate one frame spans the confirmation window, so a single
  // keypoint landing on the wrong limb would otherwise credit a whole rep.
  const prev=FRAME_MS; FRAME_MS=100;
  try{
    const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl'),cfg=ex.counting;
    const rc=new ctx.RepCounter('bicep-curl');
    const step=a=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,a,a),det);};
    const rest=cfg.restThreshold+15;
    for(let i=0;i<8;i++)step(rest);
    for(let k=0;k<6;k++){ step(cfg.idealPeak); step(rest); }   // teleport and back
    assert.strictEqual(rc.reps,0,'reps='+rc.reps);
  } finally { FRAME_MS=prev; }
});

console.log('\n▸ regression: occlusion must not void the set');
t('goblet-squat still counts with the hip keypoint at 0.3 (regression)',()=>{
  // Measured on the pre-fix engine: hip at 0.55 counted 5 of 5, at 0.49 counted
  // 0 of 5 and told the user to step back — the wrong advice for a joint hidden
  // behind their own thigh.
  const ex=ctx.EXERCISES.find(e=>e.id==='goblet-squat'),cfg=ex.counting;
  const rc=new ctx.RepCounter('goblet-squat');let last;
  const step=a=>{CLOCK+=FRAME_MS;const p=poseFor(ex,a,a);
    p['left_hip'].score=0.3;p['right_hip'].score=0.3;last=rc.update(p,det);};
  const rest=cfg.restThreshold+15;
  for(let i=0;i<6;i++)step(rest);
  for(let k=0;k<5;k++){
    for(let f=1;f<=18;f++)step(rest+(cfg.idealPeak-rest)*f/18);
    for(let f=1;f<=18;f++)step(cfg.idealPeak+(rest-cfg.idealPeak)*f/18);
    for(let i=0;i<3;i++)step(rest);
  }
  assert.strictEqual(rc.reps,5,'reps='+rc.reps);
  assert.notStrictEqual(last.quality,'good','a bridged reading must not report as clean');
});
t('a joint below even the hard floor is not invented', ()=>{
  const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl'),cfg=ex.counting;
  const rc=new ctx.RepCounter('bicep-curl');let last;
  const step=a=>{CLOCK+=FRAME_MS;const p=poseFor(ex,a,a);
    p['left_wrist'].score=0.1;p['right_wrist'].score=0.1;last=rc.update(p,det);};
  for(let i=0;i<10;i++)step(cfg.idealPeak);
  assert.strictEqual(rc.reps,0);
  assert.strictEqual(last.quality,'none');
});
t('a wrist blinking out every other frame still counts',()=>{
  // The dropout must freeze the crossing state, not clear it. Clearing cost
  // four reps in five with a dropout every third frame.
  const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl'),cfg=ex.counting;
  const rc=new ctx.RepCounter('bicep-curl');let i=0;
  const step=a=>{CLOCK+=FRAME_MS;const p=poseFor(ex,a,a);
    if(++i%2===0){p['left_wrist'].score=0.15;p['right_wrist'].score=0.15;}
    rc.update(p,det);};
  const rest=cfg.restThreshold+15;
  for(let k=0;k<6;k++)step(rest);
  for(let k=0;k<5;k++){
    for(let f=1;f<=18;f++)step(rest+(cfg.idealPeak-rest)*f/18);
    for(let f=1;f<=18;f++)step(cfg.idealPeak+(rest-cfg.idealPeak)*f/18);
    for(let i2=0;i2<3;i2++)step(rest);
  }
  assert.strictEqual(rc.reps,5,'reps='+rc.reps);
});

console.log('\n▸ manual rep / undo');
t('undo on an empty counter does not eat ROM history',()=>{
  const rc=new ctx.RepCounter('bicep-curl');
  rc._romLeft.push(0.9);rc._romRight.push(0.9);
  const r=rc.undoRep();
  assert.strictEqual(rc.reps,0);
  assert.strictEqual(rc._romLeft.length,1,'ROM sample was wrongly discarded');
  assert.strictEqual(r.coach,'Niet čo odobrať');
});
t('undo takes back only the ROM samples that rep banked (regression)',()=>{
  // update() pushes per side, conditional on that side being detected. Popping
  // both unconditionally shifted the two histories out of step and made the
  // imbalance warning point at the wrong arm.
  const rc=new ctx.RepCounter('bicep-curl');
  rc.manualRep();                       // banks no ROM at all
  rc._romLeft.push(0.9); rc._romRight.push(0.4);
  rc._repRomSides.push({left:true,right:true});
  rc.reps++;                            // a camera rep that banked both sides
  rc.undoRep();                         // takes back the camera rep
  assert.strictEqual(rc._romLeft.length,0);
  assert.strictEqual(rc._romRight.length,0);
  rc.undoRep();                         // takes back the manual rep
  assert.strictEqual(rc.reps,0);
  assert.strictEqual(rc._romLeft.length,0,'a manual rep must not pop a sample it never pushed');
});
t('manual rep then undo returns to 0',()=>{
  const rc=new ctx.RepCounter('bicep-curl');rc.manualRep();rc.manualRep();rc.undoRep();rc.undoRep();rc.undoRep();
  assert.strictEqual(rc.reps,0);
});
t('unknown exercise degrades instead of throwing',()=>{
  const rc=new ctx.RepCounter('does-not-exist');
  const r=rc.update({},det);
  assert.ok(r.coach.includes('Neznámy cvik'));
  assert.strictEqual(rc.manualRep().reps,1);
});

console.log('\n▸ subject lock — the model has no tracking of its own');
const mkPose=(cx,cy)=>{const kps=[
  {name:'left_shoulder',x:cx-30,y:cy-40,score:.9},{name:'right_shoulder',x:cx+30,y:cy-40,score:.9},
  {name:'left_hip',x:cx-25,y:cy+40,score:.9},{name:'right_hip',x:cx+25,y:cy+40,score:.9}];
  const p={keypoints:kps};p._kpMap=Object.fromEntries(kps.map(k=>[k.name,k]));return p;};
t('a body jumping across the frame in one frame is rejected',()=>{
  const d=new ctx.PoseDetector();let now=1000;
  assert.strictEqual(d._acceptSubject(mkPose(320,400),now,640),true,'first pose must lock');
  now+=33;
  assert.strictEqual(d._acceptSubject(mkPose(120,400),now,640),false,'passerby was accepted');
});
t('the lifter drifting across the frame is not rejected',()=>{
  const d=new ctx.PoseDetector();let now=1000,x=320;
  d._acceptSubject(mkPose(x,400),now,640);
  for(let i=0;i<30;i++){now+=33;x+=4;   // ~120 px/s, a lunge step
    assert.strictEqual(d._acceptSubject(mkPose(x,400),now,640),true,'rejected at x='+x);}
});
t('a rejection that persists re-acquires instead of freezing the session',()=>{
  const d=new ctx.PoseDetector();let now=1000;
  d._acceptSubject(mkPose(320,400),now,640);
  let accepted=false;
  for(let i=0;i<80;i++){now+=33;accepted=d._acceptSubject(mkPose(100,400),now,640);if(accepted)break;}
  assert.ok(accepted,'lock never re-acquired');
  assert.ok(now-1000>1400&&now-1000<2200,'re-acquired after '+(now-1000)+'ms');
});
t('resetSubject forgets the previous set',()=>{
  const d=new ctx.PoseDetector();
  d._acceptSubject(mkPose(320,400),1000,640);
  d.resetSubject();
  assert.strictEqual(d._acceptSubject(mkPose(60,400),1033,640),true);
});

console.log('\n▸ calibration — counting by the user\'s own range');
t('a lifter short of the config band counts nothing until calibrated (regression)',()=>{
  // bench-press assumes lockout at 155° and full range at 168°. Someone who
  // tops out at 140° never crosses a line, gets nothing for the whole set, and
  // is told to press higher the entire time. That is the single most common
  // complaint about automatic rep counters.
  const ex=ctx.EXERCISES.find(e=>e.id==='bench-press');
  const run=(cal)=>{
    const rc=new ctx.RepCounter('bench-press',cal);
    const step=(a)=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,a,a),det);};
    const rest=95,peak=140;                    // this person's REAL range
    for(let i=0;i<8;i++)step(rest);
    for(let k=0;k<5;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18);
                         for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18);
                         for(let f=0;f<3;f++)step(rest);}
    return rc.reps;
  };
  assert.strictEqual(run(null),0,'the config band should miss this range entirely');
  assert.strictEqual(run({rest:95,peak:140}),5,'calibrated, all five should count');
});
t('a calibrated band still refuses a half rep',()=>{
  const ex=ctx.EXERCISES.find(e=>e.id==='bench-press');
  const rc=new ctx.RepCounter('bench-press',{rest:95,peak:140});
  const step=(a)=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,a,a),det);};
  const rest=95,peak=95+(140-95)*0.5;          // half of their own range
  for(let i=0;i<8;i++)step(rest);
  for(let k=0;k<4;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18);
                       for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18);
                       for(let f=0;f<3;f++)step(rest);}
  assert.strictEqual(rc.reps,0,'reps='+rc.reps);
});
t('deriveCountingBand refuses anything implausible rather than counting wrong',()=>{
  const inc=ctx.EXERCISES.find(e=>e.id==='bench-press');      // increase
  const dec=ctx.EXERCISES.find(e=>e.id==='bicep-curl');       // decrease
  const same=(b,e)=>assert.strictEqual(b,e.counting);
  same(ctx.deriveCountingBand(inc,null),inc);
  same(ctx.deriveCountingBand(inc,{rest:100,peak:110}),inc,'span below the floor');
  same(ctx.deriveCountingBand(inc,{rest:150,peak:90}),inc,'calibrated backwards');
  same(ctx.deriveCountingBand(inc,{rest:'x',peak:140}),inc,'non-numeric');
  const b=ctx.deriveCountingBand(inc,{rest:95,peak:140});
  assert.strictEqual(b.calibrated,true);
  assert.strictEqual(b.idealPeak,140);
  assert.strictEqual(b.peakThreshold,Math.round(95+45*ctx.CALIB_COUNT_FRACTION));
  // Sits a slice of the range INSIDE the observed rest, so _atRest fires once
  // they are basically back down rather than at one exact angle.
  const h=inc.counting.hysteresis??6;
  assert.strictEqual(b.restThreshold,Math.round(95+45*0.15+h));
  const d=ctx.deriveCountingBand(dec,{rest:168,peak:52});
  assert.strictEqual(d.restThreshold,Math.round(168-116*0.15-(dec.counting.hysteresis??6)));
  assert.ok(d.peakThreshold>d.idealPeak&&d.peakThreshold<d.restThreshold,JSON.stringify(d));
});
t('later reps a little short of the calibrated extremes still count',()=>{
  // Deliberately NOT tagged (regression): this guards a mistake made while
  // building calibration, not one that ever shipped. Anchoring the latch on the
  // exact angles seen during calibration would make a calibrated set count once
  // and then stop — strictly worse than no calibration at all. Both ends carry a
  // slice of the range as tolerance.
  const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl');
  const rc=new ctx.RepCounter('bicep-curl',{rest:168,peak:52});
  const step=(a)=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,a,a),det);};
  const rest=160,peak=60;                 // 8° short at each end, every rep
  for(let i=0;i<8;i++)step(rest);
  for(let k=0;k<5;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18);
                       for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18);
                       for(let f=0;f<3;f++)step(rest);}
  assert.strictEqual(rc.reps,5,'reps='+rc.reps);
});
t('a calibrated rest band is reachable — the latch still arms at the top of the range',()=>{
  // Guards the trap the hysteresis shift exists for: with restThreshold left at
  // the observed rest, re-arming demands 6° past the person's own maximum and
  // the set silently caps at one rep.
  const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl');
  const rc=new ctx.RepCounter('bicep-curl',{rest:168,peak:52});
  const step=(a)=>{CLOCK+=FRAME_MS;rc.update(poseFor(ex,a,a),det);};
  for(let i=0;i<8;i++)step(168);
  for(let k=0;k<4;k++){for(let f=1;f<=18;f++)step(168-(168-52)*f/18);
                       for(let f=1;f<=18;f++)step(52+(168-52)*f/18);
                       for(let f=0;f<3;f++)step(168);}
  assert.strictEqual(rc.reps,4,'reps='+rc.reps);
});
t('CalibrationRun needs both a range and repetition before it believes itself',()=>{
  const ex=ctx.EXERCISES.find(e=>e.id==='bicep-curl');
  const run=new ctx.CalibrationRun('bicep-curl');
  const step=a=>run.update(poseFor(ex,a,a),det);
  step(168);
  assert.strictEqual(run.status().ready,false,'ready before moving at all');
  for(let f=1;f<=18;f++)step(168-(168-52)*f/18);      // one pass down: wide, but once
  const one=run.status();
  assert.ok(one.span>=ctx.CALIB_MIN_SPAN_DEG,'span='+one.span);
  assert.strictEqual(one.ready,false,'a single pass must not be enough');
  for(let k=0;k<2;k++){for(let f=1;f<=18;f++)step(52+(168-52)*f/18);
                       for(let f=1;f<=18;f++)step(168-(168-52)*f/18);}
  const st=run.status();
  assert.strictEqual(st.ready,true,JSON.stringify(st));
  assert.strictEqual(st.min,52);assert.strictEqual(st.max,168);
  // A curl DECREASES, so rest is the high angle and peak is the low one.
  assert.strictEqual(JSON.stringify(run.result()),JSON.stringify({rest:168,peak:52}));
});
t('CalibrationRun measures the arm that actually worked',()=>{
  const ex=ctx.EXERCISES.find(e=>e.id==='concentration-curl');
  const run=new ctx.CalibrationRun('concentration-curl');
  const step=(l,r)=>run.update(poseFor(ex,l,r),det);
  for(let k=0;k<3;k++){for(let f=1;f<=18;f++)step(170,168-(168-52)*f/18);
                       for(let f=1;f<=18;f++)step(170,52+(168-52)*f/18);}
  const st=run.status();
  assert.strictEqual(st.side,'right',JSON.stringify(st));
  assert.strictEqual(st.ready,true);
});
t('a stored calibration survives a round trip and junk is treated as absent',()=>{
  delete store['dc_calibration_v1'];
  const cs=new ctx.CalibrationStore();
  assert.strictEqual(cs.entry('bicep-curl'),null);
  cs.set('bicep-curl',{rest:168,peak:52});
  assert.strictEqual(JSON.stringify(cs.get('bicep-curl')).includes('"rest":168'),true);
  cs.skip('goblet-squat');
  assert.strictEqual(cs.get('goblet-squat'),null,'a decline is not a band');
  assert.ok(cs.entry('goblet-squat').skipped,'a decline must be remembered so we stop asking');
  store['dc_calibration_v1']=JSON.stringify({'pullup':{rest:100,peak:'x'},'lunge':{rest:100,peak:110}});
  assert.strictEqual(cs.get('pullup'),null,'non-numeric');
  assert.strictEqual(cs.get('lunge'),null,'span below the floor');
  store['dc_calibration_v1']='}{ broken';
  assert.strictEqual(cs.entry('bicep-curl'),null);
  delete store['dc_calibration_v1'];
});
t('namespacing isolates calibration per profile',()=>{
  delete store['dc_calibration_v1'];delete store['dc_u_A__calibration_v1'];
  const cs=new ctx.CalibrationStore();
  cs.setNamespace('u_A__');cs.set('bicep-curl',{rest:168,peak:52});
  cs.setNamespace('u_B__');
  assert.strictEqual(cs.get('bicep-curl'),null);
  cs.setNamespace('u_A__');
  assert.ok(cs.get('bicep-curl'));
  delete store['dc_u_A__calibration_v1'];
});

console.log('\n▸ framing check');
// A pose with a real torso, so the shoulder-width / torso-height test has
// something to measure.
const framePose=({shoulderW=100,torsoH=160,score=0.9,drop=[]}={})=>{
  const p={};
  const put=(n,x,y)=>{ if(!drop.includes(n)) p[n]={x,y,score}; };
  put('left_shoulder', 200-shoulderW/2, 100); put('right_shoulder',200+shoulderW/2,100);
  put('left_hip',      200-shoulderW/2, 100+torsoH); put('right_hip',200+shoulderW/2,100+torsoH);
  put('left_elbow',    150,180); put('right_elbow',250,180);
  put('left_wrist',    140,250); put('right_wrist',260,250);
  put('left_knee',     190,340); put('right_knee',210,340);
  put('left_ankle',    190,420); put('right_ankle',210,420);
  return p;
};
t('assessView separates a body seen from the front from one seen from the side',()=>{
  assert.strictEqual(ctx.assessView(framePose({shoulderW:120,torsoH:160}),det),'frontal');
  assert.strictEqual(ctx.assessView(framePose({shoulderW:20, torsoH:160}),det),'sagittal');
  assert.strictEqual(ctx.assessView(framePose({shoulderW:66, torsoH:160}),det),'oblique');
});
t('the wrong camera angle is named before the set, not silently mis-measured',()=>{
  const curl=ctx.EXERCISES.find(e=>e.id==='bicep-curl');        // wants sagittal
  const raise=ctx.EXERCISES.find(e=>e.id==='lateral-raise');    // wants frontal
  const frontal=framePose({shoulderW:120}),side=framePose({shoulderW:20});
  assert.strictEqual(ctx.assessFraming(side,curl,det),null,'correct view flagged anyway');
  assert.strictEqual(ctx.assessFraming(frontal,curl,det).issue,'view');
  assert.strictEqual(ctx.assessFraming(frontal,raise,det),null);
  assert.strictEqual(ctx.assessFraming(side,raise,det).issue,'view');
  // An ambiguous angle says nothing rather than nagging.
  assert.strictEqual(ctx.assessFraming(framePose({shoulderW:66}),curl,det),null);
});
t('a missing joint is named, and dim tracking is distinguished from it',()=>{
  const curl=ctx.EXERCISES.find(e=>e.id==='bicep-curl');
  const noWrist=ctx.assessFraming(framePose({shoulderW:20,drop:['left_wrist','right_wrist']}),curl,det);
  assert.strictEqual(noWrist.issue,'joints');
  assert.ok(/zápästie/.test(noWrist.message),noWrist.message);
  const dim=ctx.assessFraming(framePose({shoulderW:20,score:0.4}),curl,det);
  assert.strictEqual(dim.issue,'light',JSON.stringify(dim));
  assert.strictEqual(ctx.assessFraming(framePose({shoulderW:20}),null,det),null);
});

console.log('\n▸ storage hardening');
t('corrupt history key yields [] not a throw',()=>{
  store['dc_history_v1']='{"not":"an array"}';
  const h=new ctx.WorkoutHistory();assert.strictEqual(JSON.stringify(h.list()),'[]');
  store['dc_history_v1']='}{ broken';assert.strictEqual(JSON.stringify(h.list()),'[]');
  delete store['dc_history_v1'];
});
t('corrupt profile list yields []',()=>{
  store['dc_profiles_v1']='"a string"';
  assert.strictEqual(JSON.stringify(new ctx.ProfileManager().list()),'[]');delete store['dc_profiles_v1'];
});
t('weight memory rejects non-numeric junk',()=>{
  store['dc_weight_memory_v1']='{"bicep-curl":"heavy"}';
  assert.strictEqual(new ctx.WeightMemory().get('bicep-curl'),0);delete store['dc_weight_memory_v1'];
});
t('getSanitised drops unknown exercises and clamps numbers',()=>{
  const wpm=new ctx.WorkoutPlanManager();
  wpm.save('junk',[{exerciseId:'ghost-lift',sets:3,reps:10},
                   {exerciseId:'bicep-curl',sets:999,reps:-4,restBetweenSets:'x',restAfterExercise:9999},
                   null,{exerciseId:'goblet-squat'}]);
  const p=wpm.getSanitised('junk');
  assert.strictEqual(p.length,2,'len='+p.length);
  assert.strictEqual(JSON.stringify(p[0]),JSON.stringify({exerciseId:'bicep-curl',sets:20,reps:1,restBetweenSets:30,restAfterExercise:300}));
  assert.strictEqual(JSON.stringify(p[1]),JSON.stringify({exerciseId:'goblet-squat',sets:3,reps:12,restBetweenSets:30,restAfterExercise:60}));
});

t('profile namespaces are injective, and the first claim survives (regression)',()=>{
  // `name.replace(/[^a-zA-Z0-9]/g,'_')` alone mapped "Jano K", "Jano-K" and
  // "Jano.K" — and "Ivča"/"Ivša" — onto ONE storage prefix, so two people
  // silently shared one history, one plan list and one weight memory.
  delete store['dc_profile_ns_v1'];
  const pm=new ctx.ProfileManager();
  const a=pm.namespace('Jano K'),b=pm.namespace('Jano-K'),c=pm.namespace('Jano.K');
  assert.strictEqual(a,'u_Jano_K_','an existing install must keep its prefix');
  assert.ok(a!==b&&a!==c&&b!==c,[a,b,c].join(' '));
  assert.strictEqual(pm.namespace('Jano-K'),b,'namespace must be stable across calls');
  assert.notStrictEqual(pm.namespace('Ivča'),pm.namespace('Ivša'));
  delete store['dc_profile_ns_v1'];
});
t('a preset is sanitised on the way out, exactly like a plan (regression)',()=>{
  // An unsanitised preset blanked the exercise picker and started a workout
  // whose RepCounter had no exercise at all — it could not count a single rep.
  delete store['dc_presets_v1'];
  const wm=new ctx.WorkoutManager();
  wm.save('ghost',{exerciseId:'jazzercise',sets:3,reps:10,restBetweenSets:60});
  wm.save('junk', {exerciseId:'bicep-curl',sets:'x',reps:999,restBetweenSets:'nope'});
  assert.strictEqual(wm.getSanitised('ghost'),null);
  assert.strictEqual(wm.getSanitised('never-saved'),null);
  assert.strictEqual(JSON.stringify(wm.getSanitised('junk')),
    JSON.stringify({exerciseId:'bicep-curl',sets:3,reps:50,restBetweenSets:30}));
  delete store['dc_presets_v1'];
});
t('two sessions saved in the same millisecond get distinct ids (regression)',()=>{
  delete store['dc_history_v1'];
  const h=new ctx.WorkoutHistory();
  const a=h.add({exercises:[],totalDuration:1}),b=h.add({exercises:[],totalDuration:1});
  assert.notStrictEqual(a.id,b.id,'id='+a.id);
  h.delete(a.id);
  assert.strictEqual(h.list().length,1,'deleting one entry deleted both');
  delete store['dc_history_v1'];
});

console.log('\n▸ preset plan templates reference real exercises');
t('all PRESET_PLANS exerciseIds exist',()=>{
  for(const p of ctx.PRESET_PLANS) for(const it of p.plan)
    assert.ok(ctx.EXERCISES.some(e=>e.id===it.exerciseId),`${p.id} → ${it.exerciseId}`);
});
t('exercise ids unique & counting bands sane',()=>{
  const ids=new Set();
  for(const e of ctx.EXERCISES){
    assert.ok(!ids.has(e.id),'dup '+e.id);ids.add(e.id);
    const c=e.counting;
    if(c.direction==='increase') assert.ok(c.restThreshold<c.peakThreshold&&c.peakThreshold<c.idealPeak,e.id);
    else assert.ok(c.restThreshold>c.peakThreshold&&c.peakThreshold>c.idealPeak,e.id);
    assert.ok(c.hysteresis>0&&c.minRepMs>0,e.id);
    assert.ok(e.cues&&e.cues.concentric&&e.cues.eccentric,e.id);
    assert.ok(Number.isInteger(e.fitCategory),e.id);
  }
});

console.log('\n▸ offline shell');
t('the service worker precaches exactly the files that exist (regression)',()=>{
  // index.html pulls TensorFlow.js and the pose model from a CDN, so without a
  // worker holding a copy the app is dead in a gym with one bar of signal —
  // which is where it is used. This test is the thing that keeps the list
  // honest: rename a file and the precache silently stops covering it.
  const sw=fs.readFileSync(SRC('sw.js'),'utf8');
  const shell=[...sw.matchAll(/'(\.\/[^']*)'/g)].map(m=>m[1]).filter(p=>p!=='./');
  assert.ok(shell.length>=7,'shell list looks empty: '+shell.join(','));
  for(const rel of shell)
    assert.ok(fs.existsSync(SRC(rel.replace(/^\.\//,''))),'precached but missing on disk: '+rel);
  const html=fs.readFileSync(SRC('index.html'),'utf8');
  for(const m of html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g))
    assert.ok(shell.includes('./'+m[1]),'index.html loads '+m[1]+' but the worker never caches it');
  for(const m of html.matchAll(/<script src="(https:\/\/[^"]+)"><\/script>/g))
    assert.ok(sw.includes(m[1]),'CDN script missing from VENDOR: '+m[1]);
  const mf=JSON.parse(fs.readFileSync(SRC('manifest.webmanifest'),'utf8'));
  for(const i of mf.icons)
    assert.ok(fs.existsSync(SRC(i.src.replace(/^\.\//,''))),'manifest icon missing: '+i.src);
});

console.log('\n▸ export');
const entry={date:Date.parse('2026-08-27T18:00:00Z'),planName:'PPL – Push Day',totalDuration:1800,
 exercises:[{exerciseId:'bench-press',exerciseName:'Bench Press (Dumbbell)',sets:2,totalReps:20,
   setData:[{reps:10,weight:22.5,rpe:8,duration:40},{reps:10,weight:22.5,rpe:9,duration:42}]}]};
t('FIT: CRCs, declared size and record stream all agree',()=>{
  const b=Buffer.from(ctx.buildStrengthFit(entry,{tzOffsetSec:7200}));
  assert.strictEqual(b[0],14);assert.strictEqual(b.slice(8,12).toString(),'.FIT');
  assert.strictEqual(b.readUInt32LE(4)+16,b.length);
  assert.strictEqual(b.readUInt16LE(12),ctx.crcOf([...b.slice(0,12)]));
  assert.strictEqual(b.readUInt16LE(b.length-2),ctx.crcOf([...b.slice(0,b.length-2)]));
});
t('FIT: empty workout still produces a valid file',()=>{
  const b=Buffer.from(ctx.buildStrengthFit({date:Date.now(),totalDuration:0,exercises:[]}));
  assert.strictEqual(b.readUInt16LE(b.length-2),ctx.crcOf([...b.slice(0,b.length-2)]));
  assert.ok(b.length>40);
});
t('FIT: sets whose duration exceeds the session produce no negative rest',()=>{
  const bad={date:Date.now(),totalDuration:10,exercises:[{exerciseId:'bicep-curl',exerciseName:'x',setData:[{reps:5,weight:0,duration:60},{reps:5,weight:0,duration:60}]}]};
  const b=Buffer.from(ctx.buildStrengthFit(bad));
  assert.strictEqual(b.readUInt16LE(b.length-2),ctx.crcOf([...b.slice(0,b.length-2)]));
});
t('TCX: always has at least one Lap',()=>{
  assert.ok(/<Lap /.test(ctx.buildTcx(entry)));
  assert.ok(/<Lap /.test(ctx.buildTcx({date:Date.now(),totalDuration:60,exercises:[]})));
  assert.ok(/<Lap /.test(ctx.buildTcx({date:Date.now(),totalDuration:60})));
});
t('TCX: escapes hostile names',()=>{
  const x=ctx.buildTcx({date:Date.now(),totalDuration:60,planName:'<script>&"\'',exercises:[]});
  assert.ok(!/<script>/.test(x),'unescaped');
  assert.ok(/&lt;script&gt;/.test(x));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
