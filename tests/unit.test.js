// Unit + integration tests for the counting engine, storage layer and exporters.
// Run with:  node tests/unit.test.js      (no dependencies)
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const SRC=p=>path.join(__dirname,'..',p);
let CLOCK=1700000000000;
const FakeDate=new Proxy(Date,{get(t,p){return p==='now'?()=>CLOCK:Reflect.get(t,p);}});
const store={};
const ctx={console,Date:FakeDate,Math,JSON,Object,Array,Map,Set,Number,Uint8Array,String,parseInt,parseFloat,isNaN,
  localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},window:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC('js/config.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/export.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/core.js'),'utf8')+
 '\n;globalThis.__X={EXERCISES,PRESET_PLANS,RepCounter,WorkoutPlanManager,WorkoutHistory,WorkoutManager,WeightMemory,ProfileManager,buildStrengthFit,buildTcx,crcOf,SIDE_LEAD_MARGIN};',ctx);
Object.assign(ctx,ctx.__X);
let pass=0,fail=0;
const t=(name,fn)=>{try{fn();console.log('  ✓ '+name);pass++;}catch(e){console.log('  ✗ '+name+'\n      '+e.message);fail++;}};
const det={kp:(p,n)=>p[n]||null};
function poseFor(ex,dL,dR,sL=0.9,sR=0.9){const p={};for(const[s,d,sc]of[['left',dL,sL],['right',dR,sR]]){const{a,b,c}=ex.joints,r=d*Math.PI/180;p[`${s}_${a}`]={x:100,y:0,score:sc};p[`${s}_${b}`]={x:0,y:0,score:sc};p[`${s}_${c}`]={x:100*Math.cos(r),y:100*Math.sin(r),score:sc};}return p;}
function drive(exId,fn){const ex=ctx.EXERCISES.find(e=>e.id===exId);const rc=new ctx.RepCounter(exId);let last;
  const step=(l,r,sl,sr)=>{CLOCK+=33;last=rc.update(poseFor(ex,l,r,sl,sr),det);return last;};
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
  const step=(l,r)=>{CLOCK+=33;last=rc.update(poseFor(ex,l,r,0.98,0.80),det);};
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

console.log('\n▸ manual rep / undo');
t('undo on an empty counter does not eat ROM history',()=>{
  const rc=new ctx.RepCounter('bicep-curl');
  rc._romLeft.push(0.9);rc._romRight.push(0.9);
  const r=rc.undoRep();
  assert.strictEqual(rc.reps,0);
  assert.strictEqual(rc._romLeft.length,1,'ROM sample was wrongly discarded');
  assert.strictEqual(r.coach,'No reps to remove');
});
t('manual rep then undo returns to 0',()=>{
  const rc=new ctx.RepCounter('bicep-curl');rc.manualRep();rc.manualRep();rc.undoRep();rc.undoRep();rc.undoRep();
  assert.strictEqual(rc.reps,0);
});
t('unknown exercise degrades instead of throwing',()=>{
  const rc=new ctx.RepCounter('does-not-exist');
  const r=rc.update({},det);
  assert.ok(r.coach.includes('Unknown exercise'));
  assert.strictEqual(rc.manualRep().reps,1);
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
