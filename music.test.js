import test from 'node:test';
import assert from 'node:assert/strict';
import {musicIntensity,stemLevels} from './public/music.js';
test('duel music follows heat and returns to baseline after a goal',()=>{
 for(const [minSpeed,want] of [[360,0],[720,.5],[1080,1],[360,0]])assert.equal(musicIntensity({solo:false,balls:[{minSpeed}]}),want);
});
test('wave music follows multiball and low health, not duel heat',()=>{
 assert.equal(musicIntensity({solo:true,balls:[{minSpeed:1080}],hp:[8]}),0);
 assert.equal(musicIntensity({solo:true,balls:[{},{}],hp:[8]}),.5);
 assert.equal(musicIntensity({solo:true,balls:[{}],hp:[1]}),1);
 assert.equal(musicIntensity({solo:true,balls:[{},{},{}],hp:[8]}),1);
});
test('mix supports absent stems and retains bass at every intensity',()=>{
 assert.deepEqual(stemLevels(['bass'],0),stemLevels(['bass'],1));
 assert.equal(stemLevels([],1).length,0);
 assert.ok(stemLevels(['other'],1)[0]>stemLevels(['other'],0)[0]);
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
