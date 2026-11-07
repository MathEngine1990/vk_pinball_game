export const cosmetics = [
  {id:'amber',name:'Янтарь',price:0,color:'#ffbb71',shade:'#db6837'},
  {id:'ice',name:'Северное сияние',price:300,color:'#8bcfff',shade:'#4468d5'},
  {id:'rose',name:'Неоновая роза',price:600,color:'#ffa7d6',shade:'#b34b94'},
  {id:'gold',name:'Солнечный металл',price:1200,color:'#ffe99b',shade:'#a98532'}
];
export function ratingDelta(rating,opponent,won){
  return Math.round(32*((won?1:0)-1/(1+10**((opponent-rating)/400))));
}
export function levelProgress(total){
  let xp=Math.max(0,Number.isFinite(total)?total:0),level=1,cost=70;
  while(xp>=cost){xp-=cost;level++;cost=70+18*(level-1)+2*(level-1)**2;}
  return {level,xp,cost,remaining:cost-xp};
}
