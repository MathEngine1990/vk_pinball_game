// No signaling server, STUN or TURN: only manually exchanged host candidates.
const peerSession=(()=>{
let pc,channel,role='',room='',setupTimer,linkTimer,loop,lastHeard=0,lastStep=0,carry=0,lastSent=0,lastPing=0,started=false;
let hostGame=null,frames=0,windowStart=0,accountLabel='';
const message=text=>{$('peer-status').textContent=text;};
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,'0')).join('');
const active=()=>Boolean(role);
function transmit(data){if(channel?.readyState==='open' && channel.bufferedAmount<64000)channel.send(JSON.stringify(data));}
function reset(){
  clearTimeout(setupTimer);clearTimeout(linkTimer);clearInterval(loop);
  if(channel){channel.onclose=channel.onmessage=channel.onopen=channel.onerror=null;channel.close();}
  if(pc){pc.onconnectionstatechange=pc.ondatachannel=null;pc.close();}
  pc=channel=null;role='';started=false;hostGame=null;carry=0;
}
function stop(text){
  if(!active())return;
  reset();game=null;seat=0;networkWaiting=false;confirmExit=false;resetInput();controls(false);
  if(accountLabel)$('account').textContent=accountLabel;
  $('peer-panel').hidden=false;$('peer-actions').hidden=false;$('peer-output-box').hidden=true;
  $('peer-apply').hidden=true;$('peer-start').hidden=true;
  for(const id of ['peer-host','peer-join'])$(id).disabled=false;
  $('peer-input').value='';$('peer-output').value='';message(text);
  $('mode').textContent='ДУЭЛЬ С ДРУГОМ';$('hint').textContent=text;
}
function end(winner){
  transmit({type:'end',winner});
  const won=winner===seat;
  stop('Дуэль завершена. Для нового матча обменяйтесь новыми кодами.');
  $('result').hidden=false;$('result-title').textContent=won?'Победа в дуэли!':'Друг выиграл дуэль';
  $('result-reward').textContent='Дружеский матч: без изменения опыта, осколков и рейтинга.';
}
function snapshot(){transmit({type:'state',game:hostGame});}
function begin(){
  if(role!=='host' || !channel || channel.readyState!=='open' || started)return;
  started=true;game=hostGame=arena(false);hostGame.skins=[profile?.skin||'amber','amber'];
  seat=0;target=500;resetInput();resetFeedback();controls(true);$('peer-panel').hidden=true;
  $('mode').textContent='ДУЭЛЬ · ТЫ ХОСТ';$('hint').textContent='Твои ворота снизу. Забей 7 голов. При сворачивании — общая пауза.';
  snapshot();
}
function validState(g){
  const finite=n=>typeof n==='number' && Number.isFinite(n);
  return g && g.solo===false && finite(g.t) && g.t>=0 && g.t<86400 && typeof g.paused==='boolean' &&
    Array.isArray(g.score)&&g.score.length===2&&g.score.every(n=>Number.isInteger(n)&&n>=0&&n<=100) &&
    Array.isArray(g.hp)&&g.hp.length===4 && Array.isArray(g.pads)&&g.pads.length===2&&g.pads.every(p=>p && finite(p.x)&&p.x>=0&&p.x<=1000&&finite(p.hit)&&Number.isInteger(p.perfect)&&p.perfect>=0) &&
    Array.isArray(g.balls)&&g.balls.length===1&&g.balls.every(b=>b && ['x','y','vx','vy'].every(k=>finite(b[k])&&Math.abs(b[k])<=2000)) &&
    (g.winner===null || g.winner===0 || g.winner===1) && Number.isInteger(g.goalCount) &&
    (!g.lastGoal || ([0,1].includes(g.lastGoal.side)&&finite(g.lastGoal.t))) && !g.rules;
}
function receive(event){
  if(typeof event.data!=='string' || event.data.length>16000)return stop('Получены неверные данные. Соединение закрыто.');
  if(performance.now()-windowStart>1000){windowStart=performance.now();frames=0;}
  if(++frames>100)return stop('Соперник отправляет слишком много данных.');
  let m;try{m=JSON.parse(event.data);}catch{return stop('Код сообщения повреждён.');}
  if(!m || typeof m!=='object')return;
  lastHeard=performance.now();
  if(m.type==='ping'){transmit({type:'pong'});return;}
  if(m.type==='leave')return stop('Друг вышел из дуэли.');
  if(m.type==='end' && role==='guest' && started && [0,1].includes(m.winner))return end(m.winner);
  if(m.type==='pause' && role==='host' && hostGame){hostGame.paused=true;resetInput();snapshot();updatePause();}
  if(m.type==='resume' && role==='host' && hostGame && !document.hidden){hostGame.paused=false;snapshot();updatePause();}
  if(m.type==='input' && role==='host' && hostGame){if(Number.isFinite(m.x))input(hostGame,1,m.x,m.hit===true);}
  if(m.type==='state' && role==='guest'){
    if(!validState(m.game))return stop('Хост прислал неподдерживаемое состояние игры.');
    const fresh=!started;started=true;game=m.game;seat=1;
    if(fresh){target=500;resetInput();resetFeedback();}
    controls(true);$('peer-panel').hidden=true;$('mode').textContent='ДУЭЛЬ · ДРУГ — ХОСТ';
    $('hint').textContent='Твои ворота снизу. Забей 7 голов. Хост рассчитывает матч.';
    if(document.hidden && !game.paused)transmit({type:'pause'});
  }
}
function attach(dc){
  if(channel){dc.close();return;}
  channel=dc;
  dc.onmessage=receive;dc.onerror=()=>stop('Ошибка прямого соединения. Попробуй создать новую дуэль.');
  dc.onclose=()=>stop('Связь с другом закрыта. Создайте новую дуэль.');
  dc.onopen=()=>{
    clearTimeout(setupTimer);lastHeard=lastStep=lastSent=lastPing=performance.now();frames=0;windowStart=lastHeard;
    $('peer-output-box').hidden=true;$('peer-apply').hidden=true;$('peer-start').hidden=role!=='host';
    message(role==='host'?'Друг подключился. Когда оба готовы, нажми «Начать матч».':'Соединение установлено. Ждём, когда хозяин начнёт матч.');
    loop=setInterval(()=>{
      const now=performance.now(),elapsed=Math.min(.1,(now-lastStep)/1000);lastStep=now;
      if(now-lastHeard>20000)return stop('Друг не отвечает. Возможно, приложение закрыто или сеть прервана.');
      if(now-lastPing>=1000){lastPing=now;transmit({type:'ping'});}
      if(role==='host' && hostGame){
        if(document.hidden)hostGame.paused=true;
        if(hostGame.paused)carry=0;else{carry+=elapsed;while(carry>=1/60){carry-=1/60;step(hostGame,1/60);}}
        if(hostGame.winner!==null)return end(hostGame.winner);
        if(now-lastSent>=45){lastSent=now;snapshot();}
      }
      },16);
  };
}
function create(roleName){
  reset();role=roleName;
  accountLabel=$('account').textContent;$('account').textContent='Дуэль с другом';
  pc=new RTCPeerConnection({iceServers:[]});
  const current=pc;
  pc.onconnectionstatechange=()=>{
    if(pc!==current)return;
    if(pc.connectionState==='failed')stop('Сеть не позволяет прямое соединение. Попробуйте один Wi-Fi. Сервер-посредник не используется.');
    if(pc.connectionState==='disconnected'){
      if(game){game.paused=true;updatePause();}
      clearTimeout(linkTimer);linkTimer=setTimeout(()=>stop('Соединение потеряно. Обменяйтесь новыми кодами.'),12000);
    }else if(pc.connectionState==='connected')clearTimeout(linkTimer);
  };
  pc.ondatachannel=e=>attach(e.channel);
  $('peer-actions').hidden=true;$('peer-panel').hidden=false;$('peer-start').hidden=true;$('peer-output-box').hidden=true;
  controls(true);$('playing').hidden=true;$('peer-panel').hidden=false;
  setupTimer=setTimeout(()=>stop('Время приглашения истекло. Создай новое приглашение.'),30*60*1000);
  return current;
}
async function gather(current){
  if(current.iceGatheringState==='complete')return;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{current.removeEventListener('icegatheringstatechange',check);reject(Error('Не удалось подготовить код подключения.'));},10000);
    function check(){if(current.iceGatheringState==='complete'){clearTimeout(timer);current.removeEventListener('icegatheringstatechange',check);resolve();}}
    current.addEventListener('icegatheringstatechange',check);check();
  });
}
function encode(description){return 'RK1.'+btoa(JSON.stringify({v:1,room,created:Date.now(),type:description.type,sdp:description.sdp}));}
function decode(text,type){
  const code=text.replace(/\s/g,'');
  if(!code.startsWith('RK1.') || code.length>100000)throw Error('Вставь полный код из игры, начиная с RK1.');
  let data;try{data=JSON.parse(atob(code.slice(4)));}catch{throw Error('Код повреждён. Скопируй его целиком.');}
  if(!data || data.v!==1 || data.type!==type || !/^[a-f0-9]{24}$/.test(data.room) || !Number.isFinite(data.created) || Date.now()-data.created>1800000 || data.created>Date.now()+300000)throw Error('Неверный тип кода или приглашение устарело. Создай новую дуэль.');
  if(typeof data.sdp!=='string'||data.sdp.length>60000 || !data.sdp.startsWith('v=0') || !/^m=application /m.test(data.sdp) || (data.sdp.match(/^m=/gm)||[]).length!==1)throw Error('Код не относится к дуэли этой игры.');
  return data;
}
function output(current,text){
  if(pc!==current)return;
  $('peer-output').value=encode(current.localDescription);$('peer-output-box').hidden=false;message(text);
}
async function host(){
  if(game || inRoom || !online)return;
  let current;
  try{
    current=create('host');room=uid();attach(current.createDataChannel('rikoshet',{ordered:true}));
    message('Подготавливаем приглашение…');await current.setLocalDescription(await current.createOffer());await gather(current);
    if(pc!==current)return;
    $('peer-apply').hidden=false;
    output(current,'Шаг 1. Скопируй код и отправь другу. Шаг 2. Вставь ответ друга ниже и нажми «Принять ответ».');
  }catch(e){if(!current || pc===current){if(active())stop(e.message);else message('Этот браузер не поддерживает прямую дуэль.');}}
}
async function join(){
  if(game || inRoom || !online)return;
  let current;
  try{
    const data=decode($('peer-input').value,'offer');current=create('guest');room=data.room;
    message('Подготавливаем ответ…');await current.setRemoteDescription({type:data.type,sdp:data.sdp});
    await current.setLocalDescription(await current.createAnswer());await gather(current);
    output(current,'Шаг 2. Отправь этот ответ хозяину. Оставь игру открытой и дождись подключения.');
  }catch(e){if(!current)message(e.message);else if(pc===current)stop(e.message);}
}
async function accept(){
  if(role!=='host' || pc.signalingState!=='have-local-offer')return;
  const current=pc;
  try{
    const data=decode($('peer-input').value,'answer');if(data.room!==room)throw Error('Это ответ на другое приглашение.');
    await current.setRemoteDescription({type:data.type,sdp:data.sdp});
    if(pc!==current)return;
    $('peer-apply').hidden=true;message(channel?.readyState==='open'?'Друг подключился. Нажми «Начать матч».':'Пробуем соединиться напрямую…');clearTimeout(setupTimer);
    if(channel?.readyState!=='open')setupTimer=setTimeout(()=>stop('Не удалось соединиться напрямую. Попробуйте один Wi-Fi. Посредников нет.'),25000);
  }catch(e){if(pc===current)message(e.message);}
}
function send(m){
  if(m.type==='leave'){transmit({type:'leave'});stop('Ты вышел из дуэли.');return;}
  if(m.type==='input' && started){if(role==='host')input(hostGame,0,m.x,m.hit);else transmit(m);}
}
function pause(paused){
  if(!started)return;
  resetInput();
  if(role==='host'){hostGame.paused=paused;updatePause();snapshot();}
  else{if(paused){game.paused=true;updatePause();}transmit({type:paused?'pause':'resume'});}
}
function init(){
  $('peer-entry').hidden=false;$('peer-entry').onclick=()=>{$('peer-panel').hidden=!$('peer-panel').hidden;};
  $('peer-host').onclick=host;$('peer-join').onclick=join;$('peer-apply').onclick=accept;$('peer-start').onclick=begin;
  $('peer-cancel').onclick=()=>{if(active())send({type:'leave'});$('peer-panel').hidden=true;};
  $('peer-copy').onclick=async()=>{
    const text=$('peer-output').value;
    try{await navigator.clipboard.writeText(text);message('Код скопирован. Отправь его другу.');}
    catch{$('peer-output').focus();$('peer-output').select();message('Код выделен. Используй команду «Копировать» на устройстве.');}
  };
  addEventListener('pagehide',()=>{if(active())send({type:'leave'});});
}
return {active,init,host,join,accept,begin,send,pause,decode};
})();
