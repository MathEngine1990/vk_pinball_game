import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloStore,cleanSoloProfile} from './public/progress-store.js';
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
function cloud(){
  let value='',fail=false;
  return {get value(){return value;},set value(v){value=v;},set fail(v){fail=v;},
    async send(method,args){if(fail)throw Error('offline');if(method==='VKWebAppStorageGet')return {keys:[{key:args.keys[0],value}]};value=args.value;return {result:true};}};
}
const original={wave:7,xp:250,shards:500,owned:['amber','ice'],skin:'ice'};
test('old solo saves and cosmetics survive migration; unknown fields are removed',async()=>{
  const disk=storage();disk.setItem('rikoshet-local-v1',JSON.stringify(original));
  const store=createSoloStore({storage:disk});assert.deepEqual(await store.load(),cleanSoloProfile(original));
  assert.equal(cleanSoloProfile({...original,xp:Infinity}),null);
  assert.equal(cleanSoloProfile({...original,shards:-1}),null);
  assert.equal(cleanSoloProfile({...original,xp:1e15}),null);
  assert.equal(cleanSoloProfile({...original,skin:'gold'}).skin,'amber');
});
test('VK saves transfer between devices; accounts never automatically inherit device progress',async()=>{
  const vk=cloud(),disk=storage();disk.setItem('rikoshet-local-v1',JSON.stringify(original));
  let status;
  const a=createSoloStore({storage:disk,bridge:vk,account:'123-1',onStatus:s=>status=s});
  assert.equal((await a.load()).wave,1);assert.equal(status.canImport,true);
  await a.importLocal();assert.equal(status.kind,'saved');
  const b=createSoloStore({storage:storage(),bridge:vk,account:'123-1'});
  assert.deepEqual(await b.load(),cleanSoloProfile(original));
  const other=createSoloStore({storage:disk,bridge:cloud(),account:'123-2'});
  assert.equal((await other.load()).wave,1);
});
test('failed writes survive reload and can be retried',async()=>{
  const vk=cloud(),disk=storage();let status;
  let a=createSoloStore({storage:disk,bridge:vk,account:'123-1',onStatus:s=>status=s});
  await a.load();vk.fail=true;a.save(original);await a.sync();assert.equal(status.kind,'unavailable');
  a=createSoloStore({storage:disk,bridge:vk,account:'123-1',onStatus:s=>status=s});
  vk.fail=false;await a.load();assert.equal(status.kind,'saved');assert.equal(JSON.parse(vk.value).profile.wave,7);
});
test('different cloud version requires choice and preserves a recovery copy',async()=>{
  const vk=cloud(),disk=storage();let status;
  const a=createSoloStore({storage:disk,bridge:vk,account:'123-1',onStatus:s=>status=s});await a.load();
  a.save(original);await a.sync();
  const b=createSoloStore({storage:storage(),bridge:vk,account:'123-1'});await b.load();b.save({...original,wave:8});await b.sync();
  a.save({...original,wave:9});await a.sync();assert.equal(status.kind,'conflict');assert.equal(JSON.parse(vk.value).profile.wave,8);
  assert.equal((await a.resolve('cloud')).wave,8);assert.ok(disk.getItem('rikoshet-vk-123-1-recovery'));
  b.save({...original,wave:10});a.save({...original,wave:11});await a.sync();await b.sync();
  assert.equal((await b.resolve('local')).wave,10);assert.equal(JSON.parse(vk.value).profile.wave,10);
});
test('timeout does not destroy progress, late acknowledged writes do not duplicate rewards',async()=>{
  const disk=storage();let value='',hang=true,status;
  const bridge={async send(method,args){if(method==='VKWebAppStorageGet')return {keys:[{key:args.keys[0],value}]};value=args.value;if(hang)return new Promise(()=>{});return {result:true};}};
  const a=createSoloStore({storage:disk,bridge,account:'1-1',timeoutMs:15,onStatus:s=>status=s});
  await a.load();a.save(original);await a.sync();assert.equal(status.kind,'unavailable');hang=false;
  await a.sync();assert.equal(status.kind,'saved');assert.equal(a.get().xp,250);
});
test('blocked local storage retains in-memory progress; corrupt cloud is never overwritten',async()=>{
  let status;
  const broken={getItem:()=>null,setItem:()=>{throw Error('blocked');}};
  const a=createSoloStore({storage:broken,onStatus:s=>status=s});await a.load();a.save(original);await a.sync();
  assert.equal(a.get().wave,7);assert.equal(status.localOK,false);
  const vk=cloud();vk.value='broken';const b=createSoloStore({storage:storage(),bridge:vk,account:'1-1',onStatus:s=>status=s});
  await b.load();b.save(original);await b.sync();assert.equal(vk.value,'broken');assert.equal(status.kind,'unavailable');
});
