import test from 'node:test';
import assert from 'node:assert/strict';
import {createBannerController} from './public/banner-ads.js';
function fixture(){
  const f={match:null,visible:true,area:{side:false,gap:300,width:390,height:700},calls:[],status:'',data:{result:true,banner_width:390,banner_height:100,banner_location:'bottom',layout_type:'overlay'}};
  const sdk={supportsAsync:async()=>true,subscribe:fn=>f.event=fn,send:async(method,args)=>{f.calls.push({method,args});return method==='VKWebAppShowBannerAd'?f.data:{result:true};}};
  f.sdk=sdk;f.controller=createBannerController({sdk,measure:()=>f.area,getMatch:()=>f.match,isVisible:()=>f.visible,onStatus:s=>f.status=s});
  f.controller.setMode('vk');return f;
}
test('banner only appears during match with space; compact does not send align',async()=>{
  const f=fixture();await f.controller.tick();assert.equal(f.calls.length,0);
  f.match={};f.area.gap=100;await f.controller.tick();assert.equal(f.calls.length,0);
  f.area.gap=300;await f.controller.tick();assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].args.height_type,'compact');assert.equal(f.calls[0].args.banner_align,undefined);
  await f.controller.tick();assert.equal(f.calls.length,1);
  f.match=null;await f.controller.tick();assert.equal(f.calls[1].method,'VKWebAppHideBannerAd');
});
test('desktop uses left vertical banner and rejects an oversized response',async()=>{
  const f=fixture();f.area={side:true,gap:280,width:1200,height:650};f.match={};
  f.data={...f.data,banner_align:'left',orientation:'vertical',banner_width:240,banner_height:400};
  await f.controller.tick();assert.equal(f.calls[0].args.banner_align,'left');assert.equal(f.calls[0].args.height_type,undefined);
  f.event({detail:{type:'VKWebAppBannerAdUpdated',data:{...f.data,banner_width:400}}});
  await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.at(-1).method,'VKWebAppHideBannerAd');
});
test('late show after menu exit is hidden; close by user stops further requests',async()=>{
  const f=fixture();let resolve;
  f.sdk.send=async(method,args)=>{f.calls.push({method,args});return method==='VKWebAppShowBannerAd'?new Promise(r=>resolve=r):{result:true};};
  f.match={};const pending=f.controller.tick();await new Promise(r=>setTimeout(r,0));
  f.match=null;resolve(f.data);await pending;assert.equal(f.calls.at(-1).method,'VKWebAppHideBannerAd');
  const g=fixture();g.match={};await g.controller.tick();g.event({detail:{type:'VKWebAppBannerAdClosedByUser'}});
  await g.controller.tick();assert.equal(g.calls.length,1);assert.equal(g.controller.getState().closed,true);
});
test('failure does not loop and preview never requests ads',async()=>{
  const f=fixture();f.sdk.send=async()=>{throw Error('no ad');};f.match={};await f.controller.tick();assert.equal(f.controller.getState().attempted,true);assert.match(f.status,/no ad/);
  const g=fixture();g.controller.setMode('preview');g.match={};await g.controller.tick();assert.equal(g.calls.length,0);
});
test('banner waits for VK initialization before checking support or showing',async()=>{
  let release;const ready=new Promise(r=>release=r);let calls=0;
  const controller=createBannerController({ready,sdk:{supportsAsync:async()=>{calls++;return true;},send:async()=>({result:false})},measure:()=>({gap:300,width:390,height:700}),getMatch:()=>1,isVisible:()=>true});
  controller.setMode('vk');await new Promise(r=>setTimeout(r,0));assert.equal(calls,0);
  release(true);await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
});
