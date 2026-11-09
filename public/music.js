// One AudioContext clock for every stem; only two short chunks are retained.
// A stage selects instruments, never their playing volume.
export function musicIntensity(game){
  if(!game)return 0;
  if(!game.solo)return 1;
  return Math.max(0,Math.min(1,(game.balls.length-1)/2));
}
export function stemLevels(roles,stage){
  return roles.map(role=>role==='drums'?1:role==='bass'?(stage>=.5?1:0):(stage>=1?1:0));
}
export function createMusicController({getContext,getState,baseURL,onStatus=()=>{},fetcher=fetch}){
  let unlocked=false,manifest,manifestWork,scene='',epoch=0,aborter,master,ctx,menu,menuNode;
  let trackIndex=-1,track,chunk=0,nextTime=0,busy=false,layers=[],nodes=new Set(),pending=null,lastMatch=null;
  let volume=-1,level=-1,sceneLoaded=false,failedScene='',autoplayBlocked=false;
  const url=p=>new URL(p,baseURL).href;
  function stop(){
    epoch++;aborter?.abort();aborter=new AbortController();busy=false;pending=null;sceneLoaded=false;autoplayBlocked=false;
    for(const source of nodes){try{source.stop();}catch{}source.disconnect();}nodes.clear();
    for(const gain of layers)gain.disconnect();layers=[];
    menu?.pause();if(menu){menu.removeAttribute('src');menu.load();}menuNode?.disconnect();menu=menuNode=null;
  }
  async function catalog(){
    if(!manifestWork)manifestWork=fetcher(url('manifest.json')).then(r=>{if(!r.ok)throw Error('music manifest');return r.json();}).then(m=>manifest=m).catch(e=>{manifestWork=null;throw e;});
    return manifestWork;
  }
  async function loadChunk(index,signal){
    const duration=Math.min(manifest.chunkSeconds,track.duration-index*manifest.chunkSeconds);
    const buffers=await Promise.all(track.roles.map(async role=>{
      const response=await fetcher(url(track.id+'/'+role+'-'+index+'.m4a'),{signal});
      if(!response.ok)throw Error('music chunk');
      return ctx.decodeAudioData(await response.arrayBuffer());
    }));
    if(buffers.some(b=>b.duration<duration-.06))throw Error('short music chunk');
    return {buffers,duration};
  }
  async function schedule(){
    if(busy||scene!=='match'||!track||failedScene===scene)return;
    if(nextTime>ctx.currentTime+manifest.chunkSeconds)return;
    busy=true;const token=epoch;
    try{
      const data=pending?await pending:await loadChunk(chunk,aborter.signal);
      if(token!==epoch)return;
      const when=Math.max(nextTime,ctx.currentTime+.08);
      data.buffers.forEach((buffer,i)=>{
        const source=ctx.createBufferSource(),edge=ctx.createGain();
        source.buffer=buffer;source.connect(edge);edge.connect(layers[i]);
        edge.gain.setValueAtTime(0,when);edge.gain.linearRampToValueAtTime(1,when+.004);
        edge.gain.setValueAtTime(1,when+data.duration-.004);edge.gain.linearRampToValueAtTime(0,when+data.duration);
        source.start(when,0,data.duration);nodes.add(source);
        source.onended=()=>{nodes.delete(source);source.disconnect();edge.disconnect();};
      });
      nextTime=when+data.duration;chunk=(chunk+1)%track.chunks;sceneLoaded=true;
      pending=loadChunk(chunk,aborter.signal);pending.catch(()=>{});
      onStatus('');
    }catch(e){if(token===epoch && e.name!=='AbortError'){failedScene=scene;onStatus('Музыка недоступна. Выключи и включи её для повтора.');}}
    finally{if(token===epoch)busy=false;}
  }
  async function enter(next){
    stop();scene=next;failedScene='';level=-1;volume=-1;track=null;
    if(!next)return;
    const token=epoch;
    try{
      const m=await catalog();if(token!==epoch)return;
      if(next==='menu'){
        menu=new Audio();menu.preload='auto';menu.loop=true;menu.src=url(m.menu);
        menuNode=ctx.createMediaElementSource(menu);menuNode.connect(master);
        await menu.play();if(token!==epoch)return;sceneLoaded=true;onStatus('');
      }else{
        if(!m.tracks.length)throw Error('no tracks');
        track=m.tracks[(trackIndex+m.tracks.length)%m.tracks.length];
        layers=track.roles.map(()=>{const g=ctx.createGain();g.gain.value=0;g.connect(master);return g;});
        chunk=0;nextTime=0;await schedule();
      }
    }catch(e){if(token===epoch && e.name==='NotAllowedError'){autoplayBlocked=true;return;}if(token===epoch && e.name!=='AbortError'){failedScene=next;onStatus('Музыка недоступна. Выключи и включи её для повтора.');}}
  }
  function tick(){
    if(!unlocked||!ctx)return;
    const s=getState(),match=Boolean(s.game);
    // Do not use object identity: peer snapshots replace the game object repeatedly.
    if(match && lastMatch!==true)trackIndex++;lastMatch=match;
    const desired=s.enabled&&!s.hidden?(match?'match':'menu'):'';
    if(desired!==scene)void enter(desired);
    if(!desired)return;
    const nextVolume=Math.max(0,Math.min(1,s.volume))*.35;
    if(nextVolume!==volume){volume=nextVolume;master.gain.setTargetAtTime(volume,ctx.currentTime,.25);}
    if(scene==='match' && track){
      const intensity=musicIntensity(s.game);
      if(intensity!==level || !sceneLoaded){level=intensity;stemLevels(track.roles,level).forEach((v,i)=>layers[i].gain.setTargetAtTime(v,ctx.currentTime,.12));}
      void schedule();
    }
  }
  function unlock(){
    const s=getState();if(!s.enabled)return;
    ctx=getContext();if(!ctx)return;
    if(!master){master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);}
    unlocked=true;if(ctx.state!=='running')void ctx.resume().catch(()=>{});
    if(autoplayBlocked && menu && scene==='menu'){
      const token=epoch;autoplayBlocked=false;
      void menu.play().then(()=>{if(token===epoch){sceneLoaded=true;onStatus('');}}).catch(()=>{if(token===epoch)autoplayBlocked=true;});
    }
    tick();
  }
  const timer=setInterval(tick,200);
  return {unlock,tick,stop:()=>{stop();scene='';},dispose:()=>{clearInterval(timer);stop();master?.disconnect();},
    inspect:()=>({scene,track:track?.id,level,gains:layers.map(layer=>layer.gain.value),loaded:sceneLoaded,sources:nodes.size,failed:failedScene})};
}
