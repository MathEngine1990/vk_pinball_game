import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'rikoshet-peer-'));
const browser=spawn(process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--remote-debugging-port=0','--user-data-dir='+directory,'about:blank'
],{windowsHide:true,stdio:'ignore'});
const server=createServer(async(req,res)=>{
  const name=req.url.split('?')[0];
  if(name==='/images/splash.webp'){res.setHeader('Content-Type','image/webp');res.end(await fs.readFile('images/splash.webp'));return;}
  if(/^\/audio\/runtime\/(manifest.json|menu.m4a|track-0[123]\/(drums|bass|other)-\d+\.m4a)$/.test(name)){
    res.setHeader('Content-Type',name.endsWith('.json')?'application/json':'audio/mp4');
    try{res.end(await fs.readFile('.'+name));}catch{res.writeHead(404).end();}return;
  }
  if(/^\/audio\/sfx\/(click|bounce|perfect-hit|goal-win|goal-lose|magnet-catch)\.wav$/.test(name)){res.setHeader('Content-Type','audio/wav');res.end(await fs.readFile('.'+name));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile('Релиз для GitHub Pages/mobile.html'));
});
const sessions=[];
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let port;for(let i=0;i<100&&!port;i++){await delay(100);try{port=(await fs.readFile(path.join(directory,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{}}
  assert.ok(port,'Browser started');
  async function page(){
    const target=await (await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
    const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),errors=[];let seq=0;
    await new Promise(r=>ws.onopen=r);
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
    async function call(method,params={}){const id=++seq;const result=await new Promise(resolve=>{pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});assert.ok(!result.error,JSON.stringify(result.error));return result.result;}
    async function evaluate(expression){const r=await call('Runtime.evaluate',{expression:"if(typeof splashShown!=='undefined' && splashShown)$('splash-enter').click();\n"+expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;}
    async function until(expression,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression+' '+await evaluate("$('peer-status').textContent"));}
    const result={call,evaluate,until,ws,errors};sessions.push(result);
    await call('Runtime.enable');await call('Page.enable');await call('Emulation.setFocusEmulationEnabled',{enabled:true});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.testPeers=[];window.RTCPeerConnection=class extends RTCPeerConnection{constructor(config){super(config);window.testPeers.push(this);}};'});
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/mobile.html'});await until("typeof online!=='undefined' && online");
    return result;
  }
  const a=await page();
  assert.deepEqual(await a.evaluate('[musicSettings.volume,audioMix.effects]'),[.25,.1],'New default audio balance');
  assert.ok(await a.evaluate("$('music-toggle').checkVisibility() && $('sound-toggle').checkVisibility() && $('music-volume').checkVisibility() && $('sound-volume').checkVisibility()"),'Audio controls visible in main menu');
  await a.evaluate("$('sound-volume').value=.3;$('sound-volume').oninput();$('music-volume').value=.4;$('music-volume').oninput()");
  assert.equal(await a.evaluate('soundController.inspect().volume'),.3);
  await a.evaluate("$('music-toggle').click();$('sound-toggle').click()");
  assert.ok(await a.evaluate("!musicSettings.enabled && !feedbackSettings.sound && $('music-toggle').getAttribute('aria-pressed')==='false' && $('sound-toggle').getAttribute('aria-pressed')==='false'"));
  await a.evaluate("$('music-toggle').click();$('sound-toggle').click();feedbackSettings.sound=false");

  await a.call('Runtime.evaluate',{expression:"window.audioStarts=[];const originalStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){audioStarts.push({when:args[0],duration:args[2],buffer:this.buffer.duration,rate:this.playbackRate.value});return originalStart.apply(this,args);};musicController.unlock()",userGesture:true});
  await a.until("musicController.inspect().scene==='menu' && musicController.inspect().loaded",20000);
  for(let n=0;n<3;n++){
    await a.evaluate('game=arena(false);game.paused=true;controls(true);musicController.tick()');
    await a.until("musicController.inspect().scene==='match' && musicController.inspect().loaded",20000);
    assert.equal(await a.evaluate('musicController.inspect().track'),'track-0'+(n+1));
    await a.until('musicController.inspect().gains.length===3 && musicController.inspect().gains.every(v=>Math.abs(v-1)<.01)');
    await a.evaluate('game.balls[0].minSpeed=1080;musicController.tick()');
    assert.equal(await a.evaluate('musicController.inspect().level'),1);
    if(n===0){
      await delay(14000);assert.ok(await a.evaluate('musicController.inspect().sources<=6 && !musicController.inspect().failed'));
      for(const [count,want] of [[1,[1,0,0]],[2,[1,1,0]],[3,[1,1,1]],[1,[1,0,0]]]){
        await a.evaluate(`game.solo=true;game.hp[0]=1;game.balls=Array.from({length:${count}},()=>({x:500,y:500,vx:0,vy:0}));musicController.tick()`);
        if(count===3){
          assert.ok(await a.evaluate('musicController.inspect().gains[2]<.1'),'Third instrument starts near silence');
          await delay(1800);
          assert.ok(await a.evaluate('musicController.inspect().gains[2]>.1 && musicController.inspect().gains[2]<.4'),'Third instrument gradually rises, instead of switching on');
          assert.ok(await a.evaluate('musicController.inspect().gains.slice(0,2).every(v=>Math.abs(v-1)<.01)'),'Drums and bass stay at their normal volume');
        }
        await a.until(`musicController.inspect().gains.every((v,i)=>Math.abs(v-${JSON.stringify(want)}[i])<.01)`);
        assert.equal(await a.evaluate('musicController.inspect().track'),'track-01','Instrument changes keep the same synchronized track');
      }
      await a.evaluate('game.solo=false;musicController.tick()');
      await a.until('musicController.inspect().gains.every(v=>Math.abs(v-1)<.01)');
    }
    await a.evaluate('game=null;controls(false);musicController.tick()');
    await a.until("musicController.inspect().scene==='menu' && musicController.inspect().loaded");
  }
  await a.evaluate('musicViewHidden=true;musicController.tick()');
  assert.equal(await a.evaluate('musicController.inspect().scene'),'');
  await a.evaluate('musicViewHidden=false;musicController.tick()');
  await a.until("musicController.inspect().scene==='menu' && musicController.inspect().loaded");
  const starts=await a.evaluate('audioStarts');assert.ok(starts.length>=9);
  for(let i=0;i<starts.length;i+=3){assert.equal(starts[i].when,starts[i+1].when);assert.equal(starts[i].when,starts[i+2].when);assert.ok(Math.abs(starts[i].buffer-starts[i].duration)<.07);}
  await a.evaluate("$('music-enabled').checked=false;$('music-enabled').onchange()");
  assert.equal(await a.evaluate('musicController.inspect().scene'),'');
  assert.equal(await a.evaluate('musicController.inspect().sources'),0);
  await a.call('Runtime.evaluate',{expression:"feedbackSettings.sound=true;unlockAudio();soundController.preload()",userGesture:true,awaitPromise:true});
  assert.equal(await a.evaluate('soundController.inspect().loaded.length'),6,'All six WAV effects decode');
  const effectStart=await a.evaluate('audioStarts.length');
  for(const kind of ['click','bounce','perfect','goal-win','goal-lose','magnet']){
    await a.evaluate(`feedback('${kind}')`);await delay(180);
  }
  assert.equal(await a.evaluate('audioStarts.length'),effectStart+6,'All gameplay sound mappings play a sample');
  await a.evaluate("soundController.play('bounce',1)");
  assert.ok(Math.abs(await a.evaluate('audioStarts.at(-1).rate')-1.45)<1e-6,'Hot duel changes impact pitch');
  await a.evaluate("$('sound-enabled').checked=false;$('sound-enabled').onchange()");
  assert.equal(await a.evaluate('soundController.inspect().voices'),0,'Disabling effects stops active voices');
  await a.call('Page.reload');await a.until("typeof online!=='undefined' && online");
  assert.equal(await a.evaluate('musicSettings.enabled'),false);
  assert.deepEqual(await a.evaluate('[musicSettings.volume,audioMix.effects]'),[.4,.3],'Balance survives reload');
  assert.deepEqual(a.errors,[]);
  console.log('Music: real AAC decode, menu, three track rotations, synchronized stems, chunk boundary, ball-count layers, full duel mix, mute, six WAV effects, heat pitch and persistence OK');
}finally{for(const s of sessions)s.ws.close();server.close();browser.kill();}
