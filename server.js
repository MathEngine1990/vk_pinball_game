import http from 'node:http';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {arena,input,step,rewards} from './physics.js';
import {cosmetics,ratingDelta} from './catalog.js';

const {VK_APP_ID,VK_SECRET,PUBLIC_ORIGIN}=process.env;
const production=Boolean(VK_APP_ID || VK_SECRET || PUBLIC_ORIGIN || process.env.NODE_ENV==='production');
if(production && !(VK_APP_ID && VK_SECRET && /^https:\/\/[^/]+$/.test(PUBLIC_ORIGIN))) throw Error('Configure VK_APP_ID, VK_SECRET and HTTPS PUBLIC_ORIGIN');
const db=new DatabaseSync(process.env.DB_PATH || 'arena.sqlite');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,xp INTEGER DEFAULT 0, shards INTEGER DEFAULT 0,wave INTEGER DEFAULT 1,mmr INTEGER DEFAULT 1000)');
db.exec(`CREATE TABLE IF NOT EXISTS wardrobe(player TEXT,skin TEXT,PRIMARY KEY(player,skin));
CREATE TABLE IF NOT EXISTS equipment(player TEXT PRIMARY KEY,skin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,player TEXT,expires INTEGER);
CREATE TABLE IF NOT EXISTS ranked(player TEXT PRIMARY KEY,played INTEGER DEFAULT 0,wins INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS players_rating ON players(mmr DESC);`);
const profile=id=>({...db.prepare('SELECT xp,shards,wave,mmr FROM players WHERE id=?').get(id),
  owned:['amber',...db.prepare('SELECT skin FROM wardrobe WHERE player=?').all(id).map(row=>row.skin)],
  skin:db.prepare('SELECT skin FROM equipment WHERE player=?').get(id)?.skin || 'amber',
  ranked:db.prepare('SELECT played,wins FROM ranked WHERE player=?').get(id)||{played:0,wins:0}});
const clients=new Map(), rooms=new Map(), membership=new Map(),queue=new Map();
const hashToken=token=>createHash('sha256').update(token).digest('hex');
function leaderboard(id){
  const rows=db.prepare('SELECT p.id,p.mmr,r.played,r.wins FROM players p JOIN ranked r ON r.player=p.id WHERE r.played>0 ORDER BY p.mmr DESC,p.id LIMIT 20').all();
  send(id,{type:'leaderboard',rows:rows.map((row,index)=>({place:index+1,name:'Игрок '+row.id.slice(-6).toUpperCase(),mmr:row.mmr,wins:row.wins,played:row.played,you:row.id===id}))});
}
const files=new Map(Object.entries({'/':['public/index.html','text/html'],'/game.js':['public/game.js','text/javascript'],'/style.css':['public/style.css','text/css'],'/bridge.js':['node_modules/@vkontakte/vk-bridge/dist/browser.min.js','text/javascript']}));
for(const entry of ['/web.html','/mobile.html','/index.html'])files.set(entry,files.get('/'));
files.set('/sound.js',['public/sound.js','text/javascript']);
files.set('/music.js',['public/music.js','text/javascript']);
files.set('/platform.js',['public/platform.js','text/javascript']);
files.set('/session.js',['public/network-session.js','text/javascript']);
files.set('/physics-client.js',['physics.js','text/javascript']);
files.set('/catalog.js',['catalog.js','text/javascript']);
files.set('/local-session.js',['public/local-session.js','text/javascript']);
files.set('/session-router.js',['public/session-router.js','text/javascript']);
files.set('/runtime-config.js',['public/runtime-config.js','text/javascript']);
files.set('/progress-store.js',['public/progress-store.js','text/javascript']);
const server=http.createServer((req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/healthz'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return;}
  const audioPath=req.url.split('?')[0];
  if(/^\/audio\/runtime\/(manifest.json|menu.m4a|track-0[123]\/(drums|bass|other)-\d+\.m4a)$/.test(audioPath)){
    try{const data=readFileSync(new URL('.'+audioPath,import.meta.url));res.setHeader('Content-Type',audioPath.endsWith('.json')?'application/json':'audio/mp4');res.end(data);}catch{res.writeHead(404).end();}return;
  }
  if(/^\/audio\/sfx\/(click|bounce|perfect-hit|goal-win|goal-lose|magnet-catch)\.wav$/.test(audioPath)){try{res.setHeader('Content-Type','audio/wav');res.end(readFileSync(new URL('.'+audioPath,import.meta.url)));}catch{res.writeHead(404).end();}return;}
  if(audioPath==='/images/splash.webp'){res.setHeader('Content-Type','image/webp');res.end(readFileSync(new URL('./images/splash.webp',import.meta.url)));return;}
  const file=files.get(req.url.split('?')[0]);
  if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file[1]+'; charset=utf-8');
  let content=readFileSync(new URL(file[0],import.meta.url),'utf8');
  if(['physics.js','catalog.js','public/progress-store.js','public/music.js','public/sound.js'].includes(file[0]))content=content.replace(/^export /gm,'');
  if(file[1]==='text/html'){
    content=content.replace('<!-- GAME_SCRIPTS -->',
      '<script>window.ARENA_SERVER=location.origin;</script><script src="/runtime-config.js"></script><script src="/bridge.js"></script><script src="/platform.js"></script><script src="/music.js"></script><script src="/sound.js"></script><script src="/physics-client.js"></script><script src="/catalog.js"></script><script src="/local-session.js"></script><script src="/session.js"></script><script src="/session-router.js"></script><script src="/game.js"></script>');
  }
  res.end(content);
});
const ws=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,sock,head)=>{
  const origins=production?[PUBLIC_ORIGIN,...(process.env.CLIENT_ORIGINS||'').split(',').filter(Boolean)]:['http://'+req.headers.host];
  if(req.url!=='/play' || !origins.includes(req.headers.origin) || ws.clients.size>=500){sock.destroy();return;}
  ws.handleUpgrade(req,sock,head,s=>ws.emit('connection',s));
});
function identity(msg) {
  if(typeof msg.session==='string' && /^[a-f0-9]{64}$/.test(msg.session)){
    const session=db.prepare('SELECT player FROM sessions WHERE token=? AND expires>?').get(hashToken(msg.session),Date.now());
    if(session)return session.player;
  }
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
function finish(r,reward=true,rankedResult=reward){
  if(!rooms.has(r.code))return;
  const earnedBySeat=r.ids.map((id,i)=>{
    if(!reward && !(r.ranked && rankedResult))return null;
    const earned=reward?rewards(r.game,i):{xp:0,shards:0,wave:0,mmr:0};
    earned.mmr=r.ranked && rankedResult?ratingDelta(profile(id).mmr,profile(r.ids[1-i]).mmr,r.game.winner===i):0;
    return earned;
  });
  db.exec('BEGIN');
  try {
    r.ids.forEach((id,i)=>{
      const earned=earnedBySeat[i];
      if(!earned)return;
      db.prepare('UPDATE players SET xp=xp+?, shards=shards+?,wave=wave+?,mmr=max(0,mmr+?) WHERE id=?').run(
        earned.xp,earned.shards,earned.wave,earned.mmr,id);
      if(r.ranked && rankedResult)db.prepare('INSERT INTO ranked(player,played,wins) VALUES (?,1,?) ON CONFLICT(player) DO UPDATE SET played=played+1,wins=wins+excluded.wins').run(id,Number(r.game.winner===i));
    });
    db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
  remove(r);
  r.ids.forEach((id,i)=>send(id,{type:'end',won:r.game?.winner===i,reward:Boolean(earnedBySeat[i]),earned:earnedBySeat[i],wave:r.game?.wave,profile:profile(id)}));
}
function makeRoom(ids,solo=false,ranked=false){
  let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));
  const r={code,ids,ranked,game:solo?arena(true,profile(ids[0]).wave):ids.length===2?arena(false):null,created:Date.now(),away:new Map()};
  if(r.game)r.game.skins=ids.map(id=>profile(id).skin);
  rooms.set(code,r);ids.forEach(id=>{queue.delete(id);membership.set(id,r);});return r;
}
function matchQueue(){
  for(const [id,since] of queue){
    const opponent=[...queue].find(([other,entered])=>other!==id && Math.abs(profile(id).mmr-profile(other).mmr)<=Math.min(2000,100+Math.floor((Date.now()-Math.min(since,entered))/1000)*20));
    if(!opponent)continue;
    const r=makeRoom([id,opponent[0]],false,true);r.ids.forEach(player=>snapshot(r,player));
  }
}
ws.on('connection',s=>{
  let id,windowStart=0,count=0;
  s.alive=true;s.on('pong',()=>{s.alive=true;});
  const timer=setTimeout(()=>{if(!id)s.close(1008);},5000);
  s.on('error',()=>s.terminate());
  s.on('close',()=>{clearTimeout(timer);if(clients.get(id)===s){clients.delete(id);queue.delete(id);}});
  s.on('message',raw=>{
    let m;try{m=JSON.parse(raw);}catch{return s.close(1008);}
    if(!m || typeof m!=='object')return s.close(1008);
    if(Date.now()-windowStart>=1000){windowStart=Date.now();count=0;}
    if(++count>100)return s.close(1008);
    if(!id){
      if(m.type!=='login'||!(id=identity(m)))return s.close(1008,'auth');
      clients.get(id)?.close(4001,'device');clients.set(id,s);
      db.prepare('INSERT OR IGNORE INTO players(id) VALUES (?)').run(id);
      const token=randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE player=? OR expires<?').run(id,Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token),id,Date.now()+86400000);
      send(id,{type:'ready',profile:profile(id),vk:production,session:token,ads:production && process.env.ADS_ENABLED==='true'});
      const r=membership.get(id);if(r)snapshot(r,id);
      return;
    }
    if(clients.get(id)!==s)return;
    const current=membership.get(id);
    if(current){
      if(m.type==='leave'){
        if(current.game && !current.game.solo){current.game.winner=1-current.ids.indexOf(id);finish(current,current.game.t>=15,true);}
        else finish(current,false);
      } else if(m.type==='pause' && current.game?.solo && typeof m.paused==='boolean'){
        current.game.paused=m.paused;
        snapshot(current,id);
      } else if(m.type==='input' && current.game)input(current.game,current.ids.indexOf(id),m.x,m.hit===true);
      return;
    }
    if(m.type==='cancelQueue'){queue.delete(id);send(id,{type:'queue',waiting:false});return;}
    if(m.type==='leaderboard'){leaderboard(id);return;}
    if(m.type==='buy' || m.type==='equip'){
      if(queue.has(id))return;
      const item=cosmetics.find(item=>item.id===m.skin);
      if(!item){send(id,{type:'error',message:'Такого оформления нет'});return;}
      const owned=profile(id).owned.includes(item.id);
      if(!owned && m.type==='equip'){send(id,{type:'error',message:'Сначала открой оформление'});return;}
      db.exec('BEGIN IMMEDIATE');
      try{
        if(!owned){
          const paid=db.prepare('UPDATE players SET shards=shards-? WHERE id=? AND shards>=?').run(item.price,id,item.price);
          if(!paid.changes){db.exec('ROLLBACK');send(id,{type:'error',message:'Недостаточно осколков'});return;}
          db.prepare('INSERT INTO wardrobe VALUES (?,?)').run(id,item.id);
        }
        db.prepare('INSERT INTO equipment VALUES (?,?) ON CONFLICT(player) DO UPDATE SET skin=excluded.skin').run(id,item.id);
        db.exec('COMMIT');send(id,{type:'profile',profile:profile(id)});
      }catch(e){db.exec('ROLLBACK');throw e;}
      return;
    }
    if(queue.has(id))return;
    if(rooms.size>=200){send(id,{type:'error',message:'Сервер занят. Попробуй немного позже.'});return;}
    if(m.type==='queue'){queue.set(id,Date.now());send(id,{type:'queue',waiting:true});matchQueue();return;}
    let r;
    if(m.type==='join'){
      r=rooms.get(m.code);
      if(!r||r.game||r.ranked){send(id,{type:'error',message:'Свободная комната с таким кодом не найдена'});return;}
      r.ids.push(id);r.game=arena(false);
      r.game.skins=r.ids.map(id=>profile(id).skin);
    }else if(m.type==='solo'||m.type==='create'){
      r=makeRoom([id],m.type==='solo');
    }else return;
    membership.set(id,r);r.ids.forEach(player=>snapshot(r,player));
  });
});
setInterval(matchQueue,1000).unref();
setInterval(()=>{for(const s of ws.clients){if(!s.alive){s.terminate();continue;}s.alive=false;s.ping();}},10000).unref();
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
      if(Date.now()-since>30000){r.game.winner=r.game.solo?1:1-r.ids.indexOf(id);finish(r,!r.game.solo && r.away.size===1 && r.game.t>=15,!r.game.solo && r.away.size===1);}
      else if(!r.pauseNotice || now-r.pauseNotice>500){r.pauseNotice=now;r.ids.forEach(id=>send(id,{type:'paused'}));}
      continue;
    }
    for(let i=0;i<steps;i++)step(r.game,1/60);
    if(r.game.winner!==null)finish(r);
    else if(!r.lastSent || now-r.lastSent>=32){r.lastSent=now;r.ids.forEach(id=>snapshot(r,id));}
  }
},1000/60);
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Orb Arena • http://127.0.0.1:'+server.address().port));
function shutdown(){for(const s of ws.clients)s.close(1012,'restart');server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
