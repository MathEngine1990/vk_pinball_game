import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHmac} from 'node:crypto';
import {WebSocket} from 'ws';
import {arena,step,input,rewards,waveRules,bumpers,activateMagnet} from './physics.js';
import {levelProgress} from './catalog.js';

test('level progress crosses multiple levels without losing experience',()=>{
  assert.deepEqual(levelProgress(69),{level:1,xp:69,cost:70,remaining:1});
  assert.deepEqual(levelProgress(70+90+4),{level:3,xp:4,cost:114,remaining:110});
});
test('difficulty changes bots only, with equal rewards and unchanged duel rules',()=>{
  const easy=arena(true,8,'easy'),normal=arena(true,8),hard=arena(true,8,'hard');
  assert.ok(easy.rules.botSpeed<normal.rules.botSpeed && normal.rules.botSpeed<hard.rules.botSpeed);
  assert.ok(easy.rules.botReaction>hard.rules.botReaction && easy.rules.botError>hard.rules.botError);
  normal.winner=0;
  for(const g of [easy,normal,hard]){g.winner=0;assert.equal(g.rules.speed,normal.rules.speed);assert.deepEqual(rewards(g,0),rewards(normal,0));}
  assert.equal(arena(false,8,'hard').rules,null);
});
test('magnet needs energy, captures one ball, freezes on pause and releases safely',()=>{
  const g=arena(true);assert.equal(activateMagnet(g),false);
  for(let i=0;i<2;i++){
    g.pads[0].hit=g.t;g.balls=[{x:500,y:948,vx:0,vy:360}];step(g,1/60);
  }
  assert.equal(g.energy,100);assert.equal(g.pads[0].perfect,2);
  assert.equal(activateMagnet(g),true);assert.equal(g.energy,0);assert.equal(activateMagnet(g),false);
  g.balls=[{x:500,y:948,vx:0,vy:360}];step(g,1/60);
  assert.ok(g.balls[0].heldUntil>g.t);assert.equal(g.balls[0].vy,0);
  g.paused=true;const t=g.t;step(g,2);assert.equal(g.t,t);assert.equal(activateMagnet(g),false);
  g.paused=false;input(g,0,700,false);step(g,.1);assert.equal(g.balls[0].x,g.pads[0].x);
  for(let i=0;i<65;i++)step(g,1/60);
  assert.equal(g.balls[0].heldUntil,0);assert.ok(g.balls[0].vy<0);
  const duel=arena(false);duel.energy=100;assert.equal(activateMagnet(duel),false);
  g.energy=100;assert.equal(activateMagnet(g),true);g.balls=[{x:500,y:500,vx:0,vy:0}];
  for(let i=0;i<241;i++)step(g,1/60);
  assert.ok(g.magnetUntil<g.t);assert.equal(g.balls[0].heldUntil,undefined);
});

test('wave variants have matching geometry, schedules and bounded difficulty',()=>{
  for(const invalid of [0,-1,NaN,Infinity,'2'])assert.deepEqual(waveRules(invalid),waveRules(1));
  assert.deepEqual(waveRules(1).bumpers,bumpers);
  assert.notDeepEqual(waveRules(2).bumpers,bumpers);
  for(const wave of [1,2,3,4,5,6,7,1000000]){
    const g=arena(true,wave), rules=waveRules(wave);
    assert.ok(rules.speed<=480 && rules.botSpeed<=480 && rules.botReaction>=.1);
    assert.ok(Math.abs(Math.hypot(g.balls[0].vx,g.balls[0].vy)-rules.speed)<1e-8);
    for(const [index,time] of rules.ballsAt.entries()){
      g.t=time-.02;step(g,.01);assert.equal(g.balls.length,index+1);
      step(g,.02);assert.equal(g.balls.length,index+2);
    }
  }
  const g=arena(true,2);g.balls=[{x:500,y:330,vx:0,vy:-360}];
  step(g,1/60);assert.ok(g.balls[0].vy>0,'Diamond bumper reflects the ball at its visible position');
  assert.equal(arena(false,1000000).rules,null,'Progression never changes PvP rules');
});
test('ordinary solo reflection charges magnet without rewarding idle time or changing duel',()=>{
  const g=arena(true);g.balls=[{x:500,y:948,vx:0,vy:360}];step(g,1/60);assert.equal(g.energy,55);
  g.energy=98;g.balls=[{x:500,y:948,vx:0,vy:360}];step(g,1/60);assert.equal(g.energy,100);
  g.energy=0;g.paused=true;step(g,100);assert.equal(g.energy,0);
  const duel=arena(false);duel.balls=[{x:500,y:948,vx:0,vy:360}];step(duel,1/60);assert.equal(duel.energy,50);
});
test('solo shard rewards are bounded for wins and losses, PvP rewards stay unchanged',()=>{
  const g=arena(true);g.winner=1;assert.equal(rewards(g,0).shards,20);
  g.winner=0;assert.equal(rewards(g,0).shards,30);
  g.pads[0].perfect=10000;assert.equal(rewards(g,0).shards,35);
  g.winner=1;assert.equal(rewards(g,0).shards,25);
  const duel=arena(false);duel.winner=0;assert.deepEqual(rewards(duel,0),{xp:55,shards:30,wave:0,mmr:16});
  for(let wave=2;wave<=100;wave++){
    const a=waveRules(wave-1),b=waveRules(wave);
    assert.ok(b.botSpeed>=a.botSpeed && b.botSpeed-a.botSpeed<=6);
    assert.ok(b.botReaction<=a.botReaction && b.botReaction>=.1);
  }
});

test('pause freezes physics and rejects controls until resumed',()=>{
  const g=arena(true);
  g.paused=true;
  const before=JSON.stringify(g);
  input(g,0,900,true);
  step(g,1/60);
  assert.equal(JSON.stringify(g),before);
  g.paused=false;
  input(g,0,900,true);
  step(g,1/60);
  assert.ok(g.t>0 && g.pads[0].x>500);
});

test('fast ball reflects on all four paddles and closed goals remain walls',()=>{
  const cases=[
    {x:500,y:945,vx:0,vy:740,axis:'vy',sign:-1},
    {x:500,y:55,vx:0,vy:-740,axis:'vy',sign:1},
    {x:55,y:500,vx:-740,vy:0,axis:'vx',sign:1},
    {x:945,y:500,vx:740,vy:0,axis:'vx',sign:-1}
  ];
  for(const b of cases){
    const g=arena(true);
    g.balls=[{...b}];
    step(g,1/60);
    assert.ok(g.balls[0][b.axis]*b.sign>0);
    assert.deepEqual(g.hp,[8,8,8,8]);
  }
  const g=arena(true);
  g.hp[3]=0;g.balls=[{x:985,y:500,vx:740,vy:0}];
  step(g,1/60);
  assert.equal(g.hp[3],0);
  assert.ok(g.balls[0].vx<0);
});

test('cooldown, goal event and shared solo rewards',()=>{
  const g=arena(true);
  input(g,0,500,true);const first=g.pads[0].hit;
  g.t=.3;input(g,0,500,true);
  assert.equal(g.pads[0].hit,first);
  g.t=.81;input(g,0,500,true);
  assert.equal(g.pads[0].hit,.81);
  g.balls=[{x:330,y:985,vx:0,vy:360}];step(g,1/60);
  assert.equal(g.goalCount,1);assert.equal(g.lastGoal.side,0);
  g.winner=0;g.pads[0].perfect=100;
  assert.deepEqual(rewards(g,0),{xp:45,shards:35,wave:1,mmr:0});
});

test('all six wave layouts stay finite, bounded and always resolve',()=>{
  for(const wave of [1,2,3,4,5,6]){
    const g=arena(true,wave);
    for(let tick=0;tick<9002 && g.winner===null;tick++){
      const nearest=g.balls.reduce((a,b)=>a.y>b.y?a:b);
      input(g,0,nearest.x,tick%50===0);
      step(g,1/60);
      assert.ok(g.hp.every(hp=>hp>=0));
      for(const b of g.balls){
        assert.ok([b.x,b.y,b.vx,b.vy].every(Number.isFinite));
        assert.ok(b.x>=0 && b.x<=1000 && b.y>=0 && b.y<=1000);
        assert.ok(Math.hypot(b.vx,b.vy)<=740.0001);
      }
    }
    assert.notEqual(g.winner,null);
  }
});

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
  for(const path of ['/','/web.html','/mobile.html','/bridge.js','/game.js','/session.js','/platform.js','/style.css'])assert.equal((await fetch(url+path)).status,200);
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
  a.send({type:'pause',paused:true});
  let paused;
  do{paused=(await a.wait('state')).game;}while(!paused.paused);
  for(let i=0;i<3;i++)assert.equal((await a.wait('state')).game.t,paused.t);
  a.send({type:'pause',paused:false});
  let resumed;
  do{resumed=(await a.wait('state')).game;}while(resumed.paused);
  assert.ok(resumed.t>=paused.t);
});

test('duel keeps one ball through former spawn times, goals and overtime',()=>{
  const g=arena(false);
  for(const time of [30,60,120,150]){
    g.t=time-.02;step(g,.01);assert.equal(g.balls.length,1);
    g.paused=true;step(g,5);assert.equal(g.balls.length,1);
    g.paused=false;step(g,.02);assert.equal(g.balls.length,1);
  }
  g.t=90;
  Object.assign(g.balls[0],{x:330,y:985,vx:0,vy:360});
  step(g,1/60);assert.equal(g.score[1],1);assert.equal(g.balls.length,1);
  g.winner=0;const time=g.t;step(g,1);assert.equal(g.t,time);
});

test('duel rally speed rises for either player, stays hot until goal and resets',()=>{
  const g=arena(false),b=g.balls[0];
  for(let n=0;n<25;n++){
    const side=n%2,old=Math.hypot(b.vx,b.vy);
    Object.assign(b,{x:500,y:side?49:951,vx:0,vy:side?-old:old});
    step(g,1/120);
    assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-Math.min(1080,360+(n+1)*36))<1e-7);
    assert.ok(side?b.vy>0:b.vy<0,'Fast ball still reflects');
  }
  Object.assign(b,{x:500,y:500,vx:100,vy:0});step(g,1/120);
  assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-1080)<1e-7,'Floor survives slowdown');
  g.paused=true;const frozen=JSON.stringify(g);step(g,.1);assert.equal(JSON.stringify(g),frozen);g.paused=false;
  Object.assign(b,{x:330,y:985,vx:0,vy:1080});step(g,1/120);
  assert.equal(g.score[1],1);assert.equal(b.minSpeed,360);assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-360)<1e-7);
  assert.equal(g.balls.length,1);
});
test('solo reflection retains original speed and duel precise hits raise the floor',()=>{
  for(const solo of [true,false]){
    const g=arena(solo);g.balls=[{x:500,y:951,vx:0,vy:360}];step(g,1/120);
    assert.ok(Math.abs(Math.hypot(g.balls[0].vx,g.balls[0].vy)-(solo?372:396))<1e-7);
    if(solo)assert.equal(g.balls[0].minSpeed,undefined);
  }
  const g=arena(false);g.pads[0].hit=0;g.balls=[{x:500,y:951,vx:0,vy:360}];step(g,1/120);
  assert.equal(g.balls[0].minSpeed,520);
});
