const launch = location.search;
const view = new URLSearchParams(launch).get('view') ||
  (location.pathname.endsWith('/mobile.html') ? 'mobile' :
    location.pathname.endsWith('/web.html') ? 'web' : 'auto');
const bridge = window.vkBridge;
if (bridge && (bridge.isEmbedded() || new URLSearchParams(launch).has('vk_app_id'))) {
  bridge.send('VKWebAppInit', {}).catch(() => {
    console.warn('ВКонтакте не подтвердил запуск.');
  });
  bridge.subscribe(event => {
    if (event.detail.type === 'VKWebAppViewHide' && typeof suspendGame === 'function') {
      suspendGame();
    }
  });
}
