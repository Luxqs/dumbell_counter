const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.join(__dirname,'..');
const SRC=p=>path.join(ROOT,p);
let CLOCK=1700000000000;
const FakeDate=new Proxy(Date,{get(t,p){return p==='now'?()=>CLOCK:Reflect.get(t,p);}});
const store={};
const ctx={console,Date:FakeDate,Math,JSON,Object,Array,Map,Set,Number,Uint8Array,String,parseInt,parseFloat,isNaN,
 localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},window:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC('js/config.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/export.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/core.js'),'utf8')+
 '\n;globalThis.__X={EXERCISES,RepCounter,MOTION_FLOOR_DPS,MIN_KEYPOINT_CONFIDENCE,KP_CONFIDENCE_HARD,KP_CONFIDENCE_HARD_BY_JOINT,CONFIRM_MS};',ctx);
Object.assign(ctx,ctx.__X);
// Mirrors PoseDetector's two-tier lookup so the probe exercises the real path.
const det={
  kp:(p,n)=>{const k=p[n];return k&&k.score>=ctx.MIN_KEYPOINT_CONFIDENCE?k:null;},
  kpLoose:(p,n)=>{const k=p[n];if(!k)return null;
    const j=String(n).replace(/^(left|right)_/,'');
    const f=ctx.KP_CONFIDENCE_HARD_BY_JOINT[j]??ctx.KP_CONFIDENCE_HARD;
    return k.score>=f?k:null;}};
function poseFor(ex,dL,dR,sL=0.9,sR=0.9){const p={};for(const[s,d,sc]of[['left',dL,sL],['right',dR,sR]]){const{a,b,c}=ex.joints,r=d*Math.PI/180;p[`${s}_${a}`]={x:100,y:0,score:sc};p[`${s}_${b}`]={x:0,y:0,score:sc};p[`${s}_${c}`]={x:100*Math.cos(r),y:100*Math.sin(r),score:sc};}return p;}

// ── A. frame-rate dependence: same real rep tempo, different fps
function runRow(fps,{repMs=2000,n=5}={}){
  const ex=ctx.EXERCISES.find(e=>e.id==='dumbbell-row'),cfg=ex.counting;
  const rc=new ctx.RepCounter('dumbbell-row');let last;
  const dt=Math.round(1000/fps);
  const step=(l,r)=>{CLOCK+=dt;last=rc.update(poseFor(ex,l,r,0.98,0.80),det);};
  const rest=cfg.restThreshold+15, peak=cfg.idealPeak, idle=90;
  const half=Math.max(1,Math.round((repMs/2)/dt));
  for(let i=0;i<Math.round(fps);i++)step(idle,rest);
  for(let k=0;k<n;k++){
    for(let f=1;f<=half;f++)step(idle,rest+(peak-rest)*f/half);
    for(let f=1;f<=half;f++)step(idle,peak+(rest-peak)*f/half);
  }
  return {fps,reps:rc.reps,activeSide:last.activeSide,leftMotion:+rc._left.motion.toFixed(3),rightMotion:+rc._right.motion.toFixed(3)};
}
console.log('A) same 2.0s/rep row, MOTION_FLOOR_DPS='+ctx.MOTION_FLOOR_DPS);
[8,12,15,24,30,60].forEach(f=>console.log('   ',JSON.stringify(runRow(f))));

// ── B. one joint below confidence threshold (squat, occluded hip)
function runConf(exId,score){
  const ex=ctx.EXERCISES.find(e=>e.id===exId),cfg=ex.counting;
  const rc=new ctx.RepCounter(exId);let last;
  const step=(l,r)=>{CLOCK+=33;const p=poseFor(ex,l,r,0.9,0.9);
    p['left_'+ex.joints.a].score=score;p['right_'+ex.joints.a].score=score;
    last=rc.update(p,det);};
  const inc=cfg.direction==='increase',rest=cfg.restThreshold+(inc?-15:15),peak=cfg.idealPeak;
  for(let i=0;i<6;i++)step(rest,rest);
  for(let k=0;k<5;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18,rest+(peak-rest)*f/18);
                       for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18,peak+(rest-peak)*f/18);}
  return {score,reps:rc.reps,coach:last.coach};
}
console.log('B) goblet-squat, hip keypoint score varied (MIN='+ctx.MIN_KEYPOINT_CONFIDENCE+')');
[0.9,0.55,0.49,0.4,0.3].forEach(s=>console.log('   ',JSON.stringify(runConf('goblet-squat',s))));

// ── C. how much ROM you need before the app counts anything
function maxPeakForZero(exId){
  const ex=ctx.EXERCISES.find(e=>e.id===exId),cfg=ex.counting;
  const inc=cfg.direction==='increase';
  const out=[];
  for(const peak of [cfg.peakThreshold+(inc?-10:10),cfg.peakThreshold+(inc?-5:5),cfg.peakThreshold+(inc?-1:1),cfg.peakThreshold]){
    const rc=new ctx.RepCounter(exId);
    const rest=cfg.restThreshold+(inc?-15:15);
    const step=(a)=>{CLOCK+=33;rc.update(poseFor(ex,a,a),det);};
    for(let i=0;i<6;i++)step(rest);
    for(let k=0;k<5;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18);
                         for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18);}
    out.push({peakReached:peak,reps:rc.reps});
  }
  return out;
}
console.log('C) reps counted vs actual peak angle reached');
['bench-press','goblet-squat','pullup'].forEach(id=>{
  const cfg=ctx.EXERCISES.find(e=>e.id===id).counting;
  console.log('   ',id,'threshold='+cfg.peakThreshold,JSON.stringify(maxPeakForZero(id)));
});

// ── D. intermittent keypoint dropout every Nth frame
function runDropout(exId,every){
  const ex=ctx.EXERCISES.find(e=>e.id===exId),cfg=ex.counting;
  const rc=new ctx.RepCounter(exId);let i=0;
  const step=(a)=>{CLOCK+=33;const p=poseFor(ex,a,a);
    if(every&&(++i%every===0)){for(const s of['left','right'])p[`${s}_${ex.joints.c}`].score=0.2;}
    rc.update(p,det);};
  const inc=cfg.direction==='increase',rest=cfg.restThreshold+(inc?-15:15),peak=cfg.idealPeak;
  for(let k=0;k<6;k++)step(rest);
  for(let k=0;k<5;k++){for(let f=1;f<=18;f++)step(rest+(peak-rest)*f/18);
                       for(let f=1;f<=18;f++)step(peak+(rest-peak)*f/18);}
  return {every,reps:rc.reps};
}
console.log('D) bicep-curl with wrist keypoint dropping out every Nth frame');
[0,5,3,2].forEach(e=>console.log('   ',JSON.stringify(runDropout('bicep-curl',e))));
