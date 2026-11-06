const $=id=>document.getElementById(id);
const table=$('table'), ctx=table.getContext('2d');
const launch=location.search;
if(launch) history.replaceState(null,'',location.pathname+location.hash);
const bridge=window.vkBridge;
if(launch && bridge) bridge.send('VKWebAppInit').catch(()=>{});
let socket,game,seat=0,target=500,hit=false,profile,online=false,inRoom=false,adsEnabled=false;
let guest=sessionStorage.getItem('arena-demo');
if(!guest){guest=crypto.randomUUID();sessionStorage.setItem('arena-demo',guest);}
const send=m=>{if(socket?.readyState===1)socket.send(JSON.stringify(m));};
function controls(active){
  inRoom=active;$('menu').hidden=active;$('playing').hidden=!active;
  $('hit').disabled=!game;document.body.classList.toggle('match',active);
  document.querySelectorAll('#menu button').forEach(b=>b.disabled=!online);
}
function progress(p){
  profile=p;let xp=p.xp,l=1,cost=70;
  while(xp>=cost){xp-=cost;l++;cost=70+18*(l-1)+2*(l-1)**2;}
  $('stats').textContent='Уровень '+l+' · Опыт '+xp+'/'+cost+' · Осколки '+p.shards+' · Рейтинг '+p.mmr;
  $('solo').firstChild.textContent='Волна '+p.wave+' · играть ';
}
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
      if(fresh && game)target=game.pads[seat].x;
    }
    if(m.type==='paused')$('hint').textContent='Ожидаем переподключения соперника…';
    if(m.type==='end'){game=null;controls(false);progress(m.profile);$('mode').textContent='МЕЖДУ МАТЧАМИ';
      $('hint').textContent=m.reward?(m.won?'Победа! ':'Раунд окончен. ')+'Награда сохранена.':'Комната закрыта.';ads(true).catch(()=>{});}
    if(m.type==='error'){controls(false);$('hint').textContent=m.message;}
  };
  socket.onclose=e=>{online=false;controls(inRoom);$('account').textContent='Связь прервана';
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
$('solo').onclick=()=>start('solo');$('create').onclick=()=>start('create');
$('join').onsubmit=e=>{e.preventDefault();start('join');};$('leave').onclick=()=>send({type:'leave'});
$('hit').onpointerdown=()=>hit=true;
function point(e){const box=table.getBoundingClientRect();const x=1000*(e.clientX-box.left)/box.width;target=seat===1?1000-x:x;}
table.onpointerdown=e=>{table.setPointerCapture(e.pointerId);point(e);};
table.onpointermove=e=>{if(e.pointerType==='mouse'||e.buttons)point(e);};
const keys=new Set();
onkeydown=e=>{if(!game)return;if(['ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)hit=true;}};
onkeyup=e=>keys.delete(e.code);onblur=()=>keys.clear();
setInterval(()=>{if(!game||!online)return;target=Math.max(75,Math.min(925,target+(seat===1?-1:1)*35*(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))));send({type:'input',x:target,hit});hit=false;},33);
let resizeTimer;onresize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>ads(!inRoom).catch(()=>{}),250);};

// The playfield artwork is cached so mobile clients only redraw moving objects.
const art=document.createElement('canvas');art.width=art.height=1000;
const a=art.getContext('2d');
function disc(c,x,y,r,colors){
  const gradient=c.createRadialGradient(x-r*.32,y-r*.44,1,x,y,r);
  colors.forEach(([stop,color])=>gradient.addColorStop(stop,color));
  c.fillStyle=gradient;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
}
const felt=a.createLinearGradient(0,0,1000,1000);
felt.addColorStop(0,'#346456');felt.addColorStop(.5,'#1b4239');felt.addColorStop(1,'#102d29');a.fillStyle=felt;a.fillRect(0,0,1000,1000);
a.fillStyle='#93ae8b38';for(let y=15;y<1000;y+=20)for(let x=15;x<1000;x+=20)a.fillRect(x,y,2,2);
a.strokeStyle='#bbd6ae60';a.lineWidth=3;a.strokeRect(22,22,956,956);
for(let i=0;i<4;i++){a.save();a.translate(500,500);a.rotate(Math.PI*i/2);a.beginPath();a.moveTo(-470,-220);a.lineTo(-470,-370);a.lineTo(-370,-470);a.lineTo(-220,-470);a.stroke();a.restore();}
a.beginPath();a.arc(500,500,176,0,Math.PI*2);a.stroke();a.beginPath();a.arc(500,500,162,0,Math.PI*2);a.stroke();
a.save();a.translate(500,500);a.rotate(-.24);a.textAlign='center';a.fillStyle='#d4d3a46b';a.font='italic 900 75px Arial';a.fillText('АРЕНА',0,17);a.font='bold 26px monospace';a.fillText('Р И К О Ш Е Т',0,58);a.restore();
for(const x of [310,690])for(const y of [310,690]){
  disc(a,x,y+10,50,[[0,'#647569'],[.8,'#283730'],[1,'#0d211a']]);
  disc(a,x,y,46,[[0,'#fff5c2'],[.43,'#ffc37c'],[.66,'#e9844b'],[.72,'#ffce84'],[.83,'#91432c'],[.94,'#ffc89b'],[1,'#463f31']]);
  a.fillStyle='#783d27';a.font='bold 27px Arial';a.textAlign='center';a.fillText('✦',x,y+8);
}
function render(){
  ctx.save();if(seat===1 && game){ctx.translate(1000,1000);ctx.rotate(Math.PI);}
  ctx.drawImage(art,0,0);
  const pads=game?.pads||Array.from({length:4},()=>({x:500}));
  pads.forEach((p,i)=>{
    if(game?.solo && game.hp[i]<=0)return;
    ctx.save();if(i===1){ctx.translate(0,1000);ctx.scale(1,-1);}
    if(i===2){ctx.translate(1000,0);ctx.rotate(Math.PI/2);ctx.scale(1,1);}
    if(i===3){ctx.translate(1000,1000);ctx.rotate(-Math.PI/2);ctx.translate(0,-1000); }
    const mine=i===(game?seat:0);
    ctx.fillStyle=mine?'#ffc382':'#a0cfc3';ctx.fillRect(310,988,380,12);
    const gradient=ctx.createLinearGradient(0,951,0,979);gradient.addColorStop(0,'#fff5c8');gradient.addColorStop(.28,mine?'#ffbb71':'#a3e0d2');gradient.addColorStop(.75,mine?'#db6837':'#417e70');gradient.addColorStop(1,'#392f27');
    ctx.fillStyle='#0b211b';ctx.fillRect(p.x-75,958,150,27);ctx.fillStyle=gradient;ctx.fillRect(p.x-75,952,150,27);ctx.restore();
  });
  for(const b of game?.balls||[{x:545,y:614}]){
    disc(ctx,b.x+4,b.y+9,16,[[0,'#061c13'],[1,'#18362a55']]);disc(ctx,b.x,b.y,14,[[0,'white'],[.32,'#e5f8f1'],[.52,'#7daba0'],[.72,'#33463f'],[1,'#bdc9b4']]);
  }
  ctx.restore();
  $('hud').textContent=!game?'ВОЛНА '+String(profile?.wave||1).padStart(2,'0'):game.solo?'ВОЛНА '+game.wave+' · Прочность '+game.hp[0]+' · '+Math.ceil(150-game.t)+' с':game.score[seat]+' : '+game.score[1-seat]+' · '+(game.t<120?Math.ceil(120-game.t)+' с':'Овертайм');
  requestAnimationFrame(render);
}
connect();render();
