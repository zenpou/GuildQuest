import { autoplay } from '../src/core/autoplay';
import { writeFileSync } from 'node:fs';
const results = [30,60].map(maxDays => {
 const states = Array.from({length:100},(_,i)=>autoplay(i+1,{maxDays}));
 return { maxDays, seeds:100, cleared:states.filter(s=>s.finalCleared).length, endInDebt:states.filter(s=>s.gold<0).length, averageDay:states.reduce((t,s)=>t+s.day,0)/100 };
});
writeFileSync('artifacts/campaign-balance.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
