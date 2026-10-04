import { writeFileSync, mkdirSync } from 'node:fs';
import { autoplay } from '../src/core/autoplay';
import { ENEMY } from '../src/core/data';
import { newGame, partyPower } from '../src/core/game';
import { simulateExpedition } from '../src/core/expedition';
import { rngFor } from '../src/core/rng';

const dragon = ENEMY.drake;
const current = { hp: dragon.hp, atk: dragon.atk, mult: dragon.skill!.mult };
const baseline = { hp: 1150, atk: 48, mult: 0.8 };
const apply = (config: typeof current) => { dragon.hp = config.hp; dragon.atk = config.atk; dragon.skill!.mult = config.mult; };
const sample = (config: typeof current) => {
  apply(config);
  const runs = Array.from({ length: 100 }, (_, i) => {
    const state = autoplay(i + 1, { maxDays: 30 });
    return { seed: i + 1, day: state.day, cleared: state.finalCleared && state.day <= 30, gold: state.gold,
      rep: state.rep, attempts: state.history.filter(r => r.questId === 'q_drake').map(r => ({ startDay: r.startDay, returnDay: r.returnDay, success: r.success, retreated: r.retreated, wiped: r.wiped })) };
  });
  const wins = runs.filter(r => r.cleared);
  return { config, seeds: 100, cleared: wins.length, averageClearDay: Number((wins.reduce((sum, r) => sum + r.day, 0) / wins.length).toFixed(2)),
    endInDebt: runs.filter(r => r.gold < 0).length, averageGold: Math.round(runs.reduce((sum, r) => sum + r.gold, 0) / runs.length), runs };
};

try {
  const before = sample(baseline);
  const after = sample(current);
  const preparation = [3, 5, 7, 9].flatMap(level => [0, 3, 6].map(potions => {
    const members = newGame(1).adventurers;
    for (const a of members) { a.level = level; if (a.id === 'c_aldo') a.job = 'ranger'; }
    let cleared = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const r = simulateExpedition({ rng: rngFor(seed, 'fixed-drake'), questId: 'q_drake', members, leaderId: 'c_bruno',
        policy: 'standard', potions, relations: {}, startDay: 24, expMult: 1, clinicLevel: 0 });
      if (r.success) cleared++;
    }
    return { level, power: partyPower(members), potions, cleared, seeds: 100 };
  }));
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/review-balance.json', JSON.stringify({ note: 'Both configurations use the same corrected <=30 return deadline, same bot and seeds 1..100. Enemy overrides are process-local only.', before, after, preparation }, null, 2));
  const summary = ({ runs: _, ...s }: typeof before) => s;
  console.log(JSON.stringify({ before: summary(before), after: summary(after), preparation }, null, 2));
} finally { apply(current); }
