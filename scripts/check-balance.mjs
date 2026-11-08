import fs from 'node:fs';
import {arena,step,input,rewards,activateMagnet} from '../physics.js';
import {cosmetics} from '../catalog.js';
function rng(seed){let n=seed>>>0;return ()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;};}
const profiles={learning:{reaction:.25,error:100,accuracy:.25},regular:{reaction:.16,error:55,accuracy:.55},skilled:{reaction:.09,error:20,accuracy:.85}};
const rows=[];const originalRandom=Math.random;
for(const difficulty of ['easy','normal','hard'])for(const wave of [1,3,6,12,24,48])for(const [name,model] of Object.entries(profiles)){
 const runs=[];
 for(let seed=1;seed<=24;seed++){
  Math.random=rng(1000+seed);const decision=rng(9000+seed);const g=arena(true,wave,difficulty);
  let nextThink=0,aim=500,firstReady=null,uses=0,captures=0,wasHeld=false;
  for(let tick=0;tick<9002 && g.winner===null;tick++){
   const incoming=g.balls.filter(b=>b.vy>0 && !b.heldUntil).sort((a,b)=>(952-a.y)/a.vy-(952-b.y)/b.vy)[0];
   const contact=incoming?(952-incoming.y)/incoming.vy:Infinity;
   let hit=false;
   if(g.t>=nextThink){nextThink=g.t+model.reaction;aim=incoming?incoming.x+incoming.vx*Math.min(.35,contact)+(decision()-.5)*2*model.error:500;hit=contact>0 && contact<.20 && decision()<model.accuracy;}
   input(g,0,aim,hit);
   if(g.energy>=100 && firstReady===null)firstReady=g.t;
   if(g.energy>=100 && contact<.7 && activateMagnet(g))uses++;
   step(g,1/60);
   const held=g.balls.some(b=>b.heldUntil>g.t);if(held&&!wasHeld)captures++;wasHeld=held;
  }
  const reward=rewards(g,0);runs.push({win:Number(g.winner===0),time:g.t,perfect:g.pads[0].perfect,shards:reward.shards,firstReady,uses,captures});
 }
 const avg=k=>+(runs.reduce((s,r)=>s+r[k],0)/runs.length).toFixed(2);
 const charged=runs.filter(r=>r.firstReady!==null);
 rows.push({difficulty,wave,model:name,wins:avg('win'),seconds:avg('time'),perfect:avg('perfect'),shards:avg('shards'),charged:charged.length,firstReady:charged.length?+(charged.reduce((s,r)=>s+r.firstReady,0)/charged.length).toFixed(1):null,uses:avg('uses'),captures:avg('captures'),matchesToSkin:cosmetics.filter(c=>c.price).map(c=>({id:c.id,matches:Math.ceil(c.price/avg('shards'))}))});
}
Math.random=originalRandom;
fs.mkdirSync('outputs/balance',{recursive:true});const label=process.argv[2]||'current';fs.writeFileSync('outputs/balance/'+label+'.json',JSON.stringify({seeds:24,note:'Synthetic input models, not human playtest results; prices from zero balance, no earlier purchases.',rows},null,2));
console.log(JSON.stringify(rows.filter(r=>r.difficulty==='normal'),null,2));
