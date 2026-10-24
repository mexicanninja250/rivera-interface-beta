const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(process.argv[2],'utf8');
const block=html.slice(html.indexOf('function finishEntrance(){'),html.indexOf('function activatePreparedHome(){'));
function scenario(){
 let now=0,id=0,raf=[],timers=new Map();
 const c={loaded:true,document:{hidden:false},entrancePhase:'armed',entranceGeneration:0,entranceFrames:0,entranceActive:false,entranceTimer:null,entranceNativeReady:false,entranceNativeAt:0,
  performance:{now:()=>now},viewStyle(){},$(){return {offsetWidth:1920}},
  setTimeout(fn,ms){const key=++id;timers.set(key,{fn,at:now+ms});return key},clearTimeout(key){timers.delete(key)},requestAnimationFrame(fn){raf.push(fn)}};
 vm.createContext(c);vm.runInContext(block,c);
 return {c,tick(t){now=t;const pending=raf;raf=[];pending.forEach(f=>f(t));for(const [key,v] of [...timers])if(v.at<=now){timers.delete(key);v.fn()}},onlyTimers(t){now=t;for(const [key,v] of [...timers])if(v.at<=now){timers.delete(key);v.fn()}}};
}
// Missing lifecycle events must not leave a cold redirected page hidden.
let s=scenario();s.c.revealHome();for(let t=0;t<850;t+=16.7)s.tick(t);assert.equal(s.c.entrancePhase,'playing');
// Actual rendering stalls must happen before the entrance starts.
s=scenario();s.c.entranceNativeReturned();s.c.revealHome();[100,450,1000,1017,1034,1051].forEach(t=>s.tick(t));assert.equal(s.c.entrancePhase,'armed');s.tick(1068);assert.equal(s.c.entrancePhase,'playing');
// A late native return invalidates previously collected steady frames.
s=scenario();s.c.revealHome(true);[0,17,34,51].forEach(t=>s.tick(t));s.c.entranceNativeReturned();s.tick(68);assert.equal(s.c.entrancePhase,'armed');[85,102,119,136,153,170,187].forEach(t=>s.tick(t));assert.equal(s.c.entrancePhase,'playing');
// Even missing animation-frame callbacks must fail open to a usable menu.
s=scenario();s.c.revealHome();s.onlyTimers(4501);assert.equal(s.c.entrancePhase,'shown');
// A hidden or cancelled appearance cannot start an old entrance later.
s=scenario();s.c.revealHome();s.c.document.hidden=true;s.c.armEntrance();s.tick(2000);assert.equal(s.c.entrancePhase,'armed');assert.equal(s.c.entranceActive,false);
// Duplicate calls while playing/shown do not replay the entrance.
s=scenario();s.c.revealHome(true);for(let t=0;t<220;t+=17)s.tick(t);assert.equal(s.c.entrancePhase,'playing');s.c.finishEntrance();s.c.revealHome();s.tick(300);assert.equal(s.c.entrancePhase,'shown');
console.log('Six readiness, cancellation and fail-open scenarios passed.');
