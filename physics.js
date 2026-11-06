export const bumpers = [[310,310],[690,310],[310,690],[690,690]];
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
function serve() {
  const angle = Math.random()*Math.PI*2;
  return {x:500,y:500,vx:360*Math.cos(angle),vy:360*Math.sin(angle)};
}
export function arena(solo, wave=1) {
  return {solo,wave,t:0,balls:[serve()],hp:[8,8,8,8],score:[0,0],winner:null,
    pads:Array.from({length:solo?4:2},()=>({x:500,target:500,hit:-10,perfect:0}))};
}
export function input(g,i,x,hit) {
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
    const angle=clamp((b[along]-p.x)/85,-1,1)*1.02;
    const perfect=g.t-p.hit<0.17;
    const speed=Math.min(740,Math.hypot(b.vx,b.vy)+(perfect?160:12));
    if(perfect) p.perfect++;
    b[vel]=inward*Math.cos(angle)*speed;
    b[vertical?'vy':'vx']=Math.sin(angle)*speed;
  } else if(depth<=14) {
    if(active && Math.abs(b[along]-500)<190) {
      if(g.solo) g.hp[i]--; else g.score[1-i]++;
      Object.assign(b,serve());
    } else { b[vel]*=-1; b[axis]=low?14:986; }
  }
}
export function step(g,dt) {
  if(g.winner!==null) return;
  g.t+=dt;
  if(g.solo && g.balls.length<1+Math.min(2,Math.floor(g.t/35))) g.balls.push(serve());
  g.pads.forEach((p,i)=>{
    const bot=g.solo && i>0;
    if(bot) {
      const depth=b=>i===1?b.y:i===2?b.x:1000-b.x;
      const b=g.balls.reduce((a,b)=>depth(a)<depth(b)?a:b);
      p.target=clamp((i===1?b.x:b.y)+Math.sin(g.t*2+i)*55,75,925);
    }
    const limit=dt*(bot?Math.min(680,210+g.wave*18):1000);
    p.x+=clamp(p.target-p.x,-limit,limit);
  });
  for(const b of g.balls) {
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    for(const [x,y] of bumpers) {
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
    if(g.hp[0]<=0 || g.hp.slice(1).every(h=>h<=0) || g.t>=150)
      g.winner=g.hp[0]>0 && g.hp[0]>=Math.max(...g.hp.slice(1))?0:1;
  } else if(Math.max(...g.score)>=7 || (g.t>=120 && g.score[0]!==g.score[1]))
    g.winner=g.score[0]>g.score[1]?0:1;
}
