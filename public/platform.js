const launch = location.search;
const view = new URLSearchParams(launch).get('view') ||
  (location.pathname.endsWith('/mobile.html') ? 'mobile' :
    location.pathname.endsWith('/web.html') ? 'web' : 'auto');
const bridge = window.vkBridge;
let vkInitReady=Promise.resolve(false);
if (bridge && (bridge.isEmbedded() || new URLSearchParams(launch).has('vk_app_id'))) {
  vkInitReady=bridge.send('VKWebAppInit', {}).then(()=>true).catch(() => {
    console.warn('ВКонтакте не подтвердил запуск.');
    return false;
  });
  bridge.subscribe(event => {
    if (event.detail.type === 'VKWebAppViewHide' && typeof suspendGame === 'function') {
      suspendGame();
    }
  });
}

// Serialize native gesture changes: a late reply must not restore swipes mid-match.
let swipeLocked=false,swipeWork=Promise.resolve();
function setGameGestures(locked){
  if(swipeLocked===locked)return;
  swipeLocked=locked;
  swipeWork=swipeWork.catch(()=>{}).then(async()=>{
    if(!await vkInitReady || !bridge)return;
    const desired=swipeLocked;
    const commands=[['VKWebAppSetSwipeSettings',{history:!desired}],
      [desired?'VKWebAppDisableSwipeBack':'VKWebAppEnableSwipeBack',{}]];
    for(const [method,args] of commands){
      let timer;
      try{
        await Promise.race([(async()=>{
          if(await bridge.supportsAsync(method))await bridge.send(method,args);
        })(),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);
      }catch{}finally{clearTimeout(timer);}
    }
  });
}
