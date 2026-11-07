let socket;
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
    const available=await bridge.send('VKWebAppCheckBannerAd',options);
    if(!inRoom && fits(available)){
      const result=await bridge.send('VKWebAppShowBannerAd',options);
      banner=result.result;
      if(banner && (!fits(result)||inRoom)){await bridge.send('VKWebAppHideBannerAd');banner=false;}
    }
  });return adWork;
}
function connect(){
  controls(inRoom);socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/play');
  socket.onopen=()=>send({type:'login',guest,launch});
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==='ready'){online=true;game=null;controls(false);progress(m.profile);adsEnabled=m.vk;
      $('account').textContent=m.vk?'Профиль ВКонтакте подключён':'Локальный тест';$('hint').textContent='Направляйте шар краем отражателя. Ударьте перед касанием, чтобы ускорить его.';
      ads(true).catch(()=>{});
    }
    if(m.type==='state'){
      const fresh=!game;game=m.game;seat=m.seat;controls(true);
      $('mode').textContent=!game?'КОМНАТА':game.solo?'БЕСКОНЕЧНЫЕ ВОЛНЫ':'ДУЭЛЬ 1 × 1';
      $('hint').textContent=!game?'Передайте другу код '+m.code:game.solo?'Вы снизу. Защитите ворота от трёх ботов.':'Вы снизу. Первый до семи голов побеждает.';
      if(fresh && game){target=game.pads[seat].x;resetInput();resetFeedback();}
      if(game?.solo && document.hidden && !game.paused)pauseSession(true);
      networkWaiting=false;
      updatePause();
    }
    if(m.type==='paused'){networkWaiting=true;updatePause();}
    if(m.type==='end'){game=null;controls(false);progress(m.profile);$('mode').textContent='МЕЖДУ МАТЧАМИ';
      resetInput();networkWaiting=false;showResult({...m,saved:true});ads(true).catch(()=>{});}
    if(m.type==='error'){controls(false);$('hint').textContent=m.message;}
  };
  socket.onclose=e=>{online=false;controls(inRoom);$('account').textContent='Связь прервана';
    networkWaiting=Boolean(game);resetInput();updatePause();
    if([4001,1008].includes(e.code))$('hint').textContent=e.code===4001?'Игра открыта на другом устройстве.':'Откройте игру заново во ВКонтакте для входа.';
    else setTimeout(connect,1200);
  };
}
async function start(type){
  if(inRoom||!online)return;
  controls(true);
  try{await ads(false);send({type,code:$('code').value.trim().toUpperCase()});}
  catch{controls(false);$('hint').textContent='Закройте баннер и повторите вход в игру.';}
}

function pauseSession(paused){if(game?.solo)send({type:'pause',paused});}
