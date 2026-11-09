import test from 'node:test';
import assert from 'node:assert/strict';
import {musicIntensity,stemLevels} from './public/music.js';
test('all instruments play at full stem gain in every match',()=>{
 for(const solo of [true,false])for(const count of [1,2,3])for(const hp of [8,1]){
  const stage=musicIntensity({solo,balls:Array.from({length:count},()=>({minSpeed:1080})),hp:[hp]});
  assert.equal(stage,1);assert.deepEqual(stemLevels(['drums','bass','other'],stage),[1,1,1]);
 }
 assert.deepEqual(stemLevels([]),[]);
 assert.deepEqual(stemLevels(['organ','drums','saxophone']),[1,1,1]);
});
import {createMusicController} from './public/music.js';
test('blocked menu autoplay retries on interaction without a loading error',async()=>{
 const original=globalThis.Audio;let attempts=0;const messages=[];
 globalThis.Audio=class {play(){attempts++;return attempts===1?Promise.reject(Object.assign(new Error('gesture required'),{name:'NotAllowedError'})):Promise.resolve();}pause(){}load(){}removeAttribute(){}};
 const ctx={state:'running',currentTime:0,destination:{},createGain:()=>({gain:{value:0,setTargetAtTime(){}},connect(){},disconnect(){}}),createMediaElementSource:()=>({connect(){},disconnect(){}})};
 const controller=createMusicController({getContext:()=>ctx,getState:()=>({enabled:true,volume:.25,hidden:false,game:null}),baseURL:'https://example.test/audio/',onStatus:m=>messages.push(m),fetcher:async()=>({ok:true,json:async()=>({menu:'menu.m4a',tracks:[]})})});
 try{
  controller.unlock();await new Promise(r=>setTimeout(r,20));assert.equal(attempts,1);assert.equal(controller.inspect().loaded,false);assert.deepEqual(messages,[]);
  controller.unlock();await new Promise(r=>setTimeout(r,20));assert.equal(attempts,2);assert.equal(controller.inspect().loaded,true);
 }finally{controller.dispose();globalThis.Audio=original;}
});


test('all layers are audible from creation and ball changes schedule no fades',async()=>{
 const gains=[];
 const ctx={state:'running',currentTime:0,destination:{},
  createGain(){const events=[];const node={gain:{value:0,cancelScheduledValues:t=>events.push(['cancel',t]),setValueAtTime:(v,t)=>events.push(['set',v,t]),linearRampToValueAtTime:(v,t)=>events.push(['ramp',v,t]),setTargetAtTime(){}},events,connect(){},disconnect(){}};gains.push(node);return node;},
  createBufferSource:()=>({connect(){},disconnect(){},start(){},stop(){}}),
  decodeAudioData:async()=>({duration:12})};
 const state={enabled:true,volume:.25,hidden:false,game:{solo:true,balls:[{}]}};
 const controller=createMusicController({getContext:()=>ctx,getState:()=>state,baseURL:'https://example.test/',fetcher:async()=>({ok:true,json:async()=>({chunkSeconds:12,tracks:[{id:'test',duration:120,chunks:10,roles:['drums','bass','other']}]}),arrayBuffer:async()=>new ArrayBuffer(0)})});
 try{
  controller.unlock();await new Promise(r=>setTimeout(r,10));controller.tick();
  assert.deepEqual(gains.slice(1,4).map(g=>g.gain.value),[1,1,1]);
  ctx.currentTime=60;state.game.balls=[{},{},{}];controller.tick();
  assert.ok(gains.slice(1,4).every(g=>g.events.length===0),'No delayed instrument fade');

 }finally{controller.dispose();}
});
