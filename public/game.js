const $=id=>document.getElementById(id);
const table=$('table'), ctx=table.getContext('2d');
let game=null,seat=0,target=500,hit=false,profile,online=false,inRoom=false,adsEnabled=false;
let networkWaiting=false,confirmExit=false;
function controls(active){
  inRoom=active;$('menu').hidden=active;$('playing').hidden=!active;
  $('hit').disabled=!game;document.body.classList.toggle('match',active);
  if(active)$('result').hidden=true;
  $('pause').hidden=!game?.solo;
  $('touchpad').hidden=!game || $('scheme').value!=='thumb';
  document.querySelectorAll('#menu button').forEach(b=>b.disabled=!online);
  updatePause();
}
function progress(p){
  profile=p;let xp=p.xp,l=1,cost=70;
  while(xp>=cost){xp-=cost;l++;cost=70+18*(l-1)+2*(l-1)**2;}
  $('stats').textContent='Уровень '+l+' · Опыт '+xp+'/'+cost+' · Осколки '+p.shards;
  $('solo').firstChild.textContent='Волна '+p.wave+' · играть ';
}
$('solo').onclick=e=>{e.currentTarget.blur();start('solo');};
$('create').onclick=e=>{e.currentTarget.blur();start('create');};
$('join').onsubmit=e=>{e.preventDefault();start('join');};
function requestHit(){
  if(!game || game.paused || networkWaiting)return;
  const pad=game.pads[seat];
  if(game.t-pad.hit>=0.8)hit=true;
}
function resetInput(){
  hit=false;keys.clear();
  if(pointer!==null && pointerSurface?.hasPointerCapture(pointer))pointerSurface.releasePointerCapture(pointer);
  pointer=null;pointerSurface=null;
}
function suspendGame(){
  resetInput();
  if(game?.solo)pauseSession(true);
}
function updatePause(){
  const visible=Boolean(game && (game.paused || networkWaiting));
  $('pause-screen').hidden=!visible;
  $('pause').textContent=game?.paused?'Продолжить':'Пауза';
  $('resume').hidden=networkWaiting;
  $('quit').hidden=!confirmExit || networkWaiting;
  $('pause-title').textContent=networkWaiting?'Связь прервана':confirmExit?'Завершить волну?':'Пауза';
  $('pause-text').textContent=networkWaiting?'Ожидаем соединения с соперником':confirmExit?'Награда за незавершённую волну не начисляется':'Нажми «Продолжить», когда будешь готов';
}
function showResult(result){
  confirmExit=false;updatePause();
  $('result').hidden=false;
  $('result-title').textContent=!result.reward?'Волна прервана':result.won?'Победа!':'Раунд завершён';
  const earned=result.earned;
  $('result-reward').textContent=result.reward && earned?
    '+'+earned.xp+' опыта · +'+earned.shards+' осколков'+(result.won && earned.wave?' · Следующая волна открыта':''):
    'Можно попробовать снова.';
  $('hint').textContent=result.won?'Отличный рикошет. Готов к следующей волне?':'Защищай свои ворота и направляй шар краем отражателя.';
  $('mode').textContent='МЕЖДУ ВОЛНАМИ';
  if(result.saved===false)$('save-note').textContent='Браузер не разрешил сохранение. Прогресс доступен до закрытия игры.';
}
$('leave').onclick=()=>{
  if(game?.solo){confirmExit=true;pauseSession(true);updatePause();}
  else send({type:'leave'});
};
$('quit').onclick=()=>{confirmExit=false;send({type:'leave'});};
$('pause').onclick=()=>{confirmExit=false;pauseSession(!game?.paused);};
$('resume').onclick=()=>{confirmExit=false;pauseSession(false);};
$('hit').onclick=requestHit;
addEventListener('visibilitychange',()=>{if(document.hidden)suspendGame();});
addEventListener('blur',suspendGame);
const scheme=$('scheme');
const defaultThumb=view==='mobile' || (view!=='web' && matchMedia('(pointer:coarse)').matches);
scheme.value=defaultThumb?'thumb':'direct';
const preferenceKey='rikoshet-controls-'+view;
try{const saved=localStorage.getItem(preferenceKey);if(['direct','thumb'].includes(saved))scheme.value=saved;}catch{}
const sensitivity=$('sensitivity');
try{const saved=Number(localStorage.getItem('rikoshet-sensitivity'));if(saved>=.7 && saved<=2.2)sensitivity.value=saved;}catch{}
function updateSensitivity(){
  $('sensitivity-value').textContent=Number(sensitivity.value).toFixed(1).replace('.',',');
}
updateSensitivity();
sensitivity.oninput=()=>{updateSensitivity();try{localStorage.setItem('rikoshet-sensitivity',sensitivity.value);}catch{}};
function explainScheme(){
  $('gesture').textContent=scheme.value==='thumb'?'Веди пальцем по площадке под полем. Отпусти перед касанием шара — сильный удар.':'Веди мышью или касайся поля. Щелчок — удар. Клавиатура: ← → и пробел.';
  $('sensitivity-row').hidden=scheme.value!=='thumb';
  $('touchpad').hidden=!game || scheme.value!=='thumb';
}
scheme.onchange=()=>{resetInput();explainScheme();try{localStorage.setItem(preferenceKey,scheme.value);}catch{}};
explainScheme();
let pointer=null,pointerSurface=null,previousX=0;
function moveToPointer(e){
  const box=(pointerSurface || table).getBoundingClientRect();
  if(scheme.value==='thumb'){
    const delta=(e.clientX-previousX)*1000*Number(sensitivity.value)/box.width;
    target=Math.max(75,Math.min(925,target+(seat===1?-delta:delta)));
  }else{
    const x=1000*(e.clientX-box.left)/box.width;
    target=seat===1?1000-x:x;
  }
  previousX=e.clientX;
}
function pointerDown(e){
  if(!game || game.paused || networkWaiting || pointer!==null || e.button!==0)return;
  pointer=e.pointerId;pointerSurface=e.currentTarget;previousX=e.clientX;
  pointerSurface.setPointerCapture(pointer);moveToPointer(e);
  if(scheme.value==='direct')requestHit();
};
function pointerMove(e){
  if(game && !game.paused && !networkWaiting && (e.pointerId===pointer || (pointer===null && scheme.value==='direct' && e.pointerType==='mouse')))moveToPointer(e);
};
function pointerUp(e){
  if(e.pointerId!==pointer)return;
  moveToPointer(e);pointer=null;pointerSurface=null;if(scheme.value==='thumb')requestHit();
};
for(const surface of [table,$('touchpad')]){
  surface.onpointerdown=pointerDown;surface.onpointermove=pointerMove;surface.onpointerup=pointerUp;
  surface.onlostpointercapture=surface.onpointercancel=()=>{pointer=null;pointerSurface=null;};
}
const keys=new Set();
onkeydown=e=>{
  if(!game || e.target.matches('select,input,button,summary'))return;
  if(e.code==='Escape' && game.solo){e.preventDefault();confirmExit=false;pauseSession(!game.paused);return;}
  if(game.paused || networkWaiting)return;
  if(['ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)requestHit();}
};
onkeyup=e=>keys.delete(e.code);
setInterval(()=>{if(!game||!online||game.paused||networkWaiting)return;target=Math.max(75,Math.min(925,target+(seat===1?-1:1)*35*(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))));send({type:'input',x:target,hit});hit=false;},33);
let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{resetInput();fitArena();if(typeof ads==='function')ads(!inRoom).catch(()=>{});},100);});

// The playfield artwork is cached so mobile clients only redraw moving objects.
const stage=document.querySelector('.stage'), cabinet=document.querySelector('.cabinet');
function fitArena(){
  let width=Math.min(stage.clientWidth,stage.clientHeight,760);
  cabinet.style.width=width+'px';
  // Labels may wrap once the board narrows, so measure the finished cabinet.
  for(let pass=0;pass<4;pass++){
    const excess=cabinet.offsetHeight-stage.clientHeight;
    if(excess<=0)break;
    width=Math.max(6,width-excess);cabinet.style.width=width+'px';
  }
}
const fitObserver=new ResizeObserver(fitArena);
for(const el of [stage,cabinet.querySelector('footer'),cabinet.querySelector('.plate')])fitObserver.observe(el);
function goalMark(x,y,angle,label,mine){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle=mine?'#ffd19a':'#c6f9e7';ctx.textAlign='center';ctx.font='bold 30px Arial';
  ctx.fillText(label,0,0);ctx.restore();
}
let lastPerfect=0,flashUntil=0,lastGoalCount=0,eventUntil=0,lastBallCount=1;
function resetFeedback(){
  lastPerfect=0;flashUntil=0;lastGoalCount=game?.goalCount||0;
  lastBallCount=game?.balls.length||1;eventUntil=0;$('event').textContent='';
}
function announce(text,tone){
  $('event').textContent=text;$('event').dataset.tone=tone;
  eventUntil=performance.now()+1100;
}
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
    if(i===3)ctx.transform(0,1,1,0,0,0);
    const mine=i===(game?seat:0);
    ctx.fillStyle=mine?'#ffc382':'#70e0c5';ctx.fillRect(310,984,380,16);
    const glow=ctx.createLinearGradient(0,900,0,1000);
    glow.addColorStop(0,'transparent');glow.addColorStop(1,mine?'#ffb34a55':'#6af1c844');
    ctx.fillStyle=glow;ctx.fillRect(310,900,380,84);
    const gradient=ctx.createLinearGradient(0,951,0,979);gradient.addColorStop(0,'#fff5c8');gradient.addColorStop(.28,mine?'#ffbb71':'#a3e0d2');gradient.addColorStop(.75,mine?'#db6837':'#417e70');gradient.addColorStop(1,'#392f27');
    ctx.fillStyle='#0b211b';ctx.fillRect(p.x-75,958,150,27);ctx.fillStyle=gradient;ctx.fillRect(p.x-75,952,150,27);ctx.restore();
  });
  for(const b of game?.balls||[{x:545,y:614}]){
    if(game && b.powerUntil>game.t){
      ctx.strokeStyle='#ffcf76';ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.x,b.y,23,0,Math.PI*2);ctx.stroke();
    }
    disc(ctx,b.x+4,b.y+9,16,[[0,'#061c13'],[1,'#18362a55']]);disc(ctx,b.x,b.y,14,[[0,'white'],[.32,'#e5f8f1'],[.52,'#7daba0'],[.72,'#33463f'],[1,'#bdc9b4']]);
  }
  ctx.restore();
  goalMark(500,913,0,'▼ СВОИ ВОРОТА',true);
  if(!game?.solo || game.hp[1]>0)goalMark(500,98,0,'▲ ЗАБИВАЙ',false);
  if(!game || game.solo){
    if(!game || game.hp[2]>0)goalMark(98,500,-Math.PI/2,'▲ ЗАБИВАЙ',false);
    if(!game || game.hp[3]>0)goalMark(902,500,Math.PI/2,'▲ ЗАБИВАЙ',false);
  }
  const pad=game?.pads[seat];
  if(pad && pad.perfect>lastPerfect){flashUntil=performance.now()+550;announce('Точный удар!','good');}
  lastPerfect=pad?.perfect||0;
  if(!game)flashUntil=0;
  if(game && (game.goalCount||0)>lastGoalCount){
    lastGoalCount=game.goalCount;
    const own=game.lastGoal.side===seat;
    announce(own?'Твои ворота · −1':'Гол сопернику! ',own?'bad':'good');
  }
  if(game && game.balls.length>lastBallCount){
    lastBallCount=game.balls.length;announce('Мультибол · '+lastBallCount+' шара','good');
  }
  $('event').classList.toggle('visible',performance.now()<eventUntil && !game?.paused);
  const elapsed=pad?game.t-pad.hit:10;
  const perfect=performance.now()<flashUntil;
  if(pad && (perfect || elapsed<0.17)){
    const x=seat===1?1000-pad.x:pad.x;
    ctx.strokeStyle=perfect?'#fff3aa':'#ffb05a';ctx.lineWidth=7;
    ctx.beginPath();ctx.arc(x,963,perfect?85:64,-Math.PI,0);ctx.stroke();
  }
  $('power').textContent=!pad?'':perfect?'✦ Точный удар!':elapsed<0.17?'✦ Импульс':elapsed<0.8?'Удар заряжается':'✦ Удар готов';
  $('hit-label').textContent=elapsed<0.17?'✦ Импульс':elapsed<0.8?'Заряд '+(0.8-elapsed).toFixed(1)+' с':'✦ Удар готов';
  $('hit-meter').style.width=(Math.max(0,Math.min(1,elapsed/.8))*100)+'%';
  $('hit').disabled=!pad || elapsed<.8 || Boolean(game?.paused) || networkWaiting;
  $('hud').textContent=!game?'ВОЛНА '+String(profile?.wave||1).padStart(2,'0'):game.solo?'Волна '+game.wave+' · Прочность '+game.hp[0]+' · '+Math.ceil(150-game.t)+' с':game.score[seat]+' : '+game.score[1-seat]+' · '+(game.t<120?Math.ceil(120-game.t)+' с':'Овертайм');
  requestAnimationFrame(render);
}
connect();render();
