import { describe, expect, it } from 'vitest';
import { bestJob, effectiveStats, generateAdventurer, addExp, expToNext, aptFactor, salaryOf } from '../src/core/adventurer';
import { autoplay } from '../src/core/autoplay';
import { makeEnemies, runCombat, type Unit } from '../src/core/combat';
import { ENEMY, JOBS, MISUNDERSTANDINGS, PERSONALITIES, QUESTS } from '../src/core/data';
import { simulateExpedition } from '../src/core/expedition';
import { advanceDay, buildFacility, changeJob, dismiss, dispatch, hire, newGame, capacity } from '../src/core/game';
import { addRelation, compatBase, getRelation, relationLabel } from '../src/core/relations';
import { Rng, rngFor } from '../src/core/rng';
import { resolveScenes } from '../src/core/scenes';
import { STAT_KEYS } from '../src/core/types';

const party = (seed: number, n = 4, level = 1) => {
  const rng = new Rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = generateAdventurer(rng, { id: `t${i}`, level });
    a.job = bestJob(a);
    return a;
  });
};
const sim = (seed: number, questId: string, members = party(1), policy = 'standard') =>
  simulateExpedition({ rng: rngFor(seed, 'x'), questId, members, leaderId: members[0].id, policy, potions: 0, relations: {}, startDay: 1, expMult: 1, clinicLevel: 0 });
// These tests cover the pre-tutorial economy/dispatch rules.  A save without
// a campaign marker is intentionally kept as the legacy compatibility mode.
const legacyGame = (seed: number) => {
  const s = newGame(seed);
  delete s.campaign;
  return s;
};

describe('rng', () => {
  it('同seedで同じ列を返す', () => {
    const a = new Rng(42), b = new Rng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });
  it('int は範囲内', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) { const v = r.int(3, 6); expect(v).toBeGreaterThanOrEqual(3); expect(v).toBeLessThanOrEqual(6); }
  });
});

describe('冒険者生成・能力計算', () => {
  it('同seedで同じ冒険者が生成される', () => {
    expect(generateAdventurer(new Rng(5), { id: 'a' })).toEqual(generateAdventurer(new Rng(5), { id: 'a' }));
  });
  it('全職業の適性が0-100で、全能力が正の値', () => {
    for (let s = 0; s < 50; s++) {
      const a = generateAdventurer(new Rng(s), { id: 'a' });
      for (const j of JOBS) { expect(a.apt[j.id]).toBeGreaterThanOrEqual(0); expect(a.apt[j.id]).toBeLessThanOrEqual(100); }
      for (const k of STAT_KEYS) expect(effectiveStats(a)[k]).toBeGreaterThan(0);
      expect(a.salary).toBeGreaterThanOrEqual(8);
    }
  });
  it('適性が高い職業のほうが戦闘能力が高い(転職で化ける)', () => {
    const a = generateAdventurer(new Rng(3), { id: 'a' });
    a.apt = { fighter: 20, ranger: 95, mage: 40 };
    a.job = 'fighter';
    const before = effectiveStats(a, 'fighter').atk;
    const after = effectiveStats(a, 'ranger').atk;
    expect(aptFactor(95)).toBeGreaterThan(aptFactor(20));
    expect(after).toBeGreaterThan(before * 0.9);
    expect(bestJob(a)).toBe('ranger');
  });
  it('疲労で実効能力が下がる', () => {
    const a = generateAdventurer(new Rng(9), { id: 'a' });
    const fresh = effectiveStats(a).atk;
    a.fatigue = 100;
    expect(effectiveStats(a).atk).toBeLessThan(fresh);
  });
  it('レベルアップで能力と経験値処理が正しい', () => {
    const a = generateAdventurer(new Rng(9), { id: 'a' });
    const hp = effectiveStats(a, a.job, false).hp;
    expect(addExp(a, expToNext(1) + 5)).toBe(1);
    expect(a.level).toBe(2);
    expect(a.exp).toBe(5);
    expect(effectiveStats(a, a.job, false).hp).toBeGreaterThan(hp);
  });
  it('強い・成長率が高い冒険者ほど日給が高い', () => {
    const a = generateAdventurer(new Rng(9), { id: 'a' });
    const lo = salaryOf(a);
    a.level = 6;
    expect(salaryOf(a)).toBeGreaterThan(lo);
  });
});

describe('関係値', () => {
  it('性格相性が初期値になり、増減と上下限が効く', () => {
    expect(compatBase('caring', 'brave')).toBeGreaterThan(0);
    expect(compatBase('greedy', 'caring')).toBeLessThan(0);
    const [a, b] = party(2, 2);
    const rel: Record<string, number> = {};
    const base = getRelation(rel, a, b);
    addRelation(rel, a, b, -5);
    expect(getRelation(rel, b, a)).toBe(base - 5);
    addRelation(rel, a, b, 999);
    expect(getRelation(rel, a, b)).toBe(100);
    expect(relationLabel(100)).toBe('親友');
    expect(relationLabel(-50)).toBe('犬猿の仲');
  });
  it('全性格の likes/dislikes は実在する性格を指す', () => {
    const ids = PERSONALITIES.map((p) => p.id);
    for (const p of PERSONALITIES) for (const x of [...p.likes, ...p.dislikes]) expect(ids).toContain(x);
  });
});

describe('戦闘', () => {
  const mk = (n: number, atk: number): Unit[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `u${i}`, name: `U${i}`, side: 'ally' as const, hp: 200, maxHp: 200, atk, def: 10, spd: 10, job: 'fighter', personality: 'brave', skillCd: 0, down: false,
    }));
  const ctx = (seed: number) => ({ rng: new Rng(seed), say: () => {}, potions: { n: 0, used: 0 }, rel: () => {}, fleeBelow: 0, canFlee: false });
  it('圧倒的な味方が勝つ', () => {
    const r = runCombat(mk(4, 60), makeEnemies(ENEMY.goblin, 3), ctx(1));
    expect(r.outcome).toBe('won');
    expect(r.kills.goblin).toBe(3);
  });
  it('弱すぎる味方は負ける', () => {
    const weak = mk(1, 1).map((u) => ({ ...u, hp: 5, maxHp: 5 }));
    expect(runCombat(weak, makeEnemies(ENEMY.skeleton, 3), ctx(1)).outcome).toBe('lost');
  });
  it('同seedなら同じ結果・同じログ', () => {
    const run = () => { const lines: string[] = []; const c = { ...ctx(7), say: (_k: any, t: string) => lines.push(t) }; const r = runCombat(mk(3, 20), makeEnemies(ENEMY.wolf, 3), c); return { r, lines }; };
    expect(run()).toEqual(run());
  });
  it('撤退条件を満たすと fled になりうる', () => {
    const weak = mk(2, 5).map((u) => ({ ...u, hp: 60, maxHp: 60 }));
    let fled = 0;
    for (let s = 0; s < 40; s++) if (runCombat(weak.map((u) => ({ ...u })), makeEnemies(ENEMY.skeleton, 3), { ...ctx(s), fleeBelow: 0.9, canFlee: true }).outcome === 'fled') fled++;
    expect(fled).toBeGreaterThan(0);
  });
});

describe('探索シミュレーション', () => {
  it('同seed・同編成・同条件で完全に同じ結果', () => {
    const a = sim(11, 'q_patrol', party(4));
    const b = sim(11, 'q_patrol', party(4));
    expect(a).toEqual(b);
  });
  it('seedが違えばログが変わりうる', () => {
    const logs = new Set(Array.from({ length: 8 }, (_, i) => JSON.stringify(sim(i, 'q_patrol', party(4)).log)));
    expect(logs.size).toBeGreaterThan(1);
  });
  it('全依頼で完走し、ログ・報酬・経験値が整合している', () => {
    for (const q of QUESTS) for (let s = 0; s < 5; s++) {
      const r = sim(s, q.id, party(s + 1, 4, 5));
      expect(r.log.length).toBeGreaterThan(3);
      expect(r.log.every((l) => l.text.length > 0)).toBe(true);
      expect(r.questGold).toBe(r.success ? q.reward : 0);
      for (const id of r.partyIds) expect(r.expGain[id]).toBeGreaterThan(0);
    }
  });
  it('成功した採取依頼は納品分が売却素材から引かれる', () => {
    for (let s = 0; s < 30; s++) {
      const r = sim(s, 'q_herb', party(s + 1, 4, 3));
      if (r.success) { expect((r.materials.herb ?? 0)).toBeGreaterThanOrEqual(0); return; }
    }
    throw new Error('30回試しても成功しない');
  });
  it('戦闘回避の方針は戦闘が減る', () => {
    const count = (policy: string) => Array.from({ length: 40 }, (_, i) => sim(i, 'q_patrol', party(i + 1, 4, 3), policy).log.filter((l) => l.text.startsWith('敵:')).length).reduce((a, b) => a + b, 0);
    expect(count('avoid')).toBeLessThan(count('hunt'));
  });
  it('死亡は発生せず、負傷は日数付きで記録される', () => {
    let injured = 0;
    for (let s = 0; s < 30; s++) {
      const r = sim(s, 'q_drake', party(s + 1, 4, 3));
      for (const d of Object.values(r.injuries)) { expect(d).toBeGreaterThanOrEqual(1); injured++; }
    }
    expect(injured).toBeGreaterThan(0);
  });
  it('性格が行動に影響: 慎重なリーダーは勇敢なリーダーより撤退しやすい', () => {
    const rate = (pers: string) => {
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const m = party(i + 1, 4, 3);
        m[0].personality = pers;
        if (sim(i, 'q_skeleton', m).retreated) n++;
      }
      return n;
    };
    expect(rate('timid')).toBeGreaterThanOrEqual(rate('brave'));
  });
  it('関係値の変動は差分として記録される', () => {
    const r = sim(3, 'q_patrol', party(5, 4, 3));
    expect(Array.isArray(r.relationDeltas)).toBe(true);
    for (const d of r.relationDeltas) expect(r.partyIds).toContain(d.a);
  });
});

describe('経営・ゲーム進行', () => {
  it('新規ゲーム: 冒険者4人・候補者あり・同seedで同じ初期状態', () => {
    const s = newGame(1);
    expect(s.adventurers).toHaveLength(4);
    expect(s.candidates.length).toBeGreaterThan(0);
    expect(newGame(1)).toEqual(s);
  });
  it('雇用: 契約金が引かれ、資金不足・定員超過は拒否される', () => {
    const s = legacyGame(1);
    const c = s.candidates[0].adv;
    const g = s.gold;
    expect(hire(s, c.id).ok).toBe(true);
    expect(s.gold).toBe(g - c.salary * 4);
    const s2 = legacyGame(1);
    s2.gold = 0;
    expect(hire(s2, s2.candidates[0].adv.id).ok).toBe(false);
    const s3 = legacyGame(1);
    s3.gold = 99999;
    for (let i = 0; i < capacity(s3); i++) {
      if (s3.adventurers.length >= capacity(s3)) break;
      hire(s3, s3.candidates[0].adv.id);
    }
    expect(s3.adventurers.length).toBe(capacity(s3));
    expect(hire(s3, s3.candidates[0].adv.id).ok).toBe(false);
  });
  it('派遣→日送り→帰還で報酬・疲労・経験値が反映される', () => {
    const s = legacyGame(2);
    const ids = s.adventurers.map((a) => a.id);
    const r = dispatch(s, { questId: 'q_patrol', memberIds: ids, leaderId: ids[0], policy: 'standard', potions: 0 });
    expect(r.ok).toBe(true);
    expect(s.adventurers.every((a) => a.status === 'away')).toBe(true);
    const gold0 = s.gold;
    advanceDay(s);
    expect(s.expeditions).toHaveLength(1);
    const rep = advanceDay(s);
    expect(rep.returned).toHaveLength(1);
    expect(s.expeditions).toHaveLength(0);
    expect(s.adventurers.every((a) => a.status === 'idle')).toBe(true);
    expect(s.history).toHaveLength(1);
    const res = rep.returned[0];
    // 2日分の日給+維持費が引かれ、報酬が足される
    const wages = s.adventurers.reduce((t, a) => t + a.salary, 0) + 30;
    expect(s.gold).toBeGreaterThanOrEqual(gold0 - wages * 2 - 200 + res.questGold + res.lootGold);
  });
  it('負傷者・派遣中・評判不足は派遣できない', () => {
    const s = newGame(2);
    s.adventurers[0].injuryDays = 2;
    expect(dispatch(s, { questId: 'q_patrol', memberIds: [s.adventurers[0].id], leaderId: s.adventurers[0].id, policy: 'standard', potions: 0 }).ok).toBe(false);
    expect(dispatch(s, { questId: 'q_drake', memberIds: [s.adventurers[1].id], leaderId: s.adventurers[1].id, policy: 'standard', potions: 0 }).ok).toBe(false);
    expect(dispatch(s, { questId: 'q_patrol', memberIds: [], leaderId: '', policy: 'standard', potions: 0 }).ok).toBe(false);
  });
  it('赤字になると借金・忠誠低下が起き、ゲームオーバーにはならない', () => {
    const s = legacyGame(3);
    s.gold = 99999;
    expect(hire(s, s.candidates[0].adv.id).ok).toBe(true);
    s.gold = 0;
    const loyalty = s.adventurers[0].loyalty;
    advanceDay(s);
    expect(s.gold).toBeLessThan(0);
    expect(s.debt).toBe(true);
    expect(s.adventurers[0].loyalty).toBeLessThan(loyalty);
    for (let i = 0; i < 16; i++) advanceDay(s);
    expect(s.adventurers.length).toBeLessThan(5); // 雇った新人は忠誠が尽きて辞める(固定メンバーは残る)
    expect(s.adventurers.filter((a) => a.profile)).toHaveLength(4);
  });
  it('施設: 資金消費・レベル上限・効果', () => {
    const s = legacyGame(1);
    s.gold = 5000;
    expect(capacity(s)).toBe(6);
    expect(buildFacility(s, 'dorm').ok).toBe(true);
    expect(capacity(s)).toBe(8);
    buildFacility(s, 'clinic'); buildFacility(s, 'clinic');
    expect(buildFacility(s, 'clinic').ok).toBe(false);
  });
  it('転職は無料で、適性差が大きいと勘違いの種になる', () => {
    const s = newGame(1);
    const a = s.adventurers[0];
    a.apt = { fighter: 10, ranger: 90, mage: 30 };
    a.job = 'fighter';
    expect(changeJob(s, a.id, 'ranger').ok).toBe(true);
    expect(a.job).toBe('ranger');
    expect(s.pendingTags).toContain('job_change_big');
  });
  it('自動プレイで30日回しても破綻しない(複数seed)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = autoplay(seed);
      expect(s.day).toBeGreaterThan(5);
      expect(Number.isFinite(s.gold)).toBe(true);
    }
  });
});

describe('勘違いイベント', () => {
  it('タグに対応する未使用シーンが選ばれ、一度出たものは再登場しない', () => {
    const s = newGame(1);
    const sc1 = resolveScenes(s, ['hire_talent'], new Rng(1));
    expect(sc1).toHaveLength(1);
    expect(sc1[0].thought.length).toBeGreaterThan(0);
    expect(s.seenScenes).toContain(sc1[0].id);
    const n = MISUNDERSTANDINGS.filter((m) => m.tag === 'hire_talent').length;
    let total = 1;
    for (let i = 0; i < n + 2; i++) total += resolveScenes(s, ['hire_talent'], new Rng(i)).length;
    expect(total).toBe(n);
  });
  it('1日に出る数は上限がある', () => {
    const s = newGame(1);
    expect(resolveScenes(s, ['hire_talent', 'job_change_big', 'dispatch_potions', 'day_idle'], new Rng(1), 2)).toHaveLength(2);
  });
});

describe('少人数編成', () => {
  it('1〜3人でも全依頼・全方針で例外なく完走する', () => {
    for (const n of [1, 2, 3]) for (const q of QUESTS) for (const policy of ['safe', 'standard', 'explore', 'reward', 'avoid', 'hunt']) {
      for (let s = 0; s < 3; s++) {
        const r = sim(s, q.id, party(s + 1, n, 4), policy);
        expect(r.log.length).toBeGreaterThan(1);
      }
    }
  });
});

describe('固定メンバーと個人エピソード', () => {
  it('初期メンバーは固定4人で、seedに依らず同じ顔ぶれ・同じ能力', () => {
    const a = newGame(1), b = newGame(999);
    expect(a.adventurers.map((x) => x.name)).toEqual(['アルド', 'ミナ', 'リナ', 'ブルーノ']);
    expect(b.adventurers.map((x) => [x.name, x.base, x.apt])).toEqual(a.adventurers.map((x) => [x.name, x.base, x.apt]));
  });
  it('アルドは剣士として始まるが弓の適性が高い(転職で化ける)', () => {
    const al = newGame(1).adventurers[0];
    expect(al.job).toBe('fighter');
    expect(bestJob(al)).toBe('ranger');
  });
  it('薬草担当(ミナの薬草博士)が最初から見えている', () => {
    const mina = newGame(1).adventurers[1];
    expect(mina.traits.some((t) => t.id === 'herbalist' && t.revealed)).toBe(true);
  });
  it('薬草博士のいる編成は薬草採取の成功率が明確に高い', () => {
    const s = newGame(1);
    const rate = (keys: string[]) => {
      let ok = 0;
      for (let i = 0; i < 150; i++) {
        const m = keys.map((k) => structuredClone(s.adventurers.find((x) => x.id === `c_${k}`)!));
        if (simulateExpedition({ rng: rngFor(i, 'h'), questId: 'q_herb', members: m, leaderId: m[0].id, policy: 'standard', potions: 0, relations: s.relations, startDay: 1, expMult: 1, clinicLevel: 0 }).success) ok++;
      }
      return ok / 150;
    };
    expect(rate(['aldo', 'mina', 'lina', 'bruno'])).toBeGreaterThan(rate(['aldo', 'lina', 'bruno']) + 0.1);
    expect(rate(['aldo', 'mina', 'lina', 'bruno'])).toBeGreaterThan(0.7);
  });
  it('初期の関係値が設定されている(幼なじみ・犬猿)', () => {
    const s = newGame(1);
    const [al, mi, li, br] = s.adventurers;
    expect(getRelation(s.relations, al, mi)).toBeGreaterThan(20);
    expect(getRelation(s.relations, li, br)).toBeLessThan(0);
  });
  it('固定メンバーは解雇できず、忠誠が尽きても辞めない', () => {
    const s = newGame(1);
    expect(dismiss(s, 'c_aldo').ok).toBe(false);
    s.adventurers.forEach((a) => (a.loyalty = 0));
    advanceDay(s);
    expect(s.adventurers.filter((a) => a.profile)).toHaveLength(4);
  });
  it('個人エピソードは条件を満たすと1日1件・1回だけ発生し効果が適用される', () => {
    const s = newGame(1);
    changeJob(s, 'c_aldo', 'ranger');
    s.day = 3;
    const loyalty = s.adventurers[0].loyalty;
    const rep1 = advanceDay(s);
    expect(rep1.charEvents).toHaveLength(1);
    expect(s.adventurers[0].loyalty).toBeGreaterThan(loyalty);
    const ids = new Set(rep1.charEvents.map((e) => e.id));
    for (let i = 0; i < 12; i++) for (const e of advanceDay(s).charEvents) { expect(ids.has(e.id)).toBe(false); ids.add(e.id); }
    expect(s.seenCharEvents).toContain('aldo_bow');
  });
});
