import http from 'node:http';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {arena,input,step,rewards} from './physics.js';

const {VK_APP_ID,VK_SECRET,PUBLIC_ORIGIN}=process.env;
const production=Boolean(VK_APP_ID || VK_SECRET || PUBLIC_ORIGIN || process.env.NODE_ENV==='production');
if(production && !(VK_APP_ID && VK_SECRET && /^https:\/\/[^/]+$/.test(PUBLIC_ORIGIN))) throw Error('Configure VK_APP_ID, VK_SECRET and HTTPS PUBLIC_ORIGIN');
const db=new DatabaseSync(process.env.DB_PATH || 'arena.sqlite');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,xp INTEGER DEFAULT 0, shards INTEGER DEFAULT 0,wave INTEGER DEFAULT 1,mmr INTEGER DEFAULT 1000)');
const profile=id=>db.prepare('SELECT xp,shards,wave,mmr FROM players WHERE id=?').get(id);
const clients=new Map(), rooms=new Map(), membership=new Map();
const files=new Map(Object.entries({'/':['public/index.html','text/html'],'/game.js':['public/game.js','text/javascript'],'/style.css':['public/style.css','text/css'],'/bridge.js':['node_modules/@vkontakte/vk-bridge/dist/browser.min.js','text/javascript']}));
for(const entry of ['/web.html','/mobile.html','/index.html'])files.set(entry,files.get('/'));
files.set('/platform.js',['public/platform.js','text/javascript']);
files.set('/session.js',['public/network-session.js','text/javascript']);
const server=http.createServer((req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  const file=files.get(req.url.split('?')[0]);
  if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file[1]+'; charset=utf-8');
  let content=readFileSync(new URL(file[0],import.meta.url),'utf8');
  if(file[1]==='text/html'){
    content=content.replace('<!-- GAME_SCRIPTS -->',
      '<script src="/bridge.js"></script><script src="/platform.js"></script><script src="/session.js"></script><script src="/game.js"></script>');
  }
  res.end(content);
});
const ws=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,sock,head)=>{
  const origin=production?PUBLIC_ORIGIN:'http://'+req.headers.host;
  if(req.url!=='/play' || req.headers.origin!==origin){sock.destroy();return;}
  ws.handleUpgrade(req,sock,head,s=>ws.emit('connection',s));
});
function identity(msg) {
  if(!production) return typeof msg.guest==='string' && /^[a-f0-9-]{36}$/.test(msg.guest)?'guest-'+msg.guest:null;
  if(typeof msg.launch!=='string')return null;
  const params=new URLSearchParams(msg.launch);
  if(new Set(params.keys()).size!==params.size || params.get('vk_app_id')!==VK_APP_ID || !/^\d+$/.test(params.get('vk_user_id')||'')) return null;
  const age=Date.now()/1000-Number(params.get('vk_ts'));
  if(!Number.isFinite(age)||age< -60||age>600) return null;
  const signed=new URLSearchParams([...params].filter(([k])=>k.startsWith('vk_')));
  signed.sort();
  const expected=createHmac('sha256',VK_SECRET).update(signed.toString()).digest('base64url');
  const actual=Buffer.from(params.get('sign')||'');
  if(actual.length!==expected.length || !timingSafeEqual(actual,Buffer.from(expected))) return null;
  return createHmac('sha256',process.env.PROFILE_KEY || VK_SECRET).update('player/'+params.get('vk_user_id')).digest('hex');
}
function send(id,data){const s=clients.get(id);if(s?.readyState===WebSocket.OPEN && s.bufferedAmount<64000)s.send(JSON.stringify(data));}
function snapshot(r,id){send(id,{type:'state',code:r.code,seat:r.ids.indexOf(id),game:r.game});}
function remove(r){rooms.delete(r.code);for(const id of r.ids)membership.delete(id);}
function finish(r,reward=true){
  db.exec('BEGIN');
  try {
    r.ids.forEach((id,i)=>{
      if(!reward)return;
      const earned=rewards(r.game,i);
      db.prepare('UPDATE players SET xp=xp+?, shards=shards+?,wave=wave+?,mmr=max(0,mmr+?) WHERE id=?').run(
        earned.xp,earned.shards,earned.wave,earned.mmr,id);
    });
    db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
  remove(r);
  r.ids.forEach((id,i)=>send(id,{type:'end',won:r.game?.winner===i,reward,earned:reward?rewards(r.game,i):null,wave:r.game?.wave,profile:profile(id)}));
}
ws.on('connection',s=>{
  let id,windowStart=0,count=0;
  const timer=setTimeout(()=>{if(!id)s.close(1008);},5000);
  s.on('error',()=>s.terminate());
  s.on('close',()=>{clearTimeout(timer);if(clients.get(id)===s)clients.delete(id);});
  s.on('message',raw=>{
    let m;try{m=JSON.parse(raw);}catch{return s.close(1008);}
    if(!m || typeof m!=='object')return s.close(1008);
    if(Date.now()-windowStart>=1000){windowStart=Date.now();count=0;}
    if(++count>100)return s.close(1008);
    if(!id){
      if(m.type!=='login'||!(id=identity(m)))return s.close(1008,'auth');
      clients.get(id)?.close(4001,'device');clients.set(id,s);
      db.prepare('INSERT OR IGNORE INTO players(id) VALUES (?)').run(id);
      send(id,{type:'ready',profile:profile(id),vk:production});
      const r=membership.get(id);if(r)snapshot(r,id);
      return;
    }
    if(clients.get(id)!==s)return;
    const current=membership.get(id);
    if(current){
      if(m.type==='leave'){
        if(current.game && !current.game.solo){current.game.winner=1-current.ids.indexOf(id);finish(current,current.game.t>=15);}
        else finish(current,false);
      } else if(m.type==='pause' && current.game?.solo && typeof m.paused==='boolean'){
        current.game.paused=m.paused;
        snapshot(current,id);
      } else if(m.type==='input' && current.game)input(current.game,current.ids.indexOf(id),m.x,m.hit===true);
      return;
    }
    let r;
    if(m.type==='join'){
      r=rooms.get(m.code);
      if(!r||r.game){send(id,{type:'error',message:'Свободная комната с таким кодом не найдена'});return;}
      r.ids.push(id);r.game=arena(false);
    }else if(m.type==='solo'||m.type==='create'){
      let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));
      r={code,ids:[id],game:m.type==='solo'?arena(true,profile(id).wave):null,created:Date.now(),away:new Map()};
      rooms.set(code,r);
    }else return;
    membership.set(id,r);r.ids.forEach(player=>snapshot(r,player));
  });
});
let lastTick=performance.now(),carry=0;
setInterval(()=>{
  const now=performance.now();
  carry+=Math.min(0.1,(now-lastTick)/1000);lastTick=now;
  const steps=Math.floor(carry*60);carry-=steps/60;
  for(const r of rooms.values()){
    if(!r.game){if(Date.now()-r.created>300000)finish(r,false);continue;}
    for(const id of r.ids){
      if(clients.has(id))r.away.delete(id);
      else if(!r.away.has(id))r.away.set(id,Date.now());
    }
    if(r.away.size){
      const [id,since]=r.away.entries().next().value;
      if(Date.now()-since>30000){r.game.winner=r.game.solo?1:1-r.ids.indexOf(id);finish(r,!r.game.solo && r.away.size===1 && r.game.t>=15);}
      else if(!r.pauseNotice || now-r.pauseNotice>500){r.pauseNotice=now;r.ids.forEach(id=>send(id,{type:'paused'}));}
      continue;
    }
    for(let i=0;i<steps;i++)step(r.game,1/60);
    if(r.game.winner!==null)finish(r);
    else if(!r.lastSent || now-r.lastSent>=32){r.lastSent=now;r.ids.forEach(id=>snapshot(r,id));}
  }
},1000/60);
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Orb Arena • http://127.0.0.1:'+server.address().port));
