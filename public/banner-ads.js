// A banner belongs to the platform. Never resize the playfield to accommodate it.
export function createBannerController({sdk,measure,getMatch,isVisible,onStatus=()=>{},ready=Promise.resolve(true)}){
  let mode='off',match=null,attempted=false,closed=false,shown=false,busy=false,dimensions=null;
  let failures=0,lastHide=0,lastStatus='';
  const status=text=>{if(text!==lastStatus){lastStatus=text;onStatus(text);}};
  const fits=d=>{const r=measure();return d?.result===true && d.banner_location==='bottom' && d.layout_type==='overlay' &&
    Number.isFinite(d.banner_height) && d.banner_height>0 && Number.isFinite(d.banner_width) && d.banner_width>0 &&
    (r.side?d.banner_align==='left' && d.orientation==='vertical' && d.banner_width+24<=r.gap && d.banner_height<=r.height:
    d.banner_height+24<=r.gap && d.banner_width<=r.width+1);};
  async function hide(){
    if(!shown || busy || failures>=3 || Date.now()-lastHide<1500)return;
    busy=true;lastHide=Date.now();
    try{const result=await sdk.send('VKWebAppHideBannerAd');if(result?.result!==true)throw Error('hide not confirmed');shown=false;dimensions=null;failures=0;}
    catch{failures++;status('VK не подтвердил скрытие баннера. Если он остался, закрой его кнопкой VK.');}
    finally{busy=false;}
  }
  async function tick(){
    const current=getMatch();
    if(current!==match){match=current;attempted=false;closed=false;}
    const eligible=mode==='vk' && Boolean(match) && isVisible() && !closed;
    if(shown && (!eligible || !fits(dimensions))){await hide();return;}
    if(busy || shown)return;
    if(mode!=='vk')return;
    if(!match){status('Баннер выключен в меню.');return;}
    if(closed){status('Баннер закрыт до следующего матча.');return;}
    if(!isVisible())return;
    const area=measure();
    if(area.gap<(area.side?200:180)){status('Недостаточно свободного места для баннера. Поле не уменьшаем.');return;}
    if(attempted)return;
    attempted=true;busy=true;const requestedMatch=match;
    status('Запрашиваем баннер VK '+(area.side?'слева':'снизу')+'…');
    const timer=setTimeout(()=>status('VK пока не ответил. Игра доступна; повторный запрос не отправляем.'),8000);
    try{
      if(!await ready){status('VKWebAppInit не подтверждён. Закрой и заново открой игру внутри VK.');return;}
      if(!sdk || !await sdk.supportsAsync('VKWebAppShowBannerAd')){status('Показ баннера недоступен в этом клиенте. Открой игру внутри VK.');return;}
      // No banner_align: it would disable compact height in mobile landscape.
      const options=area.side?{banner_location:'bottom',layout_type:'overlay',banner_align:'left',orientation:'vertical'}:
        {banner_location:'bottom',layout_type:'overlay',height_type:'compact',orientation:'horizontal'};
      const data=await sdk.send('VKWebAppShowBannerAd',options);
      shown=data?.result===true;dimensions=data;
      if(!shown){status('VK не предоставил рекламу. Игра продолжается без баннера.');return;}
      status(fits(data)?'VK: баннер '+data.banner_width+' × '+data.banner_height+' пикс.':'VK вернул '+data?.banner_width+' × '+data?.banner_height+', '+data?.layout_type+', '+data?.banner_location+'. Не подходит свободной зоне '+Math.floor(measure().gap)+' пикс. — скрываем.');
      if(requestedMatch!==getMatch() || mode!=='vk' || !isVisible() || !fits(data)){
        busy=false;await hide();
      }
    }catch(error){const reason=String(error?.error_data?.error_reason || error?.message || '').slice(0,240);status('Ошибка показа'+(Number.isFinite(error?.error_data?.error_code)?' · код VK '+error.error_data.error_code:'')+(reason?' · '+reason:'')+'.');}
    finally{clearTimeout(timer);busy=false;}
  }
  function event(event){
    const detail=event?.detail;if(!detail)return;
    if(detail.type==='VKWebAppBannerAdClosedByUser'){closed=true;shown=false;dimensions=null;status('Баннер закрыт до следующего матча.');}
    if(detail.type==='VKWebAppBannerAdUpdated' && shown){dimensions=detail.data;void tick();}
  }
  sdk?.subscribe?.(event);
  return {tick,setMode(value){mode=value;attempted=false;failures=0;lastHide=0;void tick();},getState:()=>({shown,busy,closed,attempted})};
}
