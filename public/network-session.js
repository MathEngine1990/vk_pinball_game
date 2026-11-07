const networkSession=(()=>{
let socket,sessionToken,retry=0,stopped=false;
let guest;
try { guest=sessionStorage.getItem('arena-demo'); } catch {}
if(!guest){guest=crypto.randomUUID();try{sessionStorage.setItem('arena-demo',guest);}catch{}}
const send=m=>{if(socket?.readyState===1)socket.send(JSON.stringify(m));};
let adWork=Promise.resolve(),banner=false;
function ads(show){
  adWork=adWork.catch(()=>{}).then(async()=>{
    if(!bridge || !adsEnabled)return;
    if(banner){await bridge.send('VKWebAppHideBannerAd');banner=false;}
    const space=innerWidth-document.querySelector('.cabinet').getBoundingClientRect().right;
    if(!show || inRoom || space<160)return;
    const options={banner_location:'bottom',banner_align:'right',orientation:'vertical',layout_type:'overlay',can_close:true};
    const fits=a=>a?.result && a.orientation==='vertical' && a.banner_align==='right' && a.banner_width>0 && a.banner_width+12<=space && a.banner_height>0 && a.banner_height<innerHeight-64;
    if(!await bridge.supportsAsync('VKWebAppShowBannerAd'))return;
    const available=await bridge.send('VKWebAppCheckBannerAd',{});
    if(!inRoom && available?.result){
      const result=await bridge.send('VKWebAppShowBannerAd',options);
      banner=result.result;
      if(banner && (!fits(result)||inRoom)){await bridge.send('VKWebAppHideBannerAd');banner=false;}
    }
  });return adWork;
}
function connect(){
  let endpoint;
  try{endpoint=new URL(window.ARENA_SERVER);if(endpoint.protocol!=='https:' && !(endpoint.protocol==='http:' && ['127.0.0.1','localhost'].includes(endpoint.hostname)))throw Error();}
  catch{$('hint').textContent='Неверный адрес игрового сервера';return;}
  controls(inRoom);socket=new WebSocket(endpoint.origin.replace(/^http/,'ws')+'/play');
  socket.onopen=()=>send({type:'login',guest,launch,session:sessionToken});
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='ready'){retry=0;sessionToken=m.session;online=true;game=null;networkWaiting=false;controls(false);progress(m.profile);adsEnabled=m.ads;
      $('save-note').textContent=m.vk?'Прогресс привязан к аккаунту VK.':'Тестовый профиль на сервере.';
      $('account').textContent=m.vk?'Профиль ВКонтакте подключён':'Локальный тест';$('hint').textContent='Направляйте шар краем отражателя. Ударьте перед касанием, чтобы ускорить его.';
      ads(true).catch(()=>{});
    }
    if(m.type==='profile'){progress(m.profile);$('hint').textContent='Оформление выбрано';}
    if(m.type==='leaderboard')renderRanking(m.rows);
    if(m.type==='queue'){
      controls(m.waiting);$('queue-status').hidden=!m.waiting;
      $('playing').hidden=m.waiting;
      $('hint').textContent=m.waiting?'Ищем соперника близкого рейтинга… Можно отменить поиск.':'Поиск отменён';
      if(!m.waiting)ads(true).catch(()=>{});
    }
    if(m.type==='state'){
      $('queue-status').hidden=true;
      const fresh=!game;game=m.game;seat=m.seat;controls(true);
      ads(false).catch(()=>{});
      $('mode').textContent=!game?'КОМНАТА':game.solo?'БЕСКОНЕЧНЫЕ ВОЛНЫ':'ДУЭЛЬ 1 × 1';
      $('hint').textContent=!game?'Передайте другу код '+m.code:game.solo?'Вы снизу. Защитите ворота от трёх ботов.':'Вы снизу. Первый до семи голов побеждает.';
      if(fresh && game){target=game.pads[seat].x;resetInput();resetFeedback();}
      if(game?.solo && document.hidden && !game.paused)pauseSession(true);
      networkWaiting=false;
      updatePause();
    }
    if(m.type==='paused'){networkWaiting=true;updatePause();}
    if(m.type==='end'){game=null;$('queue-status').hidden=true;controls(false);progress(m.profile);$('mode').textContent='МЕЖДУ МАТЧАМИ';
      resetInput();networkWaiting=false;showResult({...m,saved:true});ads(true).catch(()=>{});}
    if(m.type==='error'){controls(false);$('hint').textContent=m.message;}
  };
  socket.onclose=e=>{online=false;$('queue-status').hidden=true;controls(inRoom);$('account').textContent='Связь прервана';
    networkWaiting=Boolean(game);resetInput();updatePause();
    if([4001,1008].includes(e.code))$('hint').textContent=e.code===4001?'Игра открыта на другом устройстве.':'Откройте игру заново во ВКонтакте для входа.';
    else if(!stopped)setTimeout(connect,Math.min(10000,1000*2**retry++));
  };
}
async function start(type){
  if(inRoom||!online)return;
  controls(true);
  try{await ads(false);send({type,code:$('code').value.trim().toUpperCase()});}
  catch{controls(false);$('hint').textContent='Закройте баннер и повторите вход в игру.';}
}

function pauseSession(paused){if(game?.solo)send({type:'pause',paused});}
let resizeTimer;
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>ads(!inRoom).catch(()=>{}),250);});
addEventListener('pagehide',()=>{stopped=true;socket?.close();});
addEventListener('pageshow',event=>{if(event.persisted){stopped=false;connect();}});
return {send,start,connect,pauseSession};
})();
