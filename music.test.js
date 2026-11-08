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
