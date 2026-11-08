export const bumpers = [[310,310],[690,310],[310,690],[690,690]];
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
export function waveRules(wave) {
  const number = Number.isSafeInteger(wave) && wave > 0 ? wave : 1;
  const tier = Math.floor((number - 1) / 6);
  const types = [
    {name: number === 1 ? 'Первый рикошет' : 'Классика', description: 'Четыре бампера. Новые шары через 35 и 70 секунд.', ballsAt: [35,70], layout: bumpers},
    {name: 'Перекрёстный огонь', description: 'Бамперы ромбом меняют углы атаки. Шары через 30 и 60 секунд.', ballsAt: [30,60], layout: [[500,270],[730,500],[500,730],[270,500]]},
    {name: 'Мультибол', description: 'Второй шар уже через 20 секунд, третий через 40. Следи за всеми воротами.', ballsAt: [20,40], layout: bumpers},
    {name: 'Узкий проход', description: 'Две пары бамперов оставляют коридор в центре. Шары через 30 и 65 секунд.', ballsAt: [30,65], layout: [[370,310],[630,310],[370,690],[630,690]]},
    {name: 'Шесть рикошетов', description: 'Шесть бамперов вокруг центра. Ищи свободный угол. Шары через 35 и 70 секунд.', ballsAt: [35,70], layout: [[350,260],[650,260],[250,500],[750,500],[350,740],[650,740]]},
    {name: 'Диагональ', description: 'Смещённые бамперы открывают диагональные атаки. Шары через 25 и 50 секунд.', ballsAt: [25,50], layout: [[300,300],[650,350],[350,650],[700,700]]}
  ];
  const type = types[(number - 1) % types.length];
  return {
    name: type.name,
    description: type.description,
    cycle: tier + 1,
    duration: 150,
    speed: Math.min(480, 360 + tier * 12),
    botSpeed: Math.min(480, 228 + (number - 1) * 6),
    botError: Math.max(24, 64 - (number - 1) * 1.25),
    botReaction: Math.max(0.1, 0.22 - (number - 1) * 0.004),
    ballsAt: [...type.ballsAt],
    bumpers: type.layout.map(point => [...point])
  };
}
function serve(speed=360) {
  // Avoid nearly horizontal or vertical serves that repeatedly skim a wall.
  const angle = (Math.floor(Math.random()*4)+0.2+Math.random()*0.6)*Math.PI/2;
  return {x:500,y:500,vx:speed*Math.cos(angle),vy:speed*Math.sin(angle)};
}
export function arena(solo, wave=1, difficulty='normal') {
  const rules = solo ? waveRules(wave) : null;
  difficulty=['easy','normal','hard'].includes(difficulty)?difficulty:'normal';
  if(rules){
    const factor=difficulty==='easy'?.75:difficulty==='hard'?1.2:1;
    rules.botSpeed*=factor;rules.botError/=factor;rules.botReaction/=factor;
  }
  return {solo,wave,rules,difficulty,t:0,paused:false,energy:50,magnetUntil:0,playerGoals:0,goalCount:0,lastGoal:null,balls:[serve(rules?.speed)],hp:[8,8,8,8],score:[0,0],winner:null,
    pads:Array.from({length:solo?4:2},()=>({x:500,target:500,hit:-10,perfect:0,nextThink:0}))};
}
export function activateMagnet(g){
  if(!g.solo || g.paused || g.winner!==null || g.energy<100 || g.magnetUntil>g.t || g.balls.some(b=>b.heldUntil>g.t))return false;
  g.energy-=100;g.magnetUntil=g.t+4;return true;
}
export function input(g,i,x,hit) {
  if(g.paused || g.winner!==null) return;
  const p=g.pads[i];
  if(Number.isFinite(x)) p.target=clamp(x,75,925);
  if(hit && g.t-p.hit>=0.8) p.hit=g.t;
}
function wall(g,b,i) {
  const vertical=i>=2, low=i===1||i===2;
  const axis=vertical?'x':'y', vel=vertical?'vx':'vy', along=vertical?'y':'x';
  const inward=low?1:-1;
  if(b[vel]*inward>=0) return;
  const depth=low?b[axis]:1000-b[axis], p=g.pads[i];
  const active=p && (!g.solo || g.hp[i]>0);
  if(active && depth<=48 && depth>=30 && Math.abs(b[along]-p.x)<=89) {
    b.lastTouch=i;
    if(g.solo && i===0 && g.magnetUntil>g.t){
      g.magnetUntil=0;b.heldUntil=g.t+1;b.vx=0;b.vy=0;b.x=p.x;b.y=934;return;
    }
    const angle=clamp((b[along]-p.x)/85,-1,1)*1.02;
    const perfect=g.t-p.hit<0.17;
    const speed=g.solo
      ? Math.min(740,Math.hypot(b.vx,b.vy)+(perfect?160:12))
      : Math.min(1080,Math.max(360,b.minSpeed||360,Math.hypot(b.vx,b.vy))+(perfect?160:36));
    if(!g.solo)b.minSpeed=speed;
    if(perfect) {p.perfect++;b.powerUntil=g.t+0.5;}
    if(g.solo && i===0)g.energy=Math.min(100,g.energy+(perfect?25:5));
    b[vel]=inward*Math.cos(angle)*speed;
    b[vertical?'vy':'vx']=Math.sin(angle)*speed;
  } else if(depth<=14) {
    if(active && Math.abs(b[along]-500)<190) {
      if(g.solo) g.hp[i]--; else g.score[1-i]++;
      if(g.solo && i!==0 && b.lastTouch===0)g.playerGoals++;
      g.goalCount=(g.goalCount || 0)+1;
      g.lastGoal={side:i,t:g.t};
      Object.assign(b,serve(g.rules?.speed),{powerUntil:0,lastTouch:null,heldUntil:0},g.solo?{}:{minSpeed:360});
    } else { b[vel]*=-1; b[axis]=low?14:986; }
  }
}
export function step(g,dt) {
  if(g.winner!==null || g.paused) return;
  // Faster duel rallies use smaller steps to retain the paddle collision window.
  if(!g.solo && dt>1/120){
    const slices=Math.ceil(dt*120);
    for(let n=0;n<slices && g.winner===null;n++)step(g,dt/slices);
    return;
  }
  g.t+=dt;
  const rules=g.rules;
  const additions=(rules?.ballsAt || [35,70]).filter(time=>g.t>=time).length;
  if(g.solo && g.balls.length<1+additions) g.balls.push(serve(rules?.speed));
  g.pads.forEach((p,i)=>{
    const bot=g.solo && i>0;
    if(bot && g.t >= (p.nextThink || 0)) {
      const depth=b=>i===1?b.y:i===2?b.x:1000-b.x;
      const approaching=g.balls.filter(b=>i===1?b.vy<0:i===2?b.vx<0:b.vx>0);
      const candidates=approaching.length?approaching:g.balls;
      const b=candidates.reduce((a,b)=>depth(a)<depth(b)?a:b);
      p.target=clamp((i===1?b.x:b.y)+Math.sin(g.t*2+i)*(rules?.botError || 55),75,925);
      p.nextThink=g.t+(rules?.botReaction || .18);
    }
    const limit=dt*(bot?(rules?.botSpeed || Math.min(680,210+g.wave*18)):1000);
    p.x+=clamp(p.target-p.x,-limit,limit);
  });
  for(const b of g.balls) {
    if(!g.solo){
      const speed=Math.hypot(b.vx,b.vy),floor=clamp(b.minSpeed||360,360,1080);
      const next=clamp(speed,floor,1080);
      if(speed>0){b.vx*=next/speed;b.vy*=next/speed;}
      else b.vy=-floor;
    }
    if(b.heldUntil){
      b.x=g.pads[0].x;b.y=934;
      if(g.t<b.heldUntil)continue;
      b.heldUntil=0;b.vx=0;b.vy=-(rules?.speed || 360);b.lastTouch=0;
    }
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    for(const [x,y] of rules?.bumpers || bumpers) {
      const dx=b.x-x, dy=b.y-y, d=Math.hypot(dx,dy);
      if(d>=59 || d===0) continue;
      const nx=dx/d,ny=dy/d,dot=b.vx*nx+b.vy*ny;
      b.x=x+59*nx; b.y=y+59*ny;
      if(dot<0){b.vx-=2*dot*nx;b.vy-=2*dot*ny;}
    }
    for(let i=0;i<4;i++) wall(g,b,i);
  }
  for(let i=0;i<g.balls.length;i++)for(const other of g.balls.slice(i+1)){
    const b=g.balls[i],dx=other.x-b.x,dy=other.y-b.y,d=Math.hypot(dx,dy);
    if(b.heldUntil>g.t || other.heldUntil>g.t)continue;
    if(d===0 || d>=28)continue;
    const nx=dx/d,ny=dy/d,overlap=(28-d)/2;
    b.x-=nx*overlap;b.y-=ny*overlap;other.x+=nx*overlap;other.y+=ny*overlap;
    const relative=(b.vx-other.vx)*nx+(b.vy-other.vy)*ny;
    if(relative>0){
      b.vx-=relative*nx;b.vy-=relative*ny;other.vx+=relative*nx;other.vy+=relative*ny;
      for(const ball of [b,other]){
        const scale=Math.min(1,740/Math.hypot(ball.vx,ball.vy));ball.vx*=scale;ball.vy*=scale;
      }
    }
  }
  if(g.solo) {
    if(g.hp[0]<=0 || g.hp.slice(1).every(h=>h<=0) || g.t>=(rules?.duration || 150))
      g.winner=g.hp[0]>0 && g.hp[0]>=Math.max(...g.hp.slice(1))?0:1;
  } else if(Math.max(...g.score)>=(g.scoreLimit || 7) || (!g.scoreLimit && g.t>=120 && g.score[0]!==g.score[1]))
    g.winner=g.score[0]>g.score[1]?0:1;
}

export function rewards(game, seat) {
  const won = game.winner === seat;
  const factor = game.solo ? 0.7 : 1;
  const bonus = Math.min(10, game.pads[seat].perfect);
  return {
    xp: Math.floor((35 + (won ? 20 : 0) + bonus) * factor),
    shards: game.solo ? 20+(won?10:0)+Math.min(5,Math.floor(game.pads[seat].perfect/2)) : Math.floor((20 + (won ? 10 : 0) + bonus) * factor),
    wave: Number(game.solo && won),
    mmr: game.solo ? 0 : won ? 16 : -16
  };
}
