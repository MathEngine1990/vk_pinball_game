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
