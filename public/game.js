const $=id=>document.getElementById(id);
const table=$('table'), ctx=table.getContext('2d');
let game=null,seat=0,target=500,hit=false,profile,online=false,inRoom=false,adsEnabled=false;
let networkWaiting=false,confirmExit=false;
// Keep the same controls and IDs when changing between menu and arena layouts.
const profilePanel=document.createElement('details');profilePanel.id='profile-panel';
const profileSummary=document.createElement('summary');profileSummary.textContent='Настройки и профиль';profilePanel.append(profileSummary);
const menuPanel=document.querySelector('.panel'),mainMenu=$('menu');
mainMenu.before(profilePanel);mainMenu.prepend($('solo'));mainMenu.after($('peer-entry'),profilePanel);
for(const el of [ $('hint'),$('result'),$('progress-overview'),$('wave-preview'),$('difficulty').closest('label'),$('difficulty-note'),$('shop'),$('help'),$('settings'),$('gesture'),document.querySelector('.stats') ])profilePanel.append(el);
menuPanel.querySelector('small')?.remove();menuPanel.querySelector('h1')?.remove();
const gameHeader=document.querySelector('header'),originalFooter=document.querySelector('.cabinet footer');
gameHeader.append($('playing'));
const helpButton=document.createElement('button');helpButton.id='help-button';helpButton.textContent='?';helpButton.title='Помощь и управление';helpButton.setAttribute('aria-label','Помощь и управление');$('playing').append(helpButton);
$('hit').insertAdjacentHTML('afterbegin','<span aria-hidden="true" class="hit-icon">✦</span>');
$('leave').textContent='↪';$('leave').title='Выйти';$('leave').setAttribute('aria-label','Выйти');
document.querySelector('.cabinet').append($('ability'));
$('touchpad').textContent='↔';
const helpDialog=document.createElement('dialog');helpDialog.id='help-dialog';
helpDialog.innerHTML='<button id="close-help" aria-label="Закрыть помощь">Закрыть ×</button><div id="help-content"></div>';
document.body.append(helpDialog);
helpButton.onclick=()=>{if(!game)return;pauseSession(true);$('help-content').append($('help'),$('settings'),$('gesture'));$('help').open=true;helpDialog.showModal();};
function closeHelp(){helpDialog.close();profilePanel.append($('help'),$('settings'),$('gesture'));}
$('close-help').onclick=closeHelp;
helpDialog.addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
// All feedback is local: no audio downloads, analytics or network requests.
let audioContext=null,lastTone=0,goalFlashUntil=0,goalFlashOwn=false;
let previousBalls=[],sparks=[];
const feedbackSettings={sound:false,haptics:false};
try{const saved=JSON.parse(localStorage.getItem('rikoshet-feedback')||'{}');feedbackSettings.sound=saved.sound===true;feedbackSettings.haptics=saved.haptics===true;}catch{}
function unlockAudio(){
  if(!feedbackSettings.sound)return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext ||= new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
}
addEventListener('pointerdown',unlockAudio);addEventListener('keydown',unlockAudio);
function feedback(kind){
  if(document.hidden||game?.paused)return;
  if(feedbackSettings.haptics && kind!=='bounce')try{navigator.vibrate?.(kind==='goal'?45:20);}catch{}
  const now=performance.now();
  if(!feedbackSettings.sound||audioContext?.state!=='running'||now-lastTone<45)return;
  lastTone=now;
  try{
    const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;
    const frequency=kind==='goal'?130:kind==='perfect'?880:kind==='multi'?660:380;
    osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*.55,t+.12);
    gain.gain.setValueAtTime(.045,t);gain.gain.exponentialRampToValueAtTime(.001,t+.14);
    osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.15);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }catch{}
}
for(const [id,key] of [['sound-enabled','sound'],['haptics-enabled','haptics']]){
  $(id).checked=feedbackSettings[key];
  $(id).onchange=()=>{feedbackSettings[key]=$(id).checked;try{localStorage.setItem('rikoshet-feedback',JSON.stringify(feedbackSettings));}catch{}unlockAudio();if(feedbackSettings[key])feedback('perfect');};
}
try{$('help').open=localStorage.getItem('rikoshet-help-seen')!=='1';}catch{$('help').open=true;}
$('help-done').onclick=()=>{$('help').open=false;if(helpDialog.open)closeHelp();try{localStorage.setItem('rikoshet-help-seen','1');}catch{}};
function controls(active){
  if(!active && helpDialog.open)closeHelp();
  profilePanel.hidden=active;
  if(active){gameHeader.prepend($('hud'));profilePanel.open=false;}else originalFooter.prepend($('hud'));
  $('ability').hidden=!game?.solo;
  if(active){$('result-summary').hidden=true;$('result-level').hidden=true;}
  inRoom=active;$('menu').hidden=active;$('playing').hidden=!active;
  $('online-menu').hidden=active || !networkMode;$('shop').hidden=active;
  $('find').disabled=!online;
  $('peer-entry').hidden=active || networkMode;$('peer-entry').disabled=!online;
  if(active && (game || typeof peerSession==='undefined' || !peerSession.active()))$('peer-panel').hidden=true;
  $('hit').disabled=!game;document.body.classList.toggle('match',active);
  if(active)$('result').hidden=true;
  $('pause').hidden=!game?.solo && !(typeof peerSession!=='undefined' && peerSession.active() && game);
  $('touchpad').hidden=!game || $('scheme').value!=='thumb';
  document.querySelectorAll('#menu button').forEach(b=>b.disabled=!online);
  updatePause();
}
function progress(p){
  profile=p;const {xp,level:l,cost,remaining}=levelProgress(p.xp);
  $('stats').textContent='Уровень '+l+' · Опыт '+xp+'/'+cost+' · Осколки '+p.shards;
  $('level-title').textContent='Уровень '+l+' · '+xp+'/'+cost+' опыта · '+p.shards+' осколков';
  $('xp-progress').max=cost;$('xp-progress').value=xp;
  const next=cosmetics.find(item=>!p.owned.includes(item.id));
  $('next-unlock').textContent='До уровня '+(l+1)+': '+remaining+' опыта. '+(next?(p.shards>=next.price?'Доступно оформление «'+next.name+'» в магазине.':'Цель: «'+next.name+'» · ещё '+(next.price-p.shards)+' осколков.'):'Все оформления собраны!');
  $('solo').firstChild.textContent='Волна '+p.wave+' · играть ';
  const rules=waveRules(p.wave);
  $('wave-title').textContent=rules.name+' · Цикл '+rules.cycle;
  $('wave-description').textContent=rules.description;
  if(networkMode)$('stats').textContent+=' · Рейтинг '+p.mmr;
  renderShop();
}
let pendingSkin=null;
function renderShop(){
  const list=$('shop-items');list.replaceChildren();
  for(const item of cosmetics){
    const owned=profile?.owned?.includes(item.id)||item.id==='amber';
    const button=document.createElement('button');
    button.textContent=item.name+' · '+(profile?.skin===item.id?'Выбрано':owned?'Выбрать':item.price+' осколков');
    button.style.borderLeft='6px solid '+item.color;
    button.disabled=profile?.skin===item.id || (!owned && profile?.shards<item.price) || !online;
    button.onclick=()=>{if(owned)send({type:'equip',skin:item.id});else{pendingSkin=item.id;$('purchase-confirm').hidden=false;$('purchase-text').textContent='Купить «'+item.name+'» за '+item.price+' осколков?';}};
    list.append(button);
  }
}
$('purchase-no').onclick=()=>{pendingSkin=null;$('purchase-confirm').hidden=true;};
$('purchase-yes').onclick=()=>{if(pendingSkin)send({type:'buy',skin:pendingSkin});pendingSkin=null;$('purchase-confirm').hidden=true;};
$('find').onclick=()=>start('queue');
$('cancel-search').onclick=()=>send({type:'cancelQueue'});
$('refresh-ranking').onclick=()=>send({type:'leaderboard'});
$('ranking').ontoggle=()=>{if($('ranking').open)send({type:'leaderboard'});};
function renderRanking(rows){
  $('rank-list').replaceChildren();
  if(!rows.length){$('rank-list').textContent='Пока нет завершённых рейтинговых матчей.';return;}
  for(const row of rows){const line=document.createElement('p');line.textContent=row.place+'. '+(row.you?'Ты':row.name)+' · '+row.mmr+' · Побед '+row.wins+'/'+row.played;$('rank-list').append(line);}
}
$('solo').onclick=e=>{e.currentTarget.blur();start('solo');};
const difficultyNames={easy:'Легко',normal:'Обычно',hard:'Сложно'};
try{const saved=localStorage.getItem('rikoshet-difficulty');if(difficultyNames[saved])$('difficulty').value=saved;}catch{}
function explainDifficulty(){
  $('difficulty-note').textContent=({'easy':'Боты медленнее и чаще ошибаются.','normal':'Обычная скорость и точность ботов.','hard':'Боты быстрее и точнее.'})[$('difficulty').value]+' Награды одинаковы. Выбор сохраняется на этом устройстве.';
}
explainDifficulty();
$('difficulty').onchange=()=>{explainDifficulty();try{localStorage.setItem('rikoshet-difficulty',$('difficulty').value);}catch{}};
$('magnet').onclick=()=>{if(game?.solo && !game.paused)send({type:'magnet'});};
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
  if(game?.solo || (typeof peerSession!=='undefined' && peerSession.active()))pauseSession(true);
}
function updatePause(){
  const visible=Boolean(game && (game.paused || networkWaiting));
  $('pause-screen').hidden=!visible;
  $('pause').textContent=game?.paused?'▶':'Ⅱ';
  $('pause').title=game?.paused?'Продолжить':'Пауза';$('pause').setAttribute('aria-label',$('pause').title);
  $('resume').hidden=networkWaiting;
  $('quit').hidden=!confirmExit || networkWaiting;
  $('pause-title').textContent=networkWaiting?'Связь прервана':confirmExit?'Завершить волну?':'Пауза';
  $('pause-text').textContent=networkWaiting?'Ожидаем соединения с соперником':confirmExit?'Награда за незавершённую волну не начисляется':'Нажми «Продолжить», когда будешь готов';
}
function showResult(result){
  profilePanel.open=true;
  confirmExit=false;updatePause();
  $('result').hidden=false;
  $('result-title').textContent=!result.reward?'Волна прервана':result.won?'Победа!':'Раунд завершён';
  const earned=result.earned;
  if(result.summary){
    const s=result.summary,after=levelProgress(profile.xp),before=levelProgress(s.beforeXP);
    $('result-summary').hidden=false;$('result-level').hidden=false;
    $('result-summary').textContent='Волна '+result.wave+' · '+(difficultyNames[s.difficulty]||'Обычно')+' · '+s.seconds+' с. Голы после твоего отражения: '+s.goals+' · Пропущено: '+s.missed+' · Точные удары: '+s.perfect+'.';
    $('result-level').textContent=(after.level>before.level?'Новый уровень '+after.level+'! ':'Уровень '+after.level+'. ')+'До следующего: '+after.remaining+' опыта.';
  }
  $('result-reward').textContent=result.reward && earned?
    '+'+earned.xp+' опыта · +'+earned.shards+' осколков'+(earned.mmr?' · Рейтинг '+(earned.mmr>0?'+':'')+earned.mmr:'')+(result.won && earned.wave?' · Следующая волна открыта':''):
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
table.addEventListener('contextmenu',e=>{if(game){e.preventDefault();if(game.solo && !game.paused)send({type:'magnet'});}});
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
  $('gesture').textContent=scheme.value==='thumb'?'Веди пальцем по площадке под полем. Отпусти перед касанием шара — сильный удар.':'Веди мышью по полю. Левая кнопка — удар, правая — магнит. Клавиатура: ← → и пробел.';
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
  if(!game || e.target.matches('select,input,textarea,button,summary'))return;
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
for(const el of [stage,cabinet.querySelector('footer'),cabinet.querySelector('.plate'),$('ability'),$('touchpad')])fitObserver.observe(el);
function goalMark(x,y,angle,label,mine){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle=mine?'#ffd19a':'#c6f9e7';ctx.textAlign='center';ctx.font='bold 30px Arial';
  ctx.fillText(label,0,0);ctx.restore();
}
let lastPerfect=0,flashUntil=0,lastGoalCount=0,eventUntil=0,lastBallCount=1;
function resetFeedback(){
  previousBalls=[];sparks=[];goalFlashUntil=0;
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
const arenaCache=new Map();
function arenaArt(layout){
  const key=JSON.stringify(layout);
  if(arenaCache.has(key))return arenaCache.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1000;
  const paint=canvas.getContext('2d');paint.drawImage(art,0,0);
  for(const [x,y] of layout){
    disc(paint,x,y+10,50,[[0,'#647569'],[.8,'#283730'],[1,'#0d211a']]);
    disc(paint,x,y,46,[[0,'#fff5c2'],[.43,'#ffc37c'],[.66,'#e9844b'],[.72,'#ffce84'],[.83,'#91432c'],[.94,'#ffc89b'],[1,'#463f31']]);
    paint.fillStyle='#783d27';paint.font='bold 27px Arial';paint.textAlign='center';paint.fillText('✦',x,y+8);
  }
  arenaCache.set(key,canvas);return canvas;
}
function render(){
  const frameNow=performance.now();
  if(game && !game.paused){
    game.balls.forEach((b,i)=>{
      const old=previousBalls[i];
      if(old && Math.hypot(b.x-old.x,b.y-old.y)<100 && b.vx*old.vx+b.vy*old.vy<0){
        sparks.push({x:b.x,y:b.y,until:frameNow+260});feedback('bounce');
      }
    });
    previousBalls=game.balls.map(b=>({...b}));
  }else previousBalls=[];
  sparks=sparks.filter(s=>s.until>frameNow).slice(-12);
  ctx.save();if(seat===1 && game){ctx.translate(1000,1000);ctx.rotate(Math.PI);}
  ctx.drawImage(arenaArt(game ? game.rules?.bumpers || bumpers : waveRules(profile?.wave).bumpers),0,0);
  for(const s of sparks){
    const life=(s.until-frameNow)/260;ctx.globalAlpha=life;ctx.strokeStyle='#fff0ad';ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(s.x,s.y,16+(1-life)*40,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  const pads=game?.pads||Array.from({length:4},()=>({x:500}));
  pads.forEach((p,i)=>{
    if(game?.solo && game.hp[i]<=0)return;
    ctx.save();if(i===1){ctx.translate(0,1000);ctx.scale(1,-1);}
    if(i===2){ctx.translate(1000,0);ctx.rotate(Math.PI/2);ctx.scale(1,1);}
    if(i===3)ctx.transform(0,1,1,0,0,0);
    const mine=i===(game?seat:0);
    const skin=cosmetics.find(item=>item.id===(game?game.skins?.[i]:profile?.skin))||cosmetics[0];
    ctx.fillStyle=mine?'#ffc382':'#70e0c5';ctx.fillRect(310,984,380,16);
    const glow=ctx.createLinearGradient(0,900,0,1000);
    glow.addColorStop(0,'transparent');glow.addColorStop(1,mine?'#ffb34a55':'#6af1c844');
    ctx.fillStyle=glow;ctx.fillRect(310,900,380,84);
    const gradient=ctx.createLinearGradient(0,951,0,979);gradient.addColorStop(0,'#fff5c8');gradient.addColorStop(.28,mine?skin.color:'#a3e0d2');gradient.addColorStop(.75,mine?skin.shade:'#417e70');gradient.addColorStop(1,'#392f27');
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
  if(game?.solo){
    const held=game.balls.some(b=>b.heldUntil>game.t),armed=game.magnetUntil>game.t;
    $('energy').value=game.energy;
    $('magnet').disabled=game.paused || game.energy<100 || armed || held;
    $('magnet').textContent=held?'Шар пойман · запуск через 1 с':armed?'Магнит · '+Math.ceil(game.magnetUntil-game.t)+' с':game.energy>=100?'Магнит готов · включить':'Магнит · '+game.energy+'/100';
    $('energy-note').textContent=held?'Двигай отражатель — шар следует за ним.':armed?'Лови ближайший шар отражателем.':'Точный удар: +25 энергии';
    if(armed || held){ctx.strokeStyle='#a5cfff';ctx.lineWidth=6;ctx.beginPath();ctx.arc(pad.x,955,100,Math.PI,2*Math.PI);ctx.stroke();}
  }
  if(pad && pad.perfect>lastPerfect){flashUntil=performance.now()+550;announce('Точный удар!','good');feedback('perfect');}
  lastPerfect=pad?.perfect||0;
  if(!game)flashUntil=0;
  if(game && (game.goalCount||0)>lastGoalCount){
    lastGoalCount=game.goalCount;
    const own=game.lastGoal.side===seat;
    goalFlashUntil=frameNow+650;goalFlashOwn=own;feedback('goal');
    announce(own?'Твои ворота · −1':'Гол сопернику! ',own?'bad':'good');
  }
  if(game && game.balls.length>lastBallCount){
    lastBallCount=game.balls.length;announce('Мультибол · '+lastBallCount+' шара','good');feedback('multi');
  }
  if(game && !game.paused && frameNow<goalFlashUntil){
    ctx.globalAlpha=(goalFlashUntil-frameNow)/650;ctx.strokeStyle=goalFlashOwn?'#ff855f':'#8affd5';ctx.lineWidth=18;ctx.strokeRect(9,9,982,982);ctx.globalAlpha=1;
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
  $('hit').title=$('hit-label').textContent;$('hit').setAttribute('aria-label',$('hit-label').textContent);
  $('hit-meter').style.width=(Math.max(0,Math.min(1,elapsed/.8))*100)+'%';
  $('hit').disabled=!pad || elapsed<.8 || Boolean(game?.paused) || networkWaiting;
  $('hud').textContent=!game?'ВОЛНА '+String(profile?.wave||1).padStart(2,'0'):game.solo?'Волна '+game.wave+' · Прочность '+game.hp[0]+' · '+Math.ceil(150-game.t)+' с':game.score[seat]+' : '+game.score[1-seat]+' · '+(game.t<120?Math.ceil(120-game.t)+' с':'Овертайм');
  requestAnimationFrame(render);
}
if(typeof peerSession!=='undefined')peerSession.init();
connect();render();
