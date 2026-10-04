import { bestJob, generateAdventurer } from '../src/core/adventurer';
import { partyPower } from '../src/core/game';
import { QUESTS } from '../src/core/data';
import { simulateExpedition } from '../src/core/expedition';
import { Rng, rngFor } from '../src/core/rng';

const policy = process.argv[2] ?? 'standard';
const potions = Number(process.argv[3] ?? 0);
const N = 150;
console.log(`policy=${policy} potions=${potions}`);
for (const q of QUESTS) {
  const row: string[] = [];
  for (const lv of [1, 3, 5, 7, 9]) {
    let ok = 0, wipe = 0, ret = 0, inj = 0, pw = 0;
    for (let i = 0; i < N; i++) {
      const rng = new Rng(i * 7919 + lv);
      const members = Array.from({ length: 4 }, (_, k) => {
        const a = generateAdventurer(rng, { id: `x${k}`, level: lv, quality: 0.2, mismatch: 0 });
        a.job = bestJob(a);
        return a;
      });
      pw += partyPower(members);
      const r = simulateExpedition({
        rng: rngFor(i, 'b', q.id), questId: q.id, members, leaderId: members[0].id, policy, potions,
        relations: {}, startDay: 1, expMult: 1, clinicLevel: 0,
      });
      if (r.success) ok++;
      if (r.wiped) wipe++;
      if (r.retreated) ret++;
      inj += Object.keys(r.injuries).length;
    }
    row.push(`Lv${lv}(P${Math.round(pw / N)}):${Math.round((ok / N) * 100)}%/退${Math.round((ret / N) * 100)}/全${Math.round((wipe / N) * 100)}/傷${(inj / N).toFixed(1)}`);
  }
  console.log(q.name.padEnd(10, '　'), row.join('  '));
}
