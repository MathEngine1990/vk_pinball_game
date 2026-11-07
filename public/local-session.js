const localSession=(()=>{
let store,saving=false,saveStatus;
function showSaveStatus(status){
  saveStatus=status;
  const messages={local:status.localOK?'Прогресс хранится на этом устройстве.':'Сохранение недоступно. Прогресс доступен до закрытия игры.',
    syncing:'Синхронизация с VK…',saved:'Прогресс сохранён в VK. Можно продолжить на другом устройстве.',
    pending:'Изменения ожидают сохранения в VK.',unavailable:status.localOK?'VK пока не подтвердил сохранение. Копия есть на устройстве.':'VK и сохранение на устройстве недоступны. Не закрывай игру до повторной синхронизации.',
    conflict:'Найдены разные сохранения. Выбери, какое продолжить.'};
  $('save-note').textContent=messages[status.kind];
  $('sync-save').hidden=!status.cloud || !['pending','unavailable'].includes(status.kind);
  $('import-save').hidden=!status.canImport;
  $('save-conflict').hidden=status.kind!=='conflict';
  if(status.conflict)$('save-conflict-text').textContent='На устройстве: волна '+status.profile.wave+', '+status.profile.shards+' осколков. В VK: волна '+status.conflict.wave+', '+status.conflict.shards+' осколков. Замена перенесёт всю выбранную версию.';
}
async function synchronize(action='sync'){
  if(saving || game)return;
  saving=true;online=false;controls(false);renderShop();
  for(const id of ['sync-save','import-save','use-cloud','use-local'])$(id).disabled=true;
  try{
    const saved=action==='import'?await store.importLocal():['cloud','local'].includes(action)?await store.resolve(action):await store.sync();
    progress(saved);
  }finally{
    saving=false;online=true;controls(false);renderShop();
    for(const id of ['sync-save','import-save','use-cloud','use-local'])$(id).disabled=false;
  }
}
function endLocal(finished){
  if(!game)return;
  const won=finished && game.winner===0;
  const earned=finished?rewards(game,0):{xp:0,shards:0,wave:0};
  const wave=game.wave;
  profile.xp+=earned.xp;profile.shards+=earned.shards;profile.wave+=earned.wave;
  if(finished)store.save(profile);
  game=null;resetInput();controls(false);progress(profile);
  showResult({won,reward:finished,earned,wave});
  if(saveStatus)showSaveStatus(saveStatus);
  if(finished)void synchronize();
}
function send(message){
  if(!game && !saving && ['buy','equip'].includes(message.type)){
    const item=cosmetics.find(item=>item.id===message.skin);if(!item)return;
    const owned=profile.owned.includes(item.id);
    if(!owned && (message.type==='equip' || profile.shards<item.price)){$('hint').textContent='Недостаточно осколков';return;}
    if(!owned){profile.shards-=item.price;profile.owned.push(item.id);}
    profile.skin=item.id;store.save(profile);progress(profile);void synchronize();return;
  }
  if(!game)return;
  if(message.type==='input')input(game,0,message.x,message.hit);
  if(message.type==='leave')endLocal(false);
}
function pauseSession(paused){if(game){game.paused=paused;resetInput();updatePause();}}
async function start(type){
  if(type!=='solo' || game || saving || !online)return;
  await synchronize();
  if(saveStatus?.kind==='conflict'){$('hint').textContent='Выбери сохранение внизу меню, затем начни волну.';return;}
  game=arena(true,profile.wave);game.skins=[profile.skin];target=500;
  resetInput();resetFeedback();controls(true);
  $('hint').textContent='Защищай оранжевые ворота внизу. Забивай в три бирюзовых.';
  $('mode').textContent='ВОЛНА '+game.wave+' · '+game.rules.name;$('solo').blur();
}
async function connect(){
  const params=new URLSearchParams(launch);
  const app=params.get('vk_app_id'),user=params.get('vk_user_id');
  const account=bridge && /^\d+$/.test(app||'') && /^\d+$/.test(user||'')?app+'-'+user:'';
  let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('storage unavailable');}};}
  store=createSoloStore({storage,bridge,account,onStatus:showSaveStatus});
  online=false;profile=store.get();progress(profile);controls(false);
  $('account').textContent=account?'Одиночная игра · VK':'Одиночная игра';
  for(const id of ['join','create','find','ranking'])$(id).hidden=true;
  $('sync-save').onclick=()=>synchronize();$('import-save').onclick=()=>synchronize('import');
  $('use-cloud').onclick=()=>synchronize('cloud');$('use-local').onclick=()=>synchronize('local');
  $('hint').textContent='Защити свои ворота и обыграй трёх ботов.';
  await synchronize();
  let previous=performance.now(),accumulated=0;
  function simulate(now){
    const elapsed=Math.min(.1,(now-previous)/1000);previous=now;
    if(!game || game.paused || document.hidden)accumulated=0;
    else{accumulated+=elapsed;while(accumulated>=1/60 && game){accumulated-=1/60;step(game,1/60);if(game.winner!==null)endLocal(true);}}
    requestAnimationFrame(simulate);
  }
  requestAnimationFrame(simulate);
}
return {send,start,connect,pauseSession,endLocal};
})();
