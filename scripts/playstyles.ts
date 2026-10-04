import { bestJob, powerOf } from '../src/core/adventurer';
import { AREA } from '../src/core/data';
import {
  advanceDay, buildFacility, capacity, changeJob, dailyCost, dispatch, facilityCost, featureUnlocked, hire, hireFee, newGame,
  partyPower, unlockedQuests,
} from '../src/core/game';
import { forecastExpedition, forecastVerdict } from '../src/core/readiness';
import { MAX_DAY, POTION_PRICE, type Adventurer, type GameState, type QuestDef } from '../src/core/types';

/**
 * 遊び方ごとの30日を比べる計測用スクリプト。
 *   npx tsx scripts/playstyles.ts [seed数=100]
 * 「拡大型」は autoplay と同じ判断(強い応募者を雇い、2隊を回す)。
 * 「初期4人型」は雇用せず1隊だけを、画面の見込みと疲労警告に従って動かす。
 */
interface Trace {
  cleared: boolean; day: number; endGold: number; minGold: number; debtDays: number; quits: number; hires: number;
  gold: Record<number, number>; cost: Record<number, number>; rep25: number; lv7: number; rested: number;
  drake: { day: number; power: number; level: number; ok: boolean }[]; spent: number; failed: number; total: number;
}
const newTrace = (): Trace => ({ cleared: false, day: 0, endGold: 0, minGold: Infinity, debtDays: 0, quits: 0, hires: 0,
  gold: {}, cost: {}, rep25: 0, lv7: 0, rested: 0, drake: [], spent: 0, failed: 0, total: 0 });

const avgLevel = (ms: Adventurer[]) => ms.reduce((t, m) => t + m.level, 0) / ms.length;
function endOfDay(s: GameState, t: Trace) {
  const before = s.adventurers.length;
  advanceDay(s);
  if (s.adventurers.length < before) t.quits++;
  if (s.gold < 0) t.debtDays++;
  t.minGold = Math.min(t.minGold, s.gold);
  if (!t.rep25 && s.rep >= 25) t.rep25 = s.day;
  const core = s.adventurers.filter((a) => a.profile);
  if (!t.lv7 && avgLevel(core) >= 7) t.lv7 = s.day;
  if (s.day % 5 === 0) { t.gold[s.day] = s.gold; t.cost[s.day] = dailyCost(s); }
}
function finish(s: GameState, t: Trace): Trace {
  t.cleared = s.finalCleared; t.day = s.day; t.endGold = s.gold;
  t.failed = s.history.filter((h) => !h.success).length; t.total = s.history.length;
  t.spent = -s.ledger.filter((l) => l.label.startsWith('施設') || l.label.startsWith('契約金')).reduce((n, l) => n + l.amount, 0);
  return t;
}
const fitJobs = (s: GameState) => {
  for (const a of s.adventurers) if (a.status === 'idle') { const b = bestJob(a); if (a.apt[b] - a.apt[a.job] >= 20) changeJob(s, a.id, b); }
};

/** 拡大型: src/core/autoplay.ts と同じ判断に計測だけを足したもの。 */
function expand(seed: number, drakePotions: number): Trace {
  const s = newGame(seed); const t = newTrace();
  while (s.day < MAX_DAY && !s.finalCleared) {
    fitJobs(s);
    if (featureUnlocked(s, 'recruit') && s.adventurers.length < capacity(s)) {
      const best = [...s.candidates].sort((x, y) => powerOf(y.adv, bestJob(y.adv)) - powerOf(x.adv, bestJob(x.adv)))[0];
      if (best && s.gold > hireFee(best.adv) + 250 && s.adventurers.length < 8 && hire(s, best.adv.id).ok) { t.hires++; changeJob(s, best.adv.id, bestJob(best.adv)); }
    }
    if (featureUnlocked(s, 'facility') && s.gold > 700 && (s.facilities.training ?? 0) < 1) buildFacility(s, 'training');
    else if (featureUnlocked(s, 'facility') && s.gold > 900 && (s.facilities.dorm ?? 0) < 1) buildFacility(s, 'dorm');
    else if (featureUnlocked(s, 'facility') && s.gold > 1000 && (s.facilities.clinic ?? 0) < 1) buildFacility(s, 'clinic');
    for (let party = 0; party < 2; party++) {
      const idle = s.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0 && a.fatigue < 60).sort((a, b) => powerOf(b) - powerOf(a));
      if (idle.length < 2) break;
      const quests = unlockedQuests(s).filter((q) => q.days <= MAX_DAY - s.day);
      const members = idle.slice(0, 4); const p = partyPower(members);
      const fit = quests.filter((q) => q.final ? members.length >= 4 && p >= AREA[q.area].recommended
        : p >= AREA[q.area].recommended * (members.length / 4) * (q.type === 'boss' ? 1.0 : 0.9));
      fit.sort((a, b) => b.reward / b.days - a.reward / a.days);
      const pick = fit[0] ?? quests.filter((q) => q.area === 'forest').sort((a, b) => b.reward / b.days - a.reward / a.days)[0];
      if (!pick) break;
      const leader = [...members].sort((a, b) => b.level - a.level)[0];
      const want = pick.final ? drakePotions : pick.type === 'boss' || pick.area === 'ruins' ? 3 : 0;
      const r = dispatch(s, { questId: pick.id, memberIds: members.map((m) => m.id), leaderId: leader.id, policy: 'standard', potions: Math.max(0, Math.min(want, Math.floor(s.gold / POTION_PRICE))) });
      if (!r.ok) break;
      if (pick.final) t.drake.push({ day: s.day, power: p, level: avgLevel(members), ok: r.value.success });
    }
    endOfDay(s, t);
  }
  return finish(s, t);
}

interface StarterStyle {
  /** 資金に余裕ができたら建てる順 */
  facilities: string[];
  /** 施設代を払ったあと手元に残す額 */
  reserve: (s: GameState) => number;
  /** 討伐に「強敵優先」、採取に「探索優先」を使うか */
  usePolicies: boolean;
  drakePotions: number;
}
const CAREFUL: StarterStyle = { facilities: ['training', 'clinic', 'training', 'clinic'], reserve: (s) => 4 * dailyCost(s), usePolicies: true, drakePotions: 6 };
const MODEST: StarterStyle = { facilities: ['training', 'clinic'], reserve: () => 600, usePolicies: false, drakePotions: 3 };
const CASUAL: StarterStyle = { facilities: [], reserve: () => 0, usePolicies: false, drakePotions: 3 };

/** 初期4人型: 雇用なし・1隊。見込みが「適正」以上の依頼を選び、疲労40超なら休む。 */
function starters(seed: number, style: StarterStyle): Trace {
  const s = newGame(seed); const t = newTrace();
  const look = (q: QuestDef, members: Adventurer[], leaderId: string, policy: string, potions: number) => {
    const f = forecastExpedition({ questId: q.id, members, leaderId, policy, potions, relations: s.relations,
      expMult: 1 + 0.2 * (s.facilities.training ?? 0), clinicLevel: s.facilities.clinic ?? 0 }, 30);
    return { f, verdict: forecastVerdict(f) };
  };
  while (s.day < MAX_DAY && !s.finalCleared) {
    fitJobs(s);
    if (featureUnlocked(s, 'facility')) {
      // 並び順に1段階ずつ。同じ施設を2回書くとLv2まで上げる。
      const target: Record<string, number> = {};
      for (const id of style.facilities) {
        target[id] = (target[id] ?? 0) + 1;
        if ((s.facilities[id] ?? 0) >= target[id]) continue;
        const cost = facilityCost(s, id);
        if (cost !== null && s.gold >= cost + style.reserve(s)) buildFacility(s, id);
        break;
      }
    }
    const party = s.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0);
    const away = s.adventurers.some((a) => a.status === 'away');
    const tired = party.some((a) => a.fatigue > 40);
    if (!away && party.length >= 3 && !tired) {
      const leader = [...party].sort((a, b) => b.level - a.level)[0];
      const quests = unlockedQuests(s).filter((q) => q.days <= MAX_DAY - s.day);
      const canPlan = featureUnlocked(s, 'policy');
      const afford = (n: number) => canPlan ? Math.max(0, Math.min(n, Math.floor((s.gold - 100) / POTION_PRICE))) : 0;
      let order: { q: QuestDef; policy: string; potions: number } | null = null;
      const final = quests.find((q) => q.final);
      if (final && party.length === 4) {
        const potions = afford(style.drakePotions);
        const { f, verdict } = look(final, party, leader.id, 'standard', potions);
        const lastChance = s.day >= MAX_DAY - final.days - 1;
        if (verdict === '適正' || verdict === '余裕' || (lastChance && f.success >= 0.4)) order = { q: final, policy: 'standard', potions };
      }
      if (!order) {
        const worth = (q: QuestDef) => (q.reward + q.exp * 4) / q.days;
        for (const q of quests.filter((x) => !x.final).sort((a, b) => worth(b) - worth(a))) {
          const policy = !canPlan || !style.usePolicies ? 'standard' : q.type === 'hunt' ? 'hunt' : q.type === 'gather' ? 'explore' : 'standard';
          const potions = q.type === 'boss' ? afford(3) : 0;
          const { verdict } = look(q, party, leader.id, policy, potions);
          if (verdict === '適正' || verdict === '余裕') { order = { q, policy, potions }; break; }
        }
      }
      if (order) {
        const r = dispatch(s, { questId: order.q.id, memberIds: party.map((m) => m.id), leaderId: leader.id, policy: order.policy, potions: order.potions });
        if (r.ok && order.q.final) t.drake.push({ day: s.day, power: partyPower(party), level: avgLevel(party), ok: r.value.success });
      }
    } else if (!away) t.rested++;
    endOfDay(s, t);
  }
  return finish(s, t);
}

const seeds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100);
const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const median = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : NaN; };
function report(name: string, play: (seed: number) => Trace) {
  const runs = Array.from({ length: seeds }, (_, i) => play(i + 1));
  const wins = runs.filter((r) => r.cleared);
  const first = runs.filter((r) => r.drake.length).map((r) => r.drake[0]);
  const at = (key: 'gold' | 'cost', d: number) => Math.round(avg(runs.map((r) => r[key][d]).filter((x) => x !== undefined)));
  console.log(`\n=== ${name} (seed 1〜${seeds}) ===`);
  console.log(`期限内クリア ${wins.length}/${seeds} ・平均クリア日 ${avg(wins.map((r) => r.day)).toFixed(1)} ・依頼失敗率 ${Math.round(runs.reduce((n, r) => n + r.failed, 0) / runs.reduce((n, r) => n + r.total, 0) * 100)}%`);
  console.log(`所持金: ${[5, 10, 15, 20, 25].map((d) => `${d}日目 ${at('gold', d)}G`).join(' / ')} / 終了時 ${Math.round(avg(runs.map((r) => r.endGold)))}G`);
  console.log(`1日の支出: ${[5, 10, 15, 20, 25].map((d) => `${d}日目 ${at('cost', d)}G`).join(' / ')}`);
  console.log(`施設・契約金の支出 平均${Math.round(avg(runs.map((r) => r.spent)))}G ・雇用 平均${avg(runs.map((r) => r.hires)).toFixed(1)}人 ・最低所持金の中央値 ${median(runs.map((r) => r.minGold))}G ・赤字日数 計${runs.reduce((n, r) => n + r.debtDays, 0)} (${runs.filter((r) => r.debtDays).length}周) ・辞職 計${runs.reduce((n, r) => n + r.quits, 0)}`);
  console.log(`評判25 中央値${median(runs.map((r) => r.rep25).filter(Boolean))}日目 ・初期4人が平均Lv7 中央値${median(runs.map((r) => r.lv7).filter(Boolean))}日目(${runs.filter((r) => r.lv7).length}周) ・休養日 平均${avg(runs.map((r) => r.rested)).toFixed(1)}日`);
  console.log(`灰竜: 挑戦 ${first.length}/${seeds}周 ・初挑戦 中央値${median(first.map((d) => d.day))}日目 平均Lv${avg(first.map((d) => d.level)).toFixed(1)} 戦力${Math.round(avg(first.map((d) => d.power)))} 成功${Math.round(first.filter((d) => d.ok).length / Math.max(1, first.length) * 100)}%`);
}
report('拡大型(雇用あり・2隊・灰竜に薬3本)', (seed) => expand(seed, 3));
report('初期4人型(雇用なし・1隊・見込みに従う・施設と方針を活用)', (seed) => starters(seed, CAREFUL));
report('控えめ型(初期4人・1隊・訓練所と治療所をLv1だけ・標準方針のみ・灰竜に薬3本)', (seed) => starters(seed, MODEST));
report('のんびり型(初期4人・1隊・施設なし・標準方針のみ・灰竜に薬3本)', (seed) => starters(seed, CASUAL));
report('のんびり型+訓練所Lv1だけ', (seed) => starters(seed, { ...CASUAL, facilities: ['training'], reserve: () => 600 }));
