// VK Storage is for solo progress, not authoritative currency or ranked results.
export function cleanSoloProfile(value){
  if(!value || !['wave','xp','shards'].every(key=>Number.isSafeInteger(value[key]) && value[key]>=0 && value[key]<=1e9) || value.wave<1)return null;
  const owned=['amber',...['ice','rose','gold'].filter(id=>Array.isArray(value.owned) && value.owned.includes(id))];
  return {wave:value.wave,xp:value.xp,shards:value.shards,mmr:1000,owned,skin:owned.includes(value.skin)?value.skin:'amber'};
}
export function createSoloStore({storage,bridge,account='',onStatus=()=>{},timeoutMs=4500,makeId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')}){
  const cloudKey='rikoshet_solo_v2';
  const key=account?'rikoshet-vk-'+account:'rikoshet-local-v1';
  const fresh=()=>({wave:1,xp:0,shards:0,mmr:1000,owned:['amber'],skin:'amber'});
  let state={profile:fresh(),base:null,pending:null,dirty:false},localOK=true,conflict=null,busy=null;
  let cloudKnown=false;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const readLocal=name=>{try{return JSON.parse(storage.getItem(name));}catch{return null;}};
  const cached=readLocal(key);
  if(account && cleanSoloProfile(cached?.profile))state={profile:cleanSoloProfile(cached.profile),base:typeof cached.base==='string'?cached.base:null,pending:typeof cached.pending==='string'?cached.pending:null,dirty:cached.dirty===true};
  else if(!account && cleanSoloProfile(cached))state.profile=cleanSoloProfile(cached);
  function persist(){try{storage.setItem(key,JSON.stringify(account?state:state.profile));localOK=true;}catch{localOK=false;}return localOK;}
  function status(kind){onStatus({kind,localOK,cloud:Boolean(account),dirty:state.dirty,conflict:conflict?clone(conflict.profile):null,
    canImport:Boolean(account && cloudKnown && !state.base && !state.dirty && cleanSoloProfile(readLocal('rikoshet-local-v1'))),profile:clone(state.profile)});}
  async function call(method,args){
    let timer;
    try{return await Promise.race([Promise.resolve().then(()=>bridge.send(method,args)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);}
    finally{clearTimeout(timer);}
  }
  async function remote(){
    const result=await call('VKWebAppStorageGet',{keys:[cloudKey]});
    if(!Array.isArray(result?.keys))throw Error('invalid response');
    const value=result.keys.find(item=>item.key===cloudKey)?.value;
    if(value===undefined)throw Error('missing key');
    if(value==='')return {profile:fresh(),revision:null};
    const data=JSON.parse(value),profile=cleanSoloProfile(data?.profile);
    if(data?.v!==1 || typeof data.revision!=='string' || !data.revision || !profile)throw Error('invalid save');
    return {profile,revision:data.revision};
  }
  function sync(){
    if(!account){persist();status('local');return Promise.resolve(clone(state.profile));}
    if(busy)return busy;
    busy=(async()=>{
      status('syncing');
      try{
        let latest=await remote();cloudKnown=true;
        if(state.dirty && latest.revision===state.pending){state.base=latest.revision;state.dirty=false;state.pending=null;}
        if(state.dirty && latest.revision!==state.base){conflict=latest;persist();status('conflict');return clone(state.profile);}
        if(!state.dirty){state.profile=latest.profile;state.base=latest.revision;conflict=null;persist();status('saved');return clone(state.profile);}
        const revision=state.pending,profile=clone(state.profile);
        const result=await call('VKWebAppStorageSet',{key:cloudKey,value:JSON.stringify({v:1,revision,profile})});
        if(result?.result!==true)throw Error('save rejected');
        // Do not mark newer local changes as synchronized with an older write.
        state.base=revision;
        if(state.pending===revision){state.dirty=false;state.pending=null;}
        conflict=null;persist();status(state.dirty?'pending':'saved');
      }catch{persist();status('unavailable');}
      return clone(state.profile);
    })().finally(()=>{busy=null;});
    return busy;
  }
  function save(profile){
    const clean=cleanSoloProfile(profile);if(!clean)throw Error('invalid profile');
    state.profile=clean;
    if(account){state.dirty=true;state.pending=makeId();}
    persist();status(account?'pending':'local');
    // Callers sync at safe menu boundaries; gameplay never waits for a network call.
    return localOK;
  }
  async function resolve(choice){
    if(busy)await busy;
    if(!conflict)return sync();
    // Both choices retain an on-device recovery copy of the version being replaced.
    try{storage.setItem(key+'-recovery',JSON.stringify({local:state,remote:conflict}));}catch{status('unavailable');return clone(state.profile);}
    if(choice==='cloud'){state={profile:clone(conflict.profile),base:conflict.revision,pending:null,dirty:false};conflict=null;persist();status('saved');return clone(state.profile);}
    if(choice==='local'){state.base=conflict.revision;conflict=null;return sync();}
    return clone(state.profile);
  }
  async function importLocal(){
    if(busy)await busy;
    const old=cleanSoloProfile(readLocal('rikoshet-local-v1'));
    if(!account || !cloudKnown || state.base || state.dirty || !old)return clone(state.profile);
    save(old);return sync();
  }
  return {load:sync,sync,save,resolve,importLocal,get:()=>clone(state.profile)};
}
