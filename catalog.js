export const cosmetics = [
  {id:'amber',name:'Янтарь',price:0,color:'#ffbb71',shade:'#db6837'},
  {id:'ice',name:'Северное сияние',price:300,color:'#8bcfff',shade:'#4468d5'},
  {id:'rose',name:'Неоновая роза',price:600,color:'#ffa7d6',shade:'#b34b94'},
  {id:'gold',name:'Солнечный металл',price:1200,color:'#ffe99b',shade:'#a98532'}
];
export function ratingDelta(rating,opponent,won){
  return Math.round(32*((won?1:0)-1/(1+10**((opponent-rating)/400))));
}
