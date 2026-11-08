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
const server=createServer(async(req,res)=>{if(req.url==='/images/splash.webp'){res.setHeader('Content-Type','image/webp');res.end(await fs.readFile('images/splash.webp'));return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile('Релиз для GitHub Pages/mobile.html'));});
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
  const a=await page(),b=await page();
  const profiles=await Promise.all([a.evaluate('JSON.stringify(profile)'),b.evaluate('JSON.stringify(profile)')]);
  await a.evaluate("$('peer-entry').click();$('peer-host').click()");
  await a.until("$('peer-output').value.startsWith('RK1.')");
  assert.ok(await a.evaluate("$('peer-output').checkVisibility() && $('peer-cancel').checkVisibility()"),'Host code and cancel must be visible before match');
  const offer=await a.evaluate("$('peer-output').value");
  assert.deepEqual(await a.evaluate('testPeers[0].getConfiguration().iceServers'),[],'No STUN or TURN');
  await b.evaluate("$('peer-entry').click();$('peer-input').value='invalid';$('peer-join').click()");
  assert.ok(await b.evaluate("!peerSession.active() && $('peer-status').textContent.includes('RK1.')"));
  await b.evaluate("$('peer-input').value="+JSON.stringify(offer)+";$('peer-join').click()");
  await b.until("$('peer-output').value.startsWith('RK1.')");
  assert.ok(await b.evaluate("$('peer-output').checkVisibility() && $('peer-cancel').checkVisibility()"),'Guest code and cancel must be visible before match');
  const answer=await b.evaluate("$('peer-output').value");
  const wrong=JSON.parse(atob(answer.slice(4)));wrong.room='0'.repeat(24);
  await a.evaluate("$('peer-input').value="+JSON.stringify('RK1.'+btoa(JSON.stringify(wrong)))+";$('peer-apply').click()");
  assert.ok(await a.evaluate("$('peer-status').textContent.includes('другое')"));
  await a.evaluate("$('peer-input').value="+JSON.stringify(answer)+";$('peer-apply').click()");
  await a.until("!$('peer-start').hidden",30000);
  await a.evaluate("$('peer-start').click()");await b.until('game && !game.solo');
  assert.equal(await a.evaluate('seat'),0);assert.equal(await b.evaluate('seat'),1);
  await a.evaluate('target=800');await b.evaluate('target=200');await delay(500);
  assert.ok(await a.evaluate('game.pads[0].x>700 && game.pads[1].x<300'));
  const times=await Promise.all([a.evaluate('game.t'),b.evaluate('game.t')]);assert.ok(Math.abs(times[0]-times[1])<.2,'Single host clock');
  await b.evaluate("window.dispatchEvent(new Event('blur'))");await a.until('game.paused');
  const paused=await a.evaluate('game.t');await delay(300);assert.equal(await a.evaluate('game.t'),paused);
  await b.evaluate("$('resume').click()");await a.until('!game.paused');
  // Each peer sizes itself, including a zoomed visual viewport after code entry.
  for(const client of [a,b]){
    await client.call('Page.bringToFront');
    for(const [width,height] of [[320,568],[568,320],[390,660],[844,390]]){
      await client.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      for(const scale of [1,1.5]){
        await client.call('Emulation.setPageScaleFactor',{pageScaleFactor:scale});await delay(500);
        assert.ok(await client.evaluate(`[table,cabinet,$('hit'),$('pause'),$('leave'),$('help-button'),$('touchpad'),$('music-toggle'),$('sound-toggle')].every(el=>{const r=el.getBoundingClientRect(),v=visualViewport;return r.width>0&&r.left>=v.offsetLeft-1&&r.top>=v.offsetTop-1&&r.right<=v.offsetLeft+v.width+1&&r.bottom<=v.offsetTop+v.height+1;})`),'Duel fits '+width+'x'+height+' at zoom '+scale+' '+JSON.stringify(await client.evaluate("({viewport:[visualViewport.offsetLeft,visualViewport.offsetTop,visualViewport.width,visualViewport.height],rects:[table,cabinet,$('hit'),$('pause'),$('leave'),$('help-button'),$('touchpad'),$('music-toggle'),$('sound-toggle')].map(el=>[el.id,el.getBoundingClientRect().toJSON()])})")));
        assert.ok(await client.evaluate('Math.abs(table.getBoundingClientRect().width-table.getBoundingClientRect().height)<1'),'Arena remains square');
      }
      await client.call('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    }
  }
  await fs.mkdir('outputs/browser-check',{recursive:true});
  for(const [name,client] of [['peer-host',a],['peer-guest',b]]){
    const shot=await client.call('Page.captureScreenshot',{format:'png'});await fs.writeFile('outputs/browser-check/'+name+'.png',Buffer.from(shot.data,'base64'));
  }
  await a.evaluate('game.t=1;game.score=[0,0];game.pads[0].x=game.pads[0].target=500;game.pads[0].hit=-10;Object.assign(game.balls[0],{x:500,y:951,vx:0,vy:360,minSpeed:360});game.paused=false');
  await a.until('game.balls[0].minSpeed===396');await a.evaluate('game.paused=true');
  await b.until('game.paused && game.balls[0].minSpeed===396');
  assert.deepEqual(await b.evaluate('game.balls'),await a.evaluate('game.balls'),'Rally heat and speed are authoritative on host');
  for(const [time,count] of [[30,1],[60,1],[120,1]]){
    await a.evaluate(`game.t=${time}-.01;game.score=[0,0];game.paused=false`);
    await a.until(`game.t>=${time} && game.balls.length===${count}`);
    await a.evaluate('game.paused=true');
    await b.until(`game.balls.length===${count} && game.paused`);
    assert.deepEqual(await b.evaluate('game.balls'),await a.evaluate('game.balls'),'Duel stays connected with one synchronized ball after former spawn times');
  }
  await b.evaluate("$('resume').click()");await a.until('!game.paused');
  await a.evaluate('game.score=[7,2]');await a.until('duelResultDialog.open');await b.until('duelResultDialog.open');
  assert.equal(await a.evaluate("$('duel-winner-name').textContent"),'ТЫ');
  assert.equal(await b.evaluate("$('duel-loser-name').textContent"),'ТЫ');
  for(const client of [a,b]){
    assert.deepEqual(await client.evaluate("[$('duel-winner-score').textContent,$('duel-loser-score').textContent]"),['7','2'],'Final score delivered with result');
    assert.ok(await client.evaluate('game && game.paused && game.winner===0 && inRoom'),'Arena retained behind result');
    for(const [width,height] of [[320,568],[568,320],[390,660]]){
      await client.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(200);
      assert.ok(await client.evaluate("(()=>{const r=duelResultDialog.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()"),'Result fits mobile viewport');
    }
  }
  const finalTime=await b.evaluate('game.t');await delay(700);assert.equal(await b.evaluate('game.t'),finalTime,'Final arena is frozen');
  for(const [name,client] of [['duel-victory',a],['duel-defeat',b]]){
    const shot=await client.call('Page.captureScreenshot',{format:'png'});await fs.writeFile('outputs/browser-check/'+name+'.png',Buffer.from(shot.data,'base64'));
  }
  await a.evaluate("$('duel-result-menu').click()");await a.until('!game');await delay(300);
  assert.ok(await b.evaluate('duelResultDialog.open && game'),'Opponent leaving cannot dismiss your result');
  await b.evaluate("$('duel-result-menu').click()");await b.until('!game');
  assert.equal(await a.evaluate('JSON.stringify(profile)'),profiles[0]);assert.equal(await b.evaluate('JSON.stringify(profile)'),profiles[1]);
  await a.evaluate("$('peer-host').click()");await a.until("$('peer-output').value.startsWith('RK1.')");
  const nextOffer=await a.evaluate("$('peer-output').value");
  await b.evaluate("$('peer-input').value="+JSON.stringify(nextOffer)+";$('peer-join').click()");await b.until("$('peer-output').value.startsWith('RK1.')");
  const nextAnswer=await b.evaluate("$('peer-output').value");
  await a.evaluate("$('peer-input').value="+JSON.stringify(nextAnswer)+";$('peer-apply').click()");await a.until("!$('peer-start').hidden");
  await a.evaluate("$('peer-start').click()");await b.until('game && !game.solo');
  await a.evaluate('game.score=[1,7]');await a.until('duelResultDialog.open');await b.until('duelResultDialog.open');
  assert.equal(await a.evaluate("$('duel-loser-name').textContent"),'ТЫ');
  assert.equal(await b.evaluate("$('duel-winner-name').textContent"),'ТЫ');
  for(const client of [a,b])await client.evaluate("$('duel-result-menu').click()");
  await a.evaluate("$('peer-host').click()");await a.until("$('peer-output').value.startsWith('RK1.')");
  const thirdOffer=await a.evaluate("$('peer-output').value");
  await b.evaluate("$('peer-input').value="+JSON.stringify(thirdOffer)+";$('peer-join').click()");await b.until("$('peer-output').value.startsWith('RK1.')");
  const thirdAnswer=await b.evaluate("$('peer-output').value");
  await a.evaluate("$('peer-input').value="+JSON.stringify(thirdAnswer)+";$('peer-apply').click()");await a.until("!$('peer-start').hidden");
  await a.evaluate("$('peer-start').click()");await b.until('game && !game.solo');
  await b.evaluate('testPeers.at(-1).close()');await a.until('!peerSession.active()');
  const closure=await a.evaluate("$('peer-status').textContent");
  assert.match(closure,/закрыта|Ошибка прямого|Соединение потеряно|Сеть не позволяет|не отвечает/,'Disconnect explains closure: '+closure);
  await a.evaluate("$('peer-host').click()");await a.until("$('peer-output').value.startsWith('RK1.')");
  await a.evaluate("$('peer-cancel').click()");assert.ok(await a.evaluate('!peerSession.active() && !inRoom'));
  await a.evaluate("start('solo')");await a.until('game && game.solo');
  assert.equal(await a.evaluate('seat'),0,'Solo after duel uses bottom seat');
  for(const client of sessions)assert.deepEqual(client.errors,[]);
  console.log('Real WebRTC: manual offer/answer, wrong code rejection, host physics, both controls, pause, layout, result, unchanged solo progress and cleanup OK');
}finally{for(const s of sessions)s.ws.close();server.close();browser.kill();}
