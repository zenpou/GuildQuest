import { newGame } from '../src/core/game';
import { simulateExpedition } from '../src/core/expedition';
import { rngFor } from '../src/core/rng';

const s = newGame(1);
const by = (k: string) => s.adventurers.find((a) => a.id === `c_${k}`)!;
const combos: Record<string, string[]> = {
  '全員(4人)': ['aldo', 'mina', 'lina', 'bruno'],
  'ミナ+リナ': ['mina', 'lina'],
  'ミナ+ブルーノ': ['mina', 'bruno'],
  'ミナ+アルド(剣士のまま)': ['aldo', 'mina'],
  'アルド+リナ+ブルーノ(ミナなし)': ['aldo', 'lina', 'bruno'],
};
for (const q of ['q_herb', 'q_goblin', 'q_patrol']) {
  const row: string[] = [];
  for (const [name, keys] of Object.entries(combos)) {
    let ok = 0, inj = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const members = keys.map((k) => structuredClone(by(k)));
      const r = simulateExpedition({ rng: rngFor(i, q), questId: q, members, leaderId: members[0].id, policy: 'standard', potions: 0, relations: s.relations, startDay: 1, expMult: 1, clinicLevel: 0 });
      if (r.success) ok++;
      inj += Object.keys(r.injuries).length;
    }
    row.push(`${name}:${Math.round((ok / N) * 100)}%/傷${(inj / N).toFixed(1)}`);
  }
  console.log(q, row.join('  '));
}
console.log(s.adventurers.map((a) => `${a.name}(日給${a.salary})`).join(' '));
