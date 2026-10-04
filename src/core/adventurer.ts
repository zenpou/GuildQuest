import { JOB, JOBS, NAMES, PERSONALITIES, TRAIT, TRAITS } from './data';
import type { Rng } from './rng';
import { STAT_KEYS, type Adventurer, type Stats, type TraitDef } from './types';

const LEVEL_GAIN: Stats = { hp: 8, atk: 1.2, def: 1.0, mag: 1.2, spd: 0.8, dex: 0.8, scout: 0.8, gather: 0.8 };
const COMBAT_STATS = ['atk', 'def', 'mag', 'spd'] as const;

export function expToNext(level: number): number {
  return 40 * level;
}

/** 適性値(0-100) → 戦闘能力係数 0.65〜1.35 */
export function aptFactor(apt: number): number {
  return 0.65 + 0.7 * (apt / 100);
}

export function rankOf(v: number): string {
  return v >= 90 ? 'S' : v >= 75 ? 'A' : v >= 60 ? 'B' : v >= 45 ? 'C' : v >= 30 ? 'D' : 'E';
}
export function growthRank(g: number): string {
  return g >= 1.35 ? 'S' : g >= 1.2 ? 'A' : g >= 1.0 ? 'B' : g >= 0.85 ? 'C' : 'D';
}

export function traitDefs(a: Adventurer): TraitDef[] {
  return a.traits.map((t) => TRAIT[t.id]);
}
export function traitNum(a: Adventurer, key: 'luck' | 'lostBias' | 'fatigueRate' | 'expRate' | 'salaryMult', def = 0): number {
  let v = def;
  for (const t of traitDefs(a)) if (t[key] !== undefined) v = key.endsWith('Rate') || key === 'salaryMult' ? v * t[key]! : v + t[key]!;
  return v;
}

export function fatigueFactor(fatigue: number): number {
  return 1 - Math.max(0, fatigue - 40) / 150;
}

/** 実効能力。job を指定すると「その職業に就いた場合」を計算できる(転職プレビュー用)。 */
export function effectiveStats(a: Adventurer, job: string = a.job, withFatigue = true): Stats {
  const j = JOB[job];
  const apt = aptFactor(a.apt[job] ?? 30);
  const ff = withFatigue ? fatigueFactor(a.fatigue) : 1;
  const out = {} as Stats;
  for (const k of STAT_KEYS) {
    let v = (a.base[k] + (a.level - 1) * LEVEL_GAIN[k] * a.growth) * j.statMult[k];
    if ((COMBAT_STATS as readonly string[]).includes(k)) v *= apt;
    for (const t of traitDefs(a)) v += t.mods[k] ?? 0;
    out[k] = Math.max(1, Math.round(v * ff));
  }
  return out;
}

export function attackOf(stats: Stats, job: string): number {
  return stats[JOB[job].attackStat];
}

/** 1人あたりの戦力目安 */
export function powerOf(a: Adventurer, job: string = a.job, withFatigue = true): number {
  const s = effectiveStats(a, job, withFatigue);
  return Math.round(s.hp / 4 + attackOf(s, job) * 1.5 + s.def + s.spd * 0.5 + s.scout * 0.2 + s.gather * 0.1);
}

export function bestJob(a: Adventurer): string {
  return JOBS.reduce((best, j) => ((a.apt[j.id] ?? 0) > (a.apt[best] ?? 0) ? j.id : best), JOBS[0].id);
}

/**
 * 日給は適職での戦力(疲労を除く)に比例する。育った冒険者ほど抱える重みが増え、
 * 人数を増やせば稼ぎも支出も膨らむ。
 */
export function salaryOf(a: Adventurer): number {
  const p = powerOf(a, bestJob(a), false);
  const raw = 10 + (p - 50) * 0.6 + (a.growth - 1) * 14;
  return Math.max(8, Math.round(raw * traitNum(a, 'salaryMult', 1)));
}

export interface GenOptions { id: string; quality?: number; level?: number; mismatch?: number; usedNames?: Set<string> }

export function generateAdventurer(rng: Rng, o: GenOptions): Adventurer {
  const q = o.quality ?? 0; // 0..1
  const level = o.level ?? 1;
  const base: Stats = {
    hp: Math.round(rng.bell(48, 78) + q * 8),
    atk: Math.round(rng.bell(6, 14) + q * 3),
    def: Math.round(rng.bell(5, 12) + q * 3),
    mag: Math.round(rng.bell(5, 14) + q * 3),
    spd: Math.round(rng.bell(4, 12) + q * 2),
    dex: Math.round(rng.bell(5, 14)),
    scout: Math.round(rng.bell(4, 14)),
    gather: Math.round(rng.bell(4, 14)),
  };
  const native = rng.pick(JOBS).id;
  const apt: Record<string, number> = {};
  for (const j of JOBS) {
    apt[j.id] = j.id === native ? Math.round(rng.range(62, 98) + q * 2) : Math.round(rng.bell(10, 62));
    apt[j.id] = Math.min(100, apt[j.id]);
  }
  const mismatch = o.mismatch ?? 0.4;
  const job = rng.chance(mismatch) ? rng.pick(JOBS.filter((j) => j.id !== native)).id : native;
  const growth = Math.round((rng.bell(0.7, 1.35) + q * 0.15) * 100) / 100;

  const traits = [] as Adventurer['traits'];
  const nTraits = rng.chance(0.55) ? 1 : rng.chance(0.2) ? 2 : 0;
  for (const t of rng.shuffle(TRAITS).slice(0, nTraits)) traits.push({ id: t.id, revealed: !rng.chance(t.hiddenChance) });

  let name = rng.pick(NAMES.given);
  for (let i = 0; i < 20 && o.usedNames?.has(name); i++) name = rng.pick(NAMES.given);
  o.usedNames?.add(name);

  const a: Adventurer = {
    id: o.id, name, age: rng.int(16, 38), level, exp: 0, job, base, apt, growth,
    personality: rng.pick(PERSONALITIES).id, traits,
    fatigue: 0, injuryDays: 0, salary: 0, loyalty: rng.int(55, 80), status: 'idle',
    hiredDay: 0, expeditions: 0, kills: 0,
  };
  a.salary = salaryOf(a);
  return a;
}

/** 経験値加算。レベルアップした回数を返す。 */
export function addExp(a: Adventurer, exp: number): number {
  a.exp += exp;
  let ups = 0;
  while (a.exp >= expToNext(a.level)) {
    a.exp -= expToNext(a.level);
    a.level++;
    ups++;
  }
  if (ups) a.salary = salaryOf(a);
  return ups;
}

export function isTalent(a: Adventurer): boolean {
  return a.growth >= 1.2 || Math.max(...Object.values(a.apt)) >= 90;
}
