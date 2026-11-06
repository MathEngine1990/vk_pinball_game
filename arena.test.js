import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHmac} from 'node:crypto';
import {WebSocket} from 'ws';
import {arena,step,input} from './physics.js';

test('timed reflection, goal, multiball and overtime',()=>{
  const g=arena(false);g.balls=[{x:520,y:950,vx:0,vy:360}];
  input(g,0,500,true);step(g,1/60);
  assert.ok(g.balls[0].vy<0 && g.balls[0].vx>0);assert.equal(g.pads[0].perfect,1);
  g.t=121;step(g,1/60);assert.equal(g.winner,null);
  g.balls=[{x:330,y:985,vx:0,vy:360}];step(g,1/60);assert.equal(g.winner,1);
  const solo=arena(true);solo.t=70;step(solo,1/60);step(solo,1/60);assert.equal(solo.balls.length,3);
});

test('signed VK sessions, two devices, room, reconnection and saved reward',{timeout:35000},async t=>{
  const secret='test-key',origin='https://arena.example';
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0',DB_PATH:':memory:',PUBLIC_ORIGIN:origin,VK_SECRET:secret,VK_APP_ID:'123'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  const [line]=await once(child.stdout,'data');
  const url=line.toString().match(/http:\/\/[^\s]+/)[0];
  for(const path of ['/','/bridge.js','/game.js','/style.css'])assert.equal((await fetch(url+path)).status,200);
  assert.equal((await fetch(url+'/arena.sqlite')).status,404);
  async function client(id,valid=true){
    const s=new WebSocket(url.replace('http','ws')+'/play',{origin});t.after(()=>s.terminate());
    const queue=[],pending=[];
    s.on('message',raw=>{const msg=JSON.parse(raw);if(pending.length)pending.shift()(msg);else queue.push(msg);});
    async function wait(type){for(;;){const m=queue.shift()||await new Promise(r=>pending.push(r));if(m.type===type)return m;}}
    await once(s,'open');
    const params=new URLSearchParams({vk_app_id:'123',vk_ts:String(Math.floor(Date.now()/1000)),vk_user_id:id});
    params.set('sign',valid?createHmac('sha256',secret).update(params.toString()).digest('base64url'):'bad');
    const send=m=>s.send(JSON.stringify(m));send({type:'login',launch:params.toString()});
    return {s,wait,send};
  }
  const invalid=await client('1',false);assert.equal((await once(invalid.s,'close'))[0],1008);
  const a=await client('11'),b=await client('22');await a.wait('ready');await b.wait('ready');
  a.send({type:'create'});const {code}=await a.wait('state');b.send({type:'join',code});
  assert.equal((await b.wait('state')).seat,1);assert.equal((await a.wait('state')).game.solo,false);
  b.s.close();await once(b.s,'close');const second=await client('22');await second.wait('ready');
  assert.equal((await second.wait('state')).code,code);
  let elapsed=0;
  while(elapsed<15.1)elapsed=(await a.wait('state')).game.t;
  second.send({type:'leave'});assert.equal((await a.wait('end')).reward,true);
  const otherDevice=await client('22');assert.equal((await otherDevice.wait('ready')).profile.xp,35);
  a.send({type:'solo'});assert.equal((await a.wait('state')).game.pads.length,4);
});
