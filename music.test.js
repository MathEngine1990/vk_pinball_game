import test from 'node:test';
import assert from 'node:assert/strict';
import {musicIntensity,stemLevels} from './public/music.js';
test('duel always plays every stem regardless of ball heat or score',()=>{
 for(const minSpeed of [360,720,1080,360]){
   const stage=musicIntensity({solo:false,balls:[{minSpeed}],score:[0,0]});
   assert.equal(stage,1);assert.deepEqual(stemLevels(['drums','bass','other'],stage),[1,1,1]);
 }
});

test('waves add drums, bass and melody by ball count at a constant level',()=>{
 for(const hp of [8,4,1])for(const [count,want] of [[1,[1,0,0]],[2,[1,1,0]],[3,[1,1,1]],[2,[1,1,0]],[1,[1,0,0]]]){
   const stage=musicIntensity({solo:true,balls:Array.from({length:count},()=>({minSpeed:1080})),hp:[hp]});
   assert.deepEqual(stemLevels(['drums','bass','other'],stage),want);
 }
});

test('stem selection supports absent and reordered instruments without promoting them',()=>{
 assert.deepEqual(stemLevels([],0),[]);
 assert.deepEqual(stemLevels(['other','drums'],.5),[0,1]);
 assert.deepEqual(stemLevels(['bass'],0),[0]);
 assert.deepEqual(stemLevels(['bass'],.5),[1]);
 assert.deepEqual(stemLevels(['guitar','organ','saxophone'],0),[0,0,0]);
 assert.deepEqual(stemLevels(['guitar','organ','saxophone'],1),[1,1,1]);
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
