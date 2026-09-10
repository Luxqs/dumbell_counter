const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.join(__dirname,'..'),SRC=p=>path.join(ROOT,p);
let CLOCK=1700000000000;
const FakeDate=new Proxy(Date,{get(t,p){return p==='now'?()=>CLOCK:Reflect.get(t,p);}});
const store={};const ctx={console,Date:FakeDate,Math,JSON,Object,Array,Map,Set,Number,Uint8Array,String,parseInt,parseFloat,isNaN,
 localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},window:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC('js/config.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/export.js'),'utf8')+'\n'+fs.readFileSync(SRC('js/core.js'),'utf8')+
 '\n;globalThis.__X={EXERCISES,RepCounter,CONFIRM_MS,MIN_KEYPOINT_CONFIDENCE,KP_CONFIDENCE_HARD,KP_CONFIDENCE_HARD_BY_JOINT};',ctx);
Object.assign(ctx,ctx.__X);
// Mirrors PoseDetector's two-tier lookup so the probe exercises the real path.
const det={
  kp:(p,n)=>{const k=p[n];return k&&k.score>=ctx.MIN_KEYPOINT_CONFIDENCE?k:null;},
  kpLoose:(p,n)=>{const k=p[n];if(!k)return null;
    const j=String(n).replace(/^(left|right)_/,'');
    const f=ctx.KP_CONFIDENCE_HARD_BY_JOINT[j]??ctx.KP_CONFIDENCE_HARD;
    return k.score>=f?k:null;}};
function poseFor(ex,d){const p={};for(const s of['left','right']){const{a,b,c}=ex.joints,r=d*Math.PI/180;
 p[`${s}_${a}`]={x:100,y:0,score:0.9};p[`${s}_${b}`]={x:0,y:0,score:0.9};p[`${s}_${c}`]={x:100*Math.cos(r),y:100*Math.sin(r),score:0.9};}return p;}
// bilateral, symmetric, both arms; sweep peak reached and fps
function run(exId,fps,peak,repMs=2000,n=5){
  const ex=ctx.EXERCISES.find(e=>e.id===exId),cfg=ex.counting,inc=cfg.direction==='increase';
  const rc=new ctx.RepCounter(exId),dt=Math.round(1000/fps),half=Math.max(1,Math.round((repMs/2)/dt));
  const rest=cfg.restThreshold+(inc?-15:15);
  const step=a=>{CLOCK+=dt;rc.update(poseFor(ex,a),det);};
  for(let i=0;i<10;i++)step(rest);
  for(let k=0;k<n;k++){for(let f=1;f<=half;f++)step(rest+(peak-rest)*f/half);
                       for(let f=1;f<=half;f++)step(peak+(rest-peak)*f/half);}
  return rc.reps;
}
console.log('Reps counted out of 5, 2.0 s/rep, both arms symmetric. CONFIRM_MS='+ctx.CONFIRM_MS+' ms');
for(const id of ['bench-press','bicep-curl','goblet-squat','shoulder-press','pullup','lateral-raise']){
  const cfg=ctx.EXERCISES.find(e=>e.id===id).counting,inc=cfg.direction==='increase';
  const row=[];
  for(const fps of [8,10,12,15,20,30]){
    // peak = exactly the ideal (a textbook full-range rep)
    row.push(fps+'fps:'+run(id,fps,cfg.idealPeak));
  }
  console.log('  '+id.padEnd(16),row.join('  '));
}
console.log('\nMinimum overshoot past peakThreshold needed to count (deg), full-range rest start:');
for(const id of ['bench-press','goblet-squat','pullup']){
  const cfg=ctx.EXERCISES.find(e=>e.id===id).counting,inc=cfg.direction==='increase';
  const out=[];
  for(const fps of [10,15,30]){
    let need=null;
    for(let ov=0;ov<=60;ov++){const peak=cfg.peakThreshold+(inc?ov:-ov);
      if(run(id,fps,peak,2000,3)===3){need=ov;break;}}
    out.push(fps+'fps: +'+need+'°');
  }
  console.log('  '+id.padEnd(16),out.join('   '),' (ideal is '+Math.abs(cfg.idealPeak-cfg.peakThreshold)+'° past threshold)');
}
console.log('\nSame, but at a slow 4 s/rep tempo:');
for(const id of ['bench-press','goblet-squat']){
  const cfg=ctx.EXERCISES.find(e=>e.id===id).counting;
  console.log('  '+id.padEnd(16),[8,10,12,15].map(f=>f+'fps:'+run(id,f,cfg.idealPeak,4000)).join('  '));
}
