const $=id=>document.getElementById(id);
const table=$('table'), ctx=table.getContext('2d');
let game=null,seat=0,target=500,hit=false,profile,online=false,inRoom=false,adsEnabled=false;
let networkWaiting=false,confirmExit=false;
let splashShown=true;
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
$('touchpad').textContent='↔ Веди пальцем · отпусти для импульса';
const helpDialog=document.createElement('dialog');helpDialog.id='help-dialog';
helpDialog.innerHTML='<button id="close-help" aria-label="Закрыть помощь">Закрыть ×</button><div id="help-content"></div>';
document.body.append(helpDialog);
helpButton.onclick=()=>{if(!game)return;pauseSession(true);$('help-content').append($('help'),$('settings'),$('gesture'));$('help').open=true;helpDialog.showModal();};
function closeHelp(){helpDialog.close();profilePanel.append($('help'),$('settings'),$('gesture'));}
$('close-help').onclick=closeHelp;
helpDialog.addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
// Shared audio switches move into a separate HUD row during play.
const audioPanel=document.createElement('section');audioPanel.id='audio-panel';
const audioToolbar=document.createElement('div');audioToolbar.id='audio-toolbar';
const musicIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/><path class="mute-slash" d="M3 3l18 18"/></svg>';
const effectsIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 9q4 3 0 6M19 5q7 7 0 14"/><path class="mute-slash" d="M3 3l18 18"/></svg>';
audioToolbar.innerHTML='<span class="audio-caption">ЗВУК АРЕНЫ</span><button id="music-toggle" class="audio-switch" type="button">'+musicIcon+'<span>Музыка</span></button><button id="sound-toggle" class="audio-switch" type="button">'+effectsIcon+'<span>Эффекты</span></button>';
const audioBalance=document.createElement('details');audioBalance.id='audio-balance';audioBalance.open=true;
audioBalance.innerHTML='<summary>Баланс музыки и эффектов</summary>';
for(const id of ['music-enabled','sound-enabled']){$(id).closest('label').hidden=true;audioBalance.append($(id).closest('label'));}
for(const id of ['music-volume','sound-volume'])audioBalance.append($(id).closest('label'));
audioBalance.append($('music-status'));audioPanel.append(audioToolbar,audioBalance);
profilePanel.before(audioPanel);
const duelResultDialog=document.createElement('dialog');duelResultDialog.id='duel-result';
duelResultDialog.setAttribute('aria-labelledby','duel-result-title');
duelResultDialog.innerHTML='<div class="duel-result-top">АРЕНА / РИКОШЕТ · ФИНАЛ</div><div class="duel-result-emblem" aria-hidden="true">✦</div><h2 id="duel-result-title"></h2><p id="duel-result-note"></p><div class="duel-scoreboard"><section class="duel-winner"><small>ПОБЕДИТЕЛЬ</small><b id="duel-winner-name"></b><strong id="duel-winner-score"></strong></section><span class="duel-score-separator">:</span><section class="duel-loser"><small>ПРОИГРАВШИЙ</small><b id="duel-loser-name"></b><strong id="duel-loser-score"></strong></section></div><p class="duel-result-footer">Дружеская дуэль · без изменения рейтинга и наград</p><button id="duel-result-menu">Вернуться в меню ↪</button>';
document.body.append(duelResultDialog);
function showDuelResult({winner,score,seat:playerSeat}){
  if(helpDialog.open)closeHelp();
  const won=winner===playerSeat;duelResultDialog.dataset.outcome=won?'win':'loss';
  $('duel-result-title').textContent=won?'ТВОЙ ПОБЕДНЫЙ РИКОШЕТ':'АРЕНА ЗА СОПЕРНИКОМ';
  $('duel-result-note').textContent=won?'Сталь остыла. Победа — твоя.':'Шар остыл. Следующий рикошет может стать твоим.';
  $('duel-winner-name').textContent=won?'ТЫ':'СОПЕРНИК';$('duel-loser-name').textContent=won?'СОПЕРНИК':'ТЫ';
  $('duel-winner-score').textContent=score[winner];$('duel-loser-score').textContent=score[1-winner];
  $('pause-screen').hidden=true;
  if(!duelResultDialog.open)duelResultDialog.showModal();
  $('duel-result-menu').focus();
}
function hideDuelResult(){if(duelResultDialog.open)duelResultDialog.close();}
function leaveDuelResult(){peerSession.send({type:'leave'});}
$('duel-result-menu').onclick=leaveDuelResult;
duelResultDialog.addEventListener('cancel',event=>{event.preventDefault();leaveDuelResult();});
// Audio assets load after interaction; synthesized tones remain a loading fallback.
let audioContext=null,lastTone=0,goalFlashUntil=0,goalFlashOwn=false;
let previousBalls=[],sparks=[],trails=[],lastTrailTime=-1,lastHP=[],closedAt={};
const feedbackSettings={sound:true,haptics:false,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
try{const saved=JSON.parse(localStorage.getItem('rikoshet-feedback')||'{}');if(typeof saved.sound==='boolean')feedbackSettings.sound=saved.sound;feedbackSettings.haptics=saved.haptics===true;if(typeof saved.reduced==='boolean')feedbackSettings.reduced=saved.reduced;}catch{}
const transition=document.createElement('div');transition.id='wave-transition';transition.setAttribute('role','status');document.querySelector('.board').append(transition);
let transitionUntil=0;
function waveTransition(text){transition.textContent=text;transitionUntil=performance.now()+1400;}
function unlockAudio(){
  if(!feedbackSettings.sound && !musicSettings.enabled)return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext ||= new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
}
addEventListener('pointerdown',()=>{unlockAudio();musicController?.unlock();if(feedbackSettings.sound)void soundController?.preload();});addEventListener('keydown',()=>{unlockAudio();musicController?.unlock();if(feedbackSettings.sound)void soundController?.preload();});
function feedback(kind){
  if(document.hidden||musicViewHidden||(game?.paused && kind!=='click'))return;
  if(feedbackSettings.haptics && kind!=='bounce')try{navigator.vibrate?.(kind.startsWith('goal')?45:20);}catch{}
  const now=performance.now();
  if(!feedbackSettings.sound||audioMix.effects<=0||audioContext?.state!=='running')return;
  const heat=game && !game.solo?((game.balls[0]?.minSpeed||360)-360)/720:0;
  if(soundController?.play(kind,heat))return;
  if(now-lastTone<45)return;
  lastTone=now;
  try{
    const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;
    const frequency=kind.startsWith('goal')?130:kind==='perfect'?880:kind==='multi'?660:380;
    osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*.55,t+.12);
    gain.gain.setValueAtTime(.045*audioMix.effects,t);gain.gain.exponentialRampToValueAtTime(.001,t+.14);
    osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.15);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }catch{}
}
for(const [id,key] of [['sound-enabled','sound'],['haptics-enabled','haptics'],['reduced-effects','reduced']]){
  $(id).checked=feedbackSettings[key];
  $(id).onchange=()=>{feedbackSettings[key]=$(id).checked;try{localStorage.setItem('rikoshet-feedback',JSON.stringify(feedbackSettings));}catch{}if(key==='reduced'){trails=[];sparks=[];return;}unlockAudio();if(key==='sound'){if(feedbackSettings.sound)void soundController?.preload();else soundController?.stop();}if(feedbackSettings[key])feedback('perfect');syncAudioUI();};
}
const soundController=typeof createSoundController==='function'?createSoundController({getContext:()=>{unlockAudio();return audioContext;},getVolume:()=>audioMix.effects,baseURL:new URL('audio/sfx/',location.href)}):null;
document.addEventListener('click',event=>{if(event.target.closest('button,summary'))feedback('click');});
let musicViewHidden=false;
const musicSettings={enabled:true,volume:.25};
try{Object.assign(musicSettings,JSON.parse(localStorage.getItem('rikoshet-music-v1')||'{}'));}catch{}
const audioMix={music:.25,effects:.1};
try{const saved=JSON.parse(localStorage.getItem('rikoshet-audio-mix-v2')||'{}');for(const key of ['music','effects'])if(Number.isFinite(saved[key]))audioMix[key]=Math.max(0,Math.min(1,saved[key]));}catch{}
musicSettings.volume=audioMix.music;
const musicController=typeof createMusicController==='function'?createMusicController({
  getContext:()=>{unlockAudio();return audioContext;},
  getState:()=>({game,enabled:musicSettings.enabled,volume:musicSettings.volume,hidden:document.hidden || musicViewHidden || splashShown}),
  baseURL:new URL('audio/runtime/',location.href),onStatus:text=>{$('music-status').textContent=text;}
}):null;
$('music-enabled').checked=musicSettings.enabled;$('music-volume').value=musicSettings.volume;
function saveMusic(){syncAudioUI();try{localStorage.setItem('rikoshet-music-v1',JSON.stringify(musicSettings));}catch{}musicController?.tick();}
$('music-enabled').onchange=()=>{musicSettings.enabled=$('music-enabled').checked;saveMusic();musicController?.unlock();};
function saveAudioMix(){try{localStorage.setItem('rikoshet-audio-mix-v2',JSON.stringify(audioMix));}catch{}syncAudioUI();}
$('music-volume').oninput=()=>{audioMix.music=musicSettings.volume=Number($('music-volume').value);saveAudioMix();saveMusic();};
$('sound-volume').oninput=()=>{audioMix.effects=Number($('sound-volume').value);saveAudioMix();soundController?.updateVolume();};
$('music-toggle').onclick=()=>{$('music-enabled').checked=!musicSettings.enabled;$('music-enabled').onchange();};
$('sound-toggle').onclick=()=>{$('sound-enabled').checked=!feedbackSettings.sound;$('sound-enabled').onchange();};
function syncAudioUI(){
  $('music-volume').value=musicSettings.volume;$('sound-volume').value=audioMix.effects;
  $('music-volume-value').textContent=Math.round(musicSettings.volume*100)+'%';$('sound-volume-value').textContent=Math.round(audioMix.effects*100)+'%';
  for(const [id,enabled,label,volume] of [['music-toggle',musicSettings.enabled,'Музыка',musicSettings.volume],['sound-toggle',feedbackSettings.sound,'Эффекты',audioMix.effects]]){
    const button=$(id);button.setAttribute('aria-pressed',String(enabled));button.classList.toggle('muted',!enabled || volume===0);
    button.title=label+': '+(enabled?Math.round(volume*100)+'%':'выключены');button.setAttribute('aria-label',(enabled?'Выключить: ':'Включить: ')+label);
  }
}
syncAudioUI();
addEventListener('visibilitychange',()=>{musicController?.tick();if(document.hidden)soundController?.stop();});
addEventListener('pagehide',()=>{musicController?.stop();soundController?.stop();});
bridge?.subscribe(event=>{const type=event.detail?.type;if(type==='VKWebAppViewHide' || type==='VKWebAppViewRestore'){musicViewHidden=type==='VKWebAppViewHide';musicController?.tick();if(musicViewHidden)soundController?.stop();}});
try{$('help').open=localStorage.getItem('rikoshet-help-seen')!=='1';}catch{$('help').open=true;}
$('help-done').onclick=()=>{$('help').open=false;if(helpDialog.open)closeHelp();try{localStorage.setItem('rikoshet-help-seen','1');}catch{}};
function controls(active){
  if(!active && helpDialog.open)closeHelp();
  profilePanel.hidden=active;audioPanel.hidden=active;
  if(active && game)gameHeader.append(audioToolbar);else audioPanel.prepend(audioToolbar);
  if(active){gameHeader.prepend($('hud'));profilePanel.open=false;}else originalFooter.prepend($('hud'));
  $('ability').hidden=!game?.solo;
  if(active){$('result-summary').hidden=true;$('result-level').hidden=true;}
  setGameGestures(active);
  document.documentElement.classList.toggle('game-locked',active && Boolean(game));
  inRoom=active;$('menu').hidden=active;$('playing').hidden=!active;
  $('online-menu').hidden=active || !networkMode;$('shop').hidden=active;
  $('find').disabled=!online;
  $('peer-entry').hidden=active || networkMode;$('peer-entry').disabled=!online;
  if(active && (game || typeof peerSession==='undefined' || !peerSession.active()))$('peer-panel').hidden=true;
  $('hit').disabled=!game;document.body.classList.toggle('match',active && Boolean(game));
  if(active)$('result').hidden=true;
  $('pause').hidden=!game?.solo && !(typeof peerSession!=='undefined' && peerSession.active() && game);
  $('touchpad').hidden=!game || $('scheme').value!=='thumb';
  document.querySelectorAll('#menu button').forEach(b=>b.disabled=!online);
  updatePause();
  syncGameViewport();
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
  const visible=Boolean(game && game.winner===null && (game.paused || networkWaiting));
  $('pause-screen').hidden=!visible;
  $('pause').textContent=game?.paused?'▶':'Ⅱ';
  $('pause').title=game?.paused?'Продолжить':'Пауза';$('pause').setAttribute('aria-label',$('pause').title);
  $('resume').hidden=networkWaiting;
  $('quit').hidden=!confirmExit || networkWaiting;
  $('pause-title').textContent=networkWaiting?'Связь прервана':confirmExit?'Завершить волну?':'Пауза';
  $('pause-text').textContent=networkWaiting?'Ожидаем соединения с соперником':confirmExit?'Награда за незавершённую волну не начисляется':'Нажми «Продолжить», когда будешь готов';
}
function showResult(result){
  if(result.reward)feedback(result.won?'goal-win':'goal-lose');
  waveTransition(result.reward?(result.won?'Волна пройдена · дальше волна '+profile.wave:'Волна завершена · попробуй снова'):'Возвращение в меню');
  profilePanel.open=false;
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
// Non-passive fallback for iOS WebViews: consume drags on the game surface,
// while dialogs and menu fields keep their normal scrolling and selection.
document.addEventListener('touchmove',event=>{
  if(game && !helpDialog.open && !event.target.closest('#help-dialog') && event.cancelable)event.preventDefault();
},{passive:false});
for(const surface of [table,$('touchpad')]){
  surface.addEventListener('touchstart',event=>{
    if(game && !helpDialog.open && event.cancelable)event.preventDefault();
  },{passive:false});
  surface.addEventListener('contextmenu',event=>{if(game)event.preventDefault();});
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
// Safari can retain focus zoom after exchanging invitation codes. Fit the
// visible viewport of this device, not only the larger layout viewport.
function syncGameViewport(){
  const viewport=window.visualViewport;
  const style=document.documentElement.style;
  for(const [key,value] of Object.entries({width:viewport?.width||innerWidth,height:viewport?.height||innerHeight,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0})){
    style.setProperty('--game-'+key,value+'px');
  }
  fitArena();
}
window.visualViewport?.addEventListener('resize',syncGameViewport);
window.visualViewport?.addEventListener('scroll',syncGameViewport);
addEventListener('resize',syncGameViewport);
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
    ctx.fillStyle=mine===null?'#b5c3c5':mine?'#ffb3a3':'#a4f7e2';ctx.textAlign='center';ctx.font='bold 30px Arial';
  ctx.fillText(label,0,0);ctx.restore();
}
let lastPerfect=0,flashUntil=0,lastGoalCount=0,eventUntil=0,lastBallCount=1;
function resetFeedback(){
  trails=[];lastTrailTime=-1;lastHP=[...(game?.hp||[])];closedAt={};
  if(game?.solo)waveTransition('Волна '+game.wave+' · '+game.rules.name);else transitionUntil=0;
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
  transition.hidden=frameNow>=transitionUntil || Boolean(game?.paused);
  if(!game || game.paused || feedbackSettings.reduced)trails=[];
  else if(game.t-lastTrailTime>=.015 || lastTrailTime<0){
    game.balls.forEach((b,i)=>{
      let points=trails[i]||[];const old=points.at(-1);
      if(b.heldUntil>game.t || old && Math.hypot(b.x-old.x,b.y-old.y)>90)points=[];
      points.push({x:b.x,y:b.y,t:game.t});trails[i]=points.filter(p=>game.t-p.t<.12).slice(-8);
    });trails.length=game.balls.length;lastTrailTime=game.t;
  }
  if(game?.solo){game.hp.forEach((hp,i)=>{if(hp<=0 && lastHP[i]>0)closedAt[i]=game.t;});lastHP=[...game.hp];}
  if(game && !game.paused){
    game.balls.forEach((b,i)=>{
      const old=previousBalls[i];
      if(b.heldUntil>game.t && !(old?.heldUntil>game.t))feedback('magnet');
      if(old && Math.hypot(b.x-old.x,b.y-old.y)<100 && b.vx*old.vx+b.vy*old.vy<0){
        if(!feedbackSettings.reduced)sparks.push({x:b.x,y:b.y,until:frameNow+260});feedback('bounce');
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
    ctx.save();if(i===1){ctx.translate(0,1000);ctx.scale(1,-1);}
    if(i===2){ctx.translate(1000,0);ctx.rotate(Math.PI/2);ctx.scale(1,1);}
    if(i===3)ctx.transform(0,1,1,0,0,0);
    if(game?.solo && game.hp[i]<=0){
      const amount=feedbackSettings.reduced?1:Math.min(1,(game.t-(closedAt[i]??game.t-.35))/.35);
      ctx.fillStyle='#111d22';ctx.fillRect(304,980,392,20);
      ctx.fillStyle='#7d8990';ctx.fillRect(310,982,190*amount,18);ctx.fillRect(690-190*amount,982,190*amount,18);
      ctx.strokeStyle='#c5d3d8';ctx.lineWidth=3;ctx.strokeRect(310,982,380,18);
      ctx.restore();return;
    }
    const mine=i===(game?seat:0);
    const skin=cosmetics.find(item=>item.id===(game?game.skins?.[i]:profile?.skin))||cosmetics[0];
    // Goals are recessed openings with a thin net and posts; paddles are solid raised objects.
    const goalColor=mine?'#ff7966':'#4edfc1';
    ctx.fillStyle='#050e10';ctx.fillRect(310,985,380,15);
    ctx.strokeStyle=mine?'#9a4b45':'#287b70';ctx.lineWidth=2;
    for(let x=320;x<690;x+=20){ctx.beginPath();ctx.moveTo(x,987);ctx.lineTo(x+8,1000);ctx.stroke();}
    ctx.strokeStyle=goalColor;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(310,998);ctx.lineTo(690,998);ctx.stroke();
    ctx.fillStyle=goalColor;ctx.fillRect(304,979,6,21);ctx.fillRect(690,979,6,21);
    const gradient=ctx.createLinearGradient(0,952,0,984);
    gradient.addColorStop(0,'#fff9e7');gradient.addColorStop(.2,mine?skin.color:'#d8e2ef');gradient.addColorStop(.7,mine?skin.shade:'#63788d');gradient.addColorStop(1,'#27313b');
    ctx.fillStyle='#020a0c';ctx.beginPath();ctx.roundRect(p.x-79,950,158,37,9);ctx.fill();
    ctx.fillStyle=gradient;ctx.beginPath();ctx.roundRect(p.x-75,952,150,30,7);ctx.fill();
    ctx.strokeStyle=mine?'#fff0c6':'#f2f7ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-65,954);ctx.lineTo(p.x+65,954);ctx.stroke();
    // Three short grip marks move with the paddle, unlike the fixed goal net.
    ctx.strokeStyle=mine?'#663315':'#344657';ctx.lineWidth=3;
    for(const offset of [-9,0,9]){ctx.beginPath();ctx.moveTo(p.x+offset,962);ctx.lineTo(p.x+offset,974);ctx.stroke();}
    ctx.restore();
  });
  for(const points of trails){
    ctx.lineCap='round';ctx.lineWidth=9;
    for(let i=1;i<points.length;i++){ctx.strokeStyle='rgba(180,233,226,'+(i/points.length*.3)+')';ctx.beginPath();ctx.moveTo(points[i-1].x,points[i-1].y);ctx.lineTo(points[i].x,points[i].y);ctx.stroke();}
  }ctx.lineCap='butt';
  for(const b of game?.balls||[{x:545,y:614}]){
    if(game && b.powerUntil>game.t){
      ctx.strokeStyle='#ffcf76';ctx.lineWidth=5;ctx.beginPath();ctx.arc(b.x,b.y,23,0,Math.PI*2);ctx.stroke();
    }
    const heat=game && !game.solo ? Math.min(1,Math.max(0,((b.minSpeed||360)-360)/720)) : 0;
    if(heat>0){ctx.strokeStyle='rgba(255,100,35,'+(.25+.65*heat)+')';ctx.lineWidth=3+heat*5;ctx.beginPath();ctx.arc(b.x,b.y,18,0,Math.PI*2);ctx.stroke();}
    disc(ctx,b.x+4,b.y+9,16,[[0,'#061c13'],[1,'#18362a55']]);disc(ctx,b.x,b.y,14,[[0,'white'],[.32,'#e5f8f1'],[.52,'#7daba0'],[.72,'#33463f'],[1,'#bdc9b4']]);
  }
  ctx.restore();
  goalMark(500,913,0,'▼ СВОИ ВОРОТА',true);
  if(!game?.solo || game.hp[1]>0)goalMark(500,98,0,'▲ ЗАБИВАЙ',false);
  else goalMark(500,98,0,'ЗАКРЫТО',null);
  if(!game || game.solo){
    if(!game || game.hp[2]>0)goalMark(98,500,-Math.PI/2,'▲ ЗАБИВАЙ',false);
    else goalMark(98,500,-Math.PI/2,'ЗАКРЫТО',null);
    if(!game || game.hp[3]>0)goalMark(902,500,Math.PI/2,'▲ ЗАБИВАЙ',false);
    else goalMark(902,500,Math.PI/2,'ЗАКРЫТО',null);
  }
  const pad=game?.pads[seat];
  if(game?.solo){
    const held=game.balls.some(b=>b.heldUntil>game.t),armed=game.magnetUntil>game.t;
    $('energy').value=game.energy;
    $('magnet').disabled=game.paused || game.energy<100 || armed || held;
    $('magnet').textContent=held?'Шар пойман · запуск через 1 с':armed?'Магнит · '+Math.ceil(game.magnetUntil-game.t)+' с':game.energy>=100?'Магнит готов · включить':'Магнит · '+game.energy+'/100';
    $('energy-note').textContent=held?'Двигай отражатель — шар следует за ним.':armed?'Лови ближайший шар отражателем.':'Отражение +5 · точный удар +25';
    if(armed || held){ctx.strokeStyle='#a5cfff';ctx.lineWidth=6;ctx.beginPath();ctx.arc(pad.x,955,100,Math.PI,2*Math.PI);ctx.stroke();}
  }
  if(pad && pad.perfect>lastPerfect){flashUntil=performance.now()+550;announce('Точный удар!','good');feedback('perfect');}
  lastPerfect=pad?.perfect||0;
  if(!game)flashUntil=0;
  if(game && (game.goalCount||0)>lastGoalCount){
    lastGoalCount=game.goalCount;
    const own=game.lastGoal.side===seat;
    goalFlashUntil=frameNow+650;goalFlashOwn=own;feedback(own?'goal-lose':'goal-win');
    announce(own?'Твои ворота · −1':'Гол сопернику! ',own?'bad':'good');
  }
  if(game && game.balls.length>lastBallCount){
    lastBallCount=game.balls.length;announce('Мультибол · '+lastBallCount+' шара','good');feedback('multi');
  }
  if(game && !game.paused && !feedbackSettings.reduced && frameNow<goalFlashUntil){
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
// Automatic VK banner; diagnostic history stays internal, never in player settings.
const desktopAds=()=>view==='web' && innerWidth>=900;
function bannerArea(){
  const rect=cabinet.getBoundingClientRect(),viewport=window.visualViewport;
  const bottom=Math.min(innerHeight,viewport?viewport.height+viewport.offsetTop:innerHeight);
  return {side:desktopAds(),gap:desktopAds()?rect.left:bottom-rect.bottom,width:innerWidth,height:bottom-gameHeader.getBoundingClientRect().bottom-16};
}
const bannerVisible=()=>Boolean(game && !game.paused && !document.hidden && !helpDialog.open);
const inVK=bridge && (bridge.isEmbedded?.() || new URLSearchParams(launch).has('vk_app_id'));
const bannerHistory=[];
function bannerStatus(text){
  if(bannerHistory.at(-1)!==text)bannerHistory.push(text);
  if(bannerHistory.length>6)bannerHistory.shift();

}
const bannerController=typeof createBannerController==='function'?createBannerController({sdk:inVK?bridge:null,ready:vkInitReady,measure:bannerArea,getMatch:()=>game?game.solo?game:'peer-match':null,isVisible:bannerVisible,onStatus:bannerStatus}):null;
function updateBanner(){document.body.classList.toggle('desktop-arena',desktopAds());void bannerController?.tick();}
bannerController?.setMode(inVK?'vk':'off');setInterval(updateBanner,300);
addEventListener('resize',updateBanner);
addEventListener('pagehide',()=>bannerController?.setMode('off'));
addEventListener('pageshow',()=>bannerController?.setMode(inVK?'vk':'off'));
if(typeof peerSession!=='undefined')peerSession.init();
document.querySelector('main').inert=true;gameHeader.inert=true;
$('splash-enter').onclick=()=>{
  splashShown=false;$('splash').hidden=true;document.body.classList.remove('splash-open');
  document.querySelector('main').inert=false;gameHeader.inert=false;
  unlockAudio();musicController?.unlock();if(feedbackSettings.sound)void soundController?.preload();
  syncGameViewport();$('solo').focus();
};
connect();render();
