import { autoplay } from '../src/core/autoplay';

const verbose = process.argv.includes('-v');
const n = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 20);
let cleared = 0, goldSum = 0, repSum = 0, daySum = 0, quits = 0, debtDays = 0;
for (let seed = 1; seed <= n; seed++) {
  const s = autoplay(seed, { verbose: verbose && seed === 1 });
  if (s.finalCleared) cleared++;
  goldSum += s.gold; repSum += s.rep; daySum += s.day;
  debtDays += s.debt ? 1 : 0;
  quits += 8 - s.adventurers.length;
}
console.log(`seeds=${n} clear=${cleared}/${n} avgGold=${Math.round(goldSum / n)} avgRep=${Math.round(repSum / n)} avgDay=${(daySum / n).toFixed(1)} endInDebt=${debtDays}`);
