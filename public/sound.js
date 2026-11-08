export function createSoundController({getContext,baseURL,getVolume=()=>1,fetcher=fetch}){
  const names=['click','bounce','perfect-hit','goal-win','goal-lose','magnet-catch'];
  const buffers=new Map(),voices=new Set(),last=new Map();let loading=null,ctx,master;
  async function preload(){
    ctx=getContext();if(!ctx||loading)return loading;
    if(!master){master=ctx.createGain();master.connect(ctx.destination);}updateVolume();
    loading=Promise.all(names.filter(n=>!buffers.has(n)).map(async name=>{
      try{const r=await fetcher(new URL(name+'.wav',baseURL));if(!r.ok)return;const b=await ctx.decodeAudioData(await r.arrayBuffer());buffers.set(name,b);}catch{}
    })).finally(()=>{loading=null;});return loading;
  }
  function play(kind,heat=0){
    const name=({perfect:'perfect-hit',magnet:'magnet-catch'})[kind]||kind;
    const buffer=buffers.get(name);if(!buffer||ctx?.state!=='running')return false;
    const now=ctx.currentTime,cooldown=name==='bounce'?.055:name==='click'?.06:.15;
    if(now-(last.get(name)??-10)<cooldown)return true;last.set(name,now);
    if(voices.size>=10){const oldest=voices.values().next().value;oldest.stop();voices.delete(oldest);}
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;
    source.playbackRate.value=name==='bounce'?1+.45*Math.max(0,Math.min(1,heat)):1;
    gain.gain.value=({click:.18,bounce:.24,'perfect-hit':.4,'goal-win':.5,'goal-lose':.5,'magnet-catch':.4})[name]||.3;
    source.connect(gain);gain.connect(master);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};source.start();return true;
  }
  function updateVolume(){if(master)master.gain.setTargetAtTime(Math.max(0,Math.min(1,getVolume())),ctx.currentTime,.03);}
  function stop(){for(const source of voices){try{source.stop();}catch{}}voices.clear();}
  return {preload,play,stop,updateVolume,inspect:()=>({loaded:[...buffers.keys()],voices:voices.size,volume:getVolume()})};
}
