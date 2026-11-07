import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const executable=process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profileDir=await fs.mkdtemp(path.join(os.tmpdir(),'rikoshet-check-'));
const browser=spawn(executable,[
  '--headless','--disable-gpu','--disable-background-timer-throttling',
  '--remote-debugging-port=0','--user-data-dir='+profileDir,'about:blank'
],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=path.resolve('outputs/browser-check');
await fs.mkdir(output,{recursive:true});
let socket,server,networkServer;

try {
  let port;
  for(let attempt=0;attempt<100 && !port;attempt++){
    await delay(100);
    try{port=(await fs.readFile(path.join(profileDir,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{}
  }
  assert.ok(port,'Browser did not start');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(target=>target.type==='page' && target.url==='about:blank');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve=>socket.onopen=resolve);
  let sequence=0;
  const pending=new Map(),errors=[];
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    if(pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}
  };
  async function call(method,params={}){
    const id=++sequence;
    const reply=new Promise(resolve=>pending.set(id,resolve));
    socket.send(JSON.stringify({id,method,params}));
    const result=await reply;
    assert.ok(!result.error,JSON.stringify(result.error));
    return result.result;
  }
  async function evaluate(expression){
    const response=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    assert.ok(!response.exceptionDetails,JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function resize(width,height){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await delay(180);
  }
  async function screenshot(name){
    const shot=await call('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
  }
  await call('Runtime.enable');
  for(const entry of ['web','mobile']){
    await resize(390,844);
    await call('Page.navigate',{url:pathToFileURL(path.resolve('Релиз для GitHub Pages/'+entry+'.html')).href});
    await delay(500);
    assert.equal(await evaluate("scheme.value"),entry==='web'?'direct':'thumb');
    assert.ok(await evaluate("$('online-menu').hidden && $('create').hidden && $('join').hidden"),'Solo release has no unavailable online actions');
      await evaluate("$('help').open=true;$('help-done').click();$('sound-enabled').checked=true;$('sound-enabled').onchange();$('haptics-enabled').checked=true;$('haptics-enabled').onchange()");
      await call('Page.reload');await delay(350);
      assert.ok(await evaluate("!$('help').open && $('sound-enabled').checked && $('haptics-enabled').checked"),'Tutorial dismissal and feedback preferences persist');
      await evaluate("$('sound-enabled').checked=false;$('sound-enabled').onchange();$('haptics-enabled').checked=false;$('haptics-enabled').onchange()");
      await evaluate("$('difficulty').value='easy';$('difficulty').onchange()");
      await call('Page.reload');await delay(350);
      assert.equal(await evaluate("$('difficulty').value"),'easy','Difficulty persists');
      const initialWave=await evaluate('profile.wave');
    await resize(390,844);
    assert.ok(await evaluate("!profilePanel.open && $('solo').getBoundingClientRect().top<$('peer-entry').getBoundingClientRect().top && $('peer-entry').getBoundingClientRect().top<profileSummary.getBoundingClientRect().top"),'Start actions precede collapsed profile');
    await screenshot(entry+'-menu');
    assert.ok(await evaluate("$('wave-title').textContent.includes(waveRules(profile.wave).name)"),'Wave preview matches saved progression');
    await evaluate("$('solo').click()");
    await delay(100);
    assert.equal(await evaluate('game.wave'),initialWave);
    assert.equal(await evaluate('game.difficulty'),'easy');
    await evaluate('game.energy=100');await delay(40);
    await evaluate("$('magnet').click()");
    assert.ok(await evaluate('game.energy===0 && game.magnetUntil>game.t'),'Magnet UI spends energy and arms');
    await evaluate("$('help-button').click()");
    assert.ok(await evaluate('helpDialog.open && game.paused'),'Help pauses the match');
    await evaluate("$('close-help').click();$('resume').click()");
    assert.ok(await evaluate('!helpDialog.open && !game.paused'));
    if(entry==='web'){
      await evaluate('game.energy=100;game.magnetUntil=0');
      const board=await evaluate('table.getBoundingClientRect().toJSON()');
      await call('Input.dispatchMouseEvent',{type:'mousePressed',x:board.x+board.width/2,y:board.y+board.height/2,button:'right',clickCount:1});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:board.x+board.width/2,y:board.y+board.height/2,button:'right',clickCount:1});
      assert.ok(await evaluate('game.energy===0 && game.magnetUntil>game.t'),'Real right mouse click activates magnet');
    }
    assert.deepEqual(await evaluate('game.rules.bumpers'),await evaluate('waveRules(profile.wave).bumpers'));
    for(const [width,height] of [[320,568],[568,320],[390,844],[844,390],[720,720],[1280,720]]){
      await resize(width,height);
      assert.ok(await evaluate(`[table,cabinet,$('hit'),$('pause'),$('magnet'),$('hud'),$('help-button')].every(element=>{
        const r=element.getBoundingClientRect();
        return r.width>0 && r.height>0 && r.left>=0 && r.top>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;
      }) && document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight+1`),'Viewport '+width+'x'+height);
    }
    await resize(390,844);
    assert.ok(await evaluate("getComputedStyle(document.querySelector('.panel')).display==='none' && table.getBoundingClientRect().width>=innerWidth-12 && $('magnet').getBoundingClientRect().top>=$('touchpad').getBoundingClientRect().bottom-1"),'Full-width board and magnet under finger area');
    await screenshot(entry);
    if(entry==='mobile'){
      const box=await evaluate("$('touchpad').getBoundingClientRect().toJSON()");
      const x=box.x+box.width*.4,y=box.y+box.height*.5;
      for(const [type,points] of [['touchStart',[{x,y}]],['touchMove',[{x:x+40,y}]],['touchEnd',[]]]){
        await call('Input.dispatchTouchEvent',{type,touchPoints:points});
        await delay(45);
      }
      assert.ok(await evaluate('target>500 && game.pads[0].hit>=0'),'One finger release activates hit');
    }
    await evaluate("window.dispatchEvent(new Event('blur'))");
    const pausedTime=await evaluate('game.t');
    await delay(200);
    assert.equal(await evaluate('game.t'),pausedTime);
    assert.ok(await evaluate("!$('pause-screen').hidden"));
    await evaluate("$('resume').click()");
    await delay(150);
    assert.ok(await evaluate('game.t')>pausedTime);
    await evaluate("$('leave').click()");
    assert.ok(await evaluate("game.paused && !$('quit').hidden"));
    await evaluate("$('resume').click()");
    assert.ok(await evaluate('game && !game.paused'));
    // Force the existing victory condition, then let the regular simulation finish.
    await evaluate('game.hp=[8,0,0,0]');
    await delay(120);
    assert.ok(await evaluate("!game && !$('result').hidden"));
    assert.equal(await evaluate('profile.wave'),initialWave+1);
    assert.ok(await evaluate("!$('result-summary').hidden && $('result-summary').textContent.includes('Точные удары') && !$('result-level').hidden && $('xp-progress').value>0"),'Result statistics and progression visible after save');
    const xp=await evaluate('profile.xp');
    await evaluate('endLocal(true)');
    assert.equal(await evaluate('profile.xp'),xp,'Reward cannot be granted twice');
    await screenshot(entry+'-result');
    await call('Page.reload');
    await delay(350);
    assert.equal(await evaluate('profile.wave'),initialWave+1,'Saved progression after reload');
    assert.ok(await evaluate("$('wave-title').textContent.includes(waveRules(profile.wave).name)"),'Preview advances after victory');
    await evaluate("$('solo').click();$('settings').open=true;scheme.value='thumb';scheme.onchange();sensitivity.value='2';sensitivity.oninput()");
    await resize(568,320);
    await screenshot(entry+'-landscape');
    // Selection changes must not fire a queued ability or leave a drag captured.
    assert.ok(await evaluate('pointer===null && hit===false'));
    console.log(entry+': layout, pause, controls, reward and save OK');
  }
  await evaluate("endLocal(false);localStorage.setItem('rikoshet-local-v1',JSON.stringify({...profile,shards:600,owned:['amber'],skin:'amber'}))");
  await call('Page.reload');await delay(400);
  await evaluate("$('shop').open=true;$('shop-items').children[1].click()");
  assert.ok(await evaluate("!$('purchase-confirm').hidden && profile.shards===600"),'Purchase requires confirmation');
  await evaluate("$('purchase-no').click()");
  assert.equal(await evaluate('profile.shards'),600);
  await evaluate("$('shop-items').children[1].click();$('purchase-yes').click()");await delay(100);
  assert.equal(await evaluate('profile.shards'),300);
  await evaluate("send({type:'buy',skin:'ice'})");await delay(100);
  assert.equal(await evaluate('profile.shards'),300,'Owned skin never charges twice');
  await call('Page.reload');await delay(400);
  assert.equal(await evaluate('profile.skin'),'ice');
  await evaluate("$('shop').open=true");await resize(390,844);await screenshot('solo-shop');
  console.log('Cosmetic purchase confirmation, balance and persistence OK');
  networkServer=spawn(process.execPath,['server.js'],{
    env:{...process.env,PORT:'0',DB_PATH:':memory:',NODE_ENV:'test',VK_APP_ID:'',VK_SECRET:'',PUBLIC_ORIGIN:''},
    windowsHide:true,stdio:['ignore','pipe','pipe']
  });
  const serverAddress=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Local server did not start')),5000);
    networkServer.stdout.once('data',data=>{clearTimeout(timer);resolve(data.toString().match(/http:\/\/[^\s]+/)[0]);});
  });
  await call('Page.navigate',{url:serverAddress+'/web.html'});
  await delay(600);
  assert.ok(await evaluate('online'),'Server connection');
  await evaluate("$('solo').click()");
  await delay(250);
  assert.ok(await evaluate('game && game.solo'));
  await evaluate("$('pause').click()");
  await delay(150);
  const networkPausedTime=await evaluate('game.t');
  await delay(200);
  assert.equal(await evaluate('game.t'),networkPausedTime);
  await evaluate("$('resume').click()");
  await delay(180);
  assert.ok(await evaluate('game.t')>networkPausedTime);
  console.log('Network client and authoritative pause OK');
  server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/cloud.html'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      const mock=`window.vkBridge={isEmbedded:()=>true,subscribe:()=>{},async send(method,args){
        if(window.failCloud && method.startsWith('VKWebAppStorage'))throw Error('offline');
        if(method==='VKWebAppStorageGet')return {keys:[{key:args.keys[0],value:localStorage.getItem('mock-vk-cloud')||''}]};
        if(method==='VKWebAppStorageSet'){localStorage.setItem('mock-vk-cloud',args.value);return {result:true};}
        return {result:true};}};`;
      res.end((await fs.readFile('Релиз для GitHub Pages/mobile.html','utf8')).replace('const launch = location.search;',mock+'\nconst launch = location.search;'));return;
    }
    if(url.pathname==='/'){
      res.setHeader('Content-Type','text/html');
      res.end('<script>window.events=[];onmessage=e=>events.push(e.data);</script><iframe src="/mobile.html?vk_app_id=123&vk_platform=desktop_web" style="width:390px;height:750px"></iframe>');
      return;
    }
    if(url.pathname!=='/mobile.html'){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(await fs.readFile('Релиз для GitHub Pages/mobile.html'));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await delay(500);
  assert.ok(await evaluate("events.some(event=>event?.handler==='VKWebAppInit')"),'VK initialization');
  await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/cloud.html?vk_app_id=123&vk_user_id=42'});await delay(500);
  assert.ok(await evaluate("online && $('save-note').textContent.includes('сохранён в VK')"),'Cloud status');
  await evaluate("start('solo')");await evaluate('game.hp=[8,0,0,0]');await delay(150);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("mock-vk-cloud")).profile.wave'),2);
  await evaluate("localStorage.removeItem('rikoshet-vk-123-42')");
  await call('Page.reload');await delay(400);
  assert.equal(await evaluate('profile.wave'),2,'Cloud restores without the device cache');
  await evaluate("window.failCloud=true;start('solo')");await delay(100);
  await evaluate('game.hp=[8,0,0,0]');await delay(150);
  assert.ok(await evaluate("!$('sync-save').hidden && profile.wave===3"),'Offline progress has retry');
  await evaluate("window.failCloud=false;$('sync-save').click()");await delay(150);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("mock-vk-cloud")).profile.wave'),3);
  await screenshot('vk-save');
  assert.ok(errors.length===0,JSON.stringify(errors));
  console.log('VK init and browser exception checks OK');
} finally {
  socket?.close();
  server?.close();
  networkServer?.kill();
  browser.kill();
}
