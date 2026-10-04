import { addExp, generateAdventurer, isTalent, powerOf, salaryOf } from './adventurer';
import { AREA, CHARACTERS, FACILITY, JOB, POLICY, QUEST } from './data';
import { runCharEvents, type CharEventReport } from './charevents';
import { simulateExpedition } from './expedition';
import { addRelation, getRelation, pairKey } from './relations';
import { rngFor } from './rng';
import { REP_LEVELS, repLevel, resolveScenes } from './scenes';
import {
  CAMPAIGN_SUPPORT_AMOUNT, CAMPAIGN_SUPPORT_DAYS, createCampaign, dayAdvanceBlock,
  featureUnlocked, isCampaignMode, questUnlocked, tutorialObjective,
} from './campaign';
import {
  MAX_DAY, PARTY_MAX, POTION_PRICE, UPKEEP_PER_DAY,
  type Adventurer, type ExpeditionResult, type GameState, type Scene,
} from './types';

// Re-export the campaign-facing helpers from the main Core entry point as
// well, so hosts can consume either game.ts or the focused campaign module.
export { dayAdvanceBlock, featureUnlocked, questUnlocked, tutorialObjective } from './campaign';

export const START_GOLD = 600;
export const CANDIDATE_STAY = 4;
export const MAX_CANDIDATES = 8;
export const HIRE_FEE_DAYS = 4;

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });
const hasOwn = <T>(table: Record<string, T>, key: string): boolean => Object.prototype.hasOwnProperty.call(table, key);

export function capacity(s: GameState): number {
  return 6 + 2 * (s.facilities.dorm ?? 0);
}
export const hireFee = (a: Adventurer) => a.salary * HIRE_FEE_DAYS;
export const dailyCost = (s: GameState) => s.adventurers.reduce((t, a) => t + a.salary, 0) + UPKEEP_PER_DAY;

function newId(s: GameState): string {
  return `a${s.counters.nextId++}`;
}

function spawnCandidate(s: GameState, tag: string | number) {
  const rng = rngFor(s.seed, 'cand', tag, s.counters.nextId);
  const q = (repLevel(s.rep) - 1) * 0.2;
  const used = new Set([...s.adventurers.map((a) => a.name), ...s.candidates.map((c) => c.adv.name)]);
  const adv = generateAdventurer(rng, { id: newId(s), quality: q, level: rng.chance(0.2 * (repLevel(s.rep) - 1)) ? 2 : 1, usedNames: used });
  s.candidates.push({ adv, arrivedDay: s.day, expiresDay: s.day + CANDIDATE_STAY });
}

export function newGame(seed: number): GameState {
  const s: GameState = {
    playerName: '', seed, day: 1, gold: START_GOLD, rep: 0, adventurers: [], candidates: [], relations: {},
    campaign: createCampaign(),
    facilities: { dorm: 0, clinic: 0, training: 0 },
    expeditions: [], history: [], scenes: [], seenScenes: [], ledger: [], notices: [],
    counters: { nextId: 1, dispatches: 0 }, clears: {}, finalCleared: false, debt: false, repMilestones: [1],
    pendingTags: [], dispatchedToday: false, hiredToday: false,
  };
  for (const c of CHARACTERS.members) {
    const a: Adventurer = {
      id: `c_${c.key}`, name: c.name, age: c.age, level: c.level, exp: 0, job: c.job,
      base: { ...c.base } as Adventurer['base'], apt: { ...c.apt }, growth: c.growth, personality: c.personality,
      traits: c.traits.map((t) => ({ ...t })), fatigue: 0, injuryDays: 0, salary: 0, loyalty: c.loyalty, status: 'idle',
      hiredDay: 1, expeditions: 0, kills: 0, profile: { key: c.key, bio: c.bio, quote: c.quote, icon: c.icon },
    };
    a.salary = salaryOf(a);
    s.adventurers.push(a);
  }
  for (const r of CHARACTERS.relations) s.relations[pairKey(`c_${r.a}`, `c_${r.b}`)] = r.value;
  for (let i = 0; i < 5; i++) spawnCandidate(s, `init${i}`);
  return s;
}

const ledger = (s: GameState, label: string, amount: number) => {
  if (amount === 0) return;
  s.ledger.unshift({ day: s.day, label, amount });
  if (s.ledger.length > 300) s.ledger.length = 300;
};

// ---- 雇用・転職 ----
export function hire(s: GameState, candId: string): Result {
  if (isCampaignMode(s) && !featureUnlocked(s, 'recruit')) return fail('候補者の募集は4日目から解放されます');
  const c = s.candidates.find((x) => x.adv.id === candId);
  if (!c) return fail('その候補者はもういません');
  if (s.adventurers.length >= capacity(s)) return fail('宿舎がいっぱいです(施設で宿舎を増築できます)');
  const fee = hireFee(c.adv);
  if (s.gold < fee) return fail(`契約金が足りません(${fee}G必要)`);
  s.gold -= fee;
  ledger(s, `契約金: ${c.adv.name}`, -fee);
  s.candidates = s.candidates.filter((x) => x !== c);
  c.adv.hiredDay = s.day;
  s.adventurers.push(c.adv);
  s.hiredToday = true;
  if (isTalent(c.adv)) s.pendingTags.push('hire_talent');
  else if (c.adv.level === 1 && c.adv.salary <= 15) s.pendingTags.push('hire_cheap_newbie');
  return ok(undefined);
}

export function dismiss(s: GameState, advId: string): Result {
  const a = s.adventurers.find((x) => x.id === advId);
  if (!a) return fail('そんな冒険者はいません');
  if (a.profile) return fail(`${a.name}は大切な仲間です。解雇はできません`);
  if (a.status !== 'idle') return fail('派遣中は解雇できません');
  s.adventurers = s.adventurers.filter((x) => x !== a);
  return ok(undefined);
}

export function changeJob(s: GameState, advId: string, job: string): Result {
  const a = s.adventurers.find((x) => x.id === advId);
  if (!a || !hasOwn(JOB, job)) return fail('不正な指定です');
  if (a.status !== 'idle') return fail('派遣中は転職できません');
  const gain = a.apt[job] - a.apt[a.job];
  a.job = job;
  // The opening tutorial milestone is specifically Aldo discovering the
  // ranger role.  Once achieved it stays achieved even if the player later
  // experiments with another job.
  if (isCampaignMode(s) && a.id === 'c_aldo' && job === 'ranger') s.campaign!.jobChanged = true;
  if (gain >= 25) s.pendingTags.push('job_change_big');
  return ok(undefined);
}

// ---- 派遣 ----
export interface DispatchOrder { questId: string; memberIds: string[]; leaderId: string; policy: string; potions: number }

export function unlockedQuests(s: GameState) {
  return Object.values(QUEST).filter((q) => questUnlocked(s, q));
}

export function partyPower(members: Adventurer[]): number {
  return members.reduce((t, m) => t + powerOf(m), 0);
}

export function dispatch(s: GameState, o: DispatchOrder): Result<ExpeditionResult> {
  if (!o || typeof o !== 'object') return fail('派遣内容が不正です');
  if (typeof o.questId !== 'string') return fail('依頼の指定が不正です');
  if (!Array.isArray(o.memberIds)) return fail('パーティーの指定が不正です');
  if (typeof o.leaderId !== 'string') return fail('リーダーの指定が不正です');
  if (typeof o.policy !== 'string' || !hasOwn(POLICY, o.policy)) return fail('不正な方針です');
  if (!Number.isInteger(o.potions) || o.potions < 0) return fail('回復薬の本数は0以上の整数で指定してください');

  const q = hasOwn(QUEST, o.questId) ? QUEST[o.questId] : undefined;
  if (!q) return fail('依頼が見つかりません');
  if (!questUnlocked(s, q)) {
    if (s.rep < q.unlockRep) return fail('評判が足りず、この依頼は受けられません');
    return fail('この依頼はまだ解放されていません');
  }
  if (new Set(o.memberIds).size !== o.memberIds.length) return fail('同じ冒険者が重複しています');
  if (o.memberIds.some((id) => typeof id !== 'string')) return fail('冒険者の指定が不正です');
  const members = o.memberIds.map((id) => s.adventurers.find((a) => a.id === id));
  if (members.some((m) => !m)) return fail('存在しない冒険者が指定されています');
  const party = members as Adventurer[];
  if (party.length === 0 || party.length > PARTY_MAX) return fail(`パーティーは1〜${PARTY_MAX}人で編成してください`);
  if (!o.memberIds.includes(o.leaderId)) return fail('リーダーはパーティーから選んでください');
  if (isCampaignMode(s) && !featureUnlocked(s, 'policy') && o.policy !== 'standard') return fail('派遣方針は3日目から選べます');
  if (isCampaignMode(s) && !featureUnlocked(s, 'policy') && o.potions > 0) return fail('回復薬は3日目から持ち込めます');
  if (isCampaignMode(s) && s.day === 1 && s.dispatchedToday) return fail('チュートリアル初日は1隊だけ派遣できます');

  const firstDispatch = isCampaignMode(s) && s.counters.dispatches === 0 && !s.campaign!.introComplete;
  if (firstDispatch) {
    if (!s.campaign!.jobChanged) return fail('先にアルドを狩人(ranger)へ転職させてください');
    const aldo = s.adventurers.find((a) => a.id === 'c_aldo');
    if (!aldo || aldo.job !== 'ranger') return fail('初回派遣には狩人になったアルドが必要です');
    if (!o.memberIds.includes('c_aldo')) return fail('初回派遣にはアルドを含めてください');
  }
  for (const m of party) {
    if (m.status !== 'idle') return fail(`${m.name}は派遣中です`);
    if (m.injuryDays > 0) return fail(`${m.name}は負傷療養中です`);
  }
  const cost = o.potions * POTION_PRICE;
  if (cost > 0 && s.gold < cost) return fail('回復薬の代金が足りません');
  const rng = rngFor(s.seed, 'exp', s.counters.dispatches++);
  const res = simulateExpedition({
    rng, questId: q.id, members: party.map((m) => structuredClone(m)), leaderId: o.leaderId, policy: o.policy, potions: o.potions,
    relations: s.relations, startDay: s.day, expMult: 1 + 0.2 * (s.facilities.training ?? 0), clinicLevel: s.facilities.clinic ?? 0,
  });
  // The first assignment is a teaching run.  A bad random roll may still
  // fail the quest, but it must not strand a new guild with a long recovery.
  if (firstDispatch) for (const id of Object.keys(res.injuries)) res.injuries[id] = Math.min(1, res.injuries[id]);
  if (cost) { s.gold -= cost; ledger(s, '消耗品費(回復薬)', -cost); }
  for (const m of party) m.status = 'away';
  s.expeditions.push(res);
  s.dispatchedToday = true;
  if (firstDispatch) s.campaign!.introComplete = true;

  // 勘違いの種
  const avgLv = party.reduce((t, m) => t + m.level, 0) / party.length;
  if (q.type === 'gather' && avgLv <= 2) s.pendingTags.push('dispatch_newbie_gather');
  if ((o.policy === 'safe' || o.policy === 'avoid') && avgLv <= 2) s.pendingTags.push('dispatch_safe_weak');
  if (o.potions >= 2) s.pendingTags.push('dispatch_potions');
  const idle = s.adventurers.filter((a) => a.status === 'idle');
  const inParty = new Set(o.memberIds);
  for (const a of s.adventurers) for (const b of s.adventurers) {
    if (a.id < b.id && getRelation(s.relations, a, b) <= -15 && inParty.has(a.id) !== inParty.has(b.id) && (inParty.has(a.id) ? idle.includes(b) : idle.includes(a))) {
      s.pendingTags.push('dispatch_split_pair');
    }
  }
  return ok(res);
}

// ---- 施設 ----
export function facilityCost(s: GameState, id: string): number | null {
  if (!hasOwn(FACILITY, id)) return null;
  const f = FACILITY[id];
  const lv = s.facilities[id] ?? 0;
  return lv >= f.maxLevel ? null : f.costs[lv];
}
export function buildFacility(s: GameState, id: string): Result {
  if (!hasOwn(FACILITY, id)) return fail('不正な施設です');
  if (isCampaignMode(s) && !featureUnlocked(s, 'facility')) return fail('施設は5日目から解放されます');
  const cost = facilityCost(s, id);
  if (cost === null) return fail('これ以上強化できません');
  if (s.gold < cost) return fail(`資金が足りません(${cost}G必要)`);
  s.gold -= cost;
  s.facilities[id] = (s.facilities[id] ?? 0) + 1;
  ledger(s, `施設: ${FACILITY[id].name} Lv${s.facilities[id]}`, -cost);
  s.pendingTags.push('facility_built');
  for (const a of s.adventurers) a.loyalty = Math.min(100, a.loyalty + 2);
  return ok(undefined);
}

// ---- 日送り ----
export interface DayReport {
  day: number;
  returned: ExpeditionResult[];
  scenes: Scene[];
  notices: string[];
  expenses: { label: string; amount: number }[];
  charEvents: CharEventReport[];
}

const REP_BY_AREA: Record<string, number> = { forest: 1, mine: 2, ruins: 3 };

function applyReturn(s: GameState, r: ExpeditionResult, notices: string[], tags: string[]) {
  const q = QUEST[r.questId];
  const members = r.partyIds.map((id) => s.adventurers.find((a) => a.id === id)).filter(Boolean) as Adventurer[];
  const hadSuccess = s.history.some((h) => h.success);
  // 収支
  s.gold += r.questGold + r.lootGold + r.materialGold;
  if (r.questGold) ledger(s, `依頼報酬: ${q.name}`, r.questGold);
  if (r.lootGold) ledger(s, `戦利品: ${q.name}`, r.lootGold);
  if (r.materialGold) ledger(s, `素材売却: ${q.name}`, r.materialGold);
  // 評判
  let rep = r.repGain;
  if (r.success) rep += q.final ? 15 : REP_BY_AREA[q.area] ?? 2;
  if (r.wiped) rep -= 1;
  s.rep = Math.max(0, s.rep + rep);
  r.repGain = rep;
  if (r.success) s.clears[q.id] = (s.clears[q.id] ?? 0) + 1;
  if (r.success && q.final) { s.finalCleared = true; notices.push('★ 灰竜を討伐した!街は大騒ぎだ。'); }

  let treat = 0;
  for (const m of members) {
    m.status = 'idle';
    m.expeditions++;
    m.fatigue = Math.max(0, Math.min(100, m.fatigue + (r.fatigue[m.id] ?? 0)));
    const inj = r.injuries[m.id] ?? 0;
    if (inj) {
      m.injuryDays = Math.max(m.injuryDays, inj);
      treat += Math.round(inj * 15 * (1 - 0.25 * (s.facilities.clinic ?? 0)));
      m.loyalty = Math.max(0, m.loyalty - 3);
    }
    if (r.success) m.loyalty = Math.min(100, m.loyalty + 3);
    const ups = addExp(m, r.expGain[m.id] ?? 0);
    if (ups) notices.push(`${m.name}がLv${m.level}に上がった!`);
    for (const t of r.revealedTraits) if (t.advId === m.id) m.traits.find((x) => x.id === t.traitId)!.revealed = true;
    m.kills += Object.values(r.kills).reduce((a, b) => a + b, 0) / members.length;
  }
  if (treat) { s.gold -= treat; ledger(s, `治療費: ${q.name}`, -treat); }
  for (const d of r.relationDeltas) {
    const a = s.adventurers.find((x) => x.id === d.a);
    const b = s.adventurers.find((x) => x.id === d.b);
    if (a && b) addRelation(s.relations, a, b, d.delta);
  }
  // 勘違いの種
  const injured = Object.keys(r.injuries).length;
  if (r.success && !hadSuccess) tags.push('return_first_success');
  if (r.retreated && !injured) tags.push('return_retreat_safe');
  if (r.success && !injured && members.length >= 3) tags.push('return_success_clean');
  if (r.success && partyPower(members) < AREA[q.area].recommended * (members.length / 4) * 0.8) tags.push('return_underdog');
  s.history.unshift(r);
  if (s.history.length > 40) s.history.length = 40;
  notices.push(`${members.map((m) => m.name).join('・')}が帰還: ${q.name}(${r.success ? '成功' : r.retreated ? '撤退' : r.wiped ? '全滅' : '未達成'})`);
}

export function advanceDay(s: GameState): DayReport {
  const block = dayAdvanceBlock(s);
  if (block) {
    // A blocked turn is a true no-op.  Hosts can render the returned notice
    // without accidentally persisting a second copy in the save log.
    return { day: s.day, returned: [], scenes: [], notices: [block], expenses: [], charEvents: [] };
  }

  const notices: string[] = [];
  const expenses: { label: string; amount: number }[] = [];
  const tags = [...s.pendingTags];
  s.pendingTags = [];

  // 休息の勘違い: 疲れた冒険者を休ませた日
  if (s.adventurers.some((a) => a.status === 'idle' && a.fatigue >= 70 && a.injuryDays === 0)) tags.push('rest_tired');
  if (!s.dispatchedToday && !s.hiredToday && s.expeditions.length === 0) tags.push('day_idle');

  // 給与・維持費
  const wages = s.adventurers.reduce((t, a) => t + a.salary, 0);
  s.gold -= wages + UPKEEP_PER_DAY;
  ledger(s, '日給(全冒険者)', -wages);
  ledger(s, 'ギルド維持費', -UPKEEP_PER_DAY);
  expenses.push({ label: '日給', amount: -wages }, { label: '維持費', amount: -UPKEEP_PER_DAY });

  // For days 1-5 the city provides a transparent, one-time operating grant.
  // It is recorded in both the ledger and report, and the paid-day list makes
  // the rule safe across save/load or a host retrying the same command.
  if (isCampaignMode(s) && s.day <= CAMPAIGN_SUPPORT_DAYS) {
    const paid = s.campaign!.supportPaidDays ?? (s.campaign!.supportPaidDays = []);
    if (!paid.includes(s.day)) {
      s.gold += CAMPAIGN_SUPPORT_AMOUNT;
      paid.push(s.day);
      ledger(s, `初期支援金(運営費補填 ${s.day}/${CAMPAIGN_SUPPORT_DAYS}日目)`, CAMPAIGN_SUPPORT_AMOUNT);
      expenses.push({ label: '初期支援金', amount: CAMPAIGN_SUPPORT_AMOUNT });
    }
  }
  if (s.gold < 0) {
    const interest = Math.ceil(-s.gold * 0.02);
    s.gold -= interest;
    ledger(s, '借金の利息', -interest);
    s.debt = true;
    s.rep = Math.max(0, s.rep - 1);
    for (const a of s.adventurers) a.loyalty = Math.max(0, a.loyalty - 4);
    notices.push('資金がマイナスです。借金の利息がかかり、冒険者の忠誠度と評判が下がりました。');
  } else s.debt = false;

  s.day++;

  // 帰還
  const returning = s.expeditions.filter((e) => e.returnDay <= s.day);
  s.expeditions = s.expeditions.filter((e) => e.returnDay > s.day);
  for (const r of returning) applyReturn(s, r, notices, tags);
  // Returns can repay an overnight deficit or create one through treatment.
  s.debt = s.gold < 0;

  // 回復(派遣に出ていなかった冒険者)
  const returnedIds = new Set(returning.flatMap((r) => r.partyIds));
  for (const a of s.adventurers) {
    if (a.status !== 'idle' || returnedIds.has(a.id)) continue;
    a.fatigue = Math.max(0, a.fatigue - 25);
    if (a.injuryDays > 0) a.injuryDays--;
  }

  // 辞職
  const quitter = s.adventurers.filter((a) => a.status === 'idle' && a.loyalty < 15 && !a.profile).sort((a, b) => a.loyalty - b.loyalty)[0];
  if (quitter) {
    s.adventurers = s.adventurers.filter((a) => a !== quitter);
    notices.push(`${quitter.name}が「やっていられない」と言い残してギルドを去りました。`);
  }

  // 候補者の入れ替わり
  const expired = s.candidates.filter((c) => c.expiresDay <= s.day);
  s.candidates = s.candidates.filter((c) => c.expiresDay > s.day);
  if (expired.some((c) => c.adv.salary >= 40 || isTalent(c.adv)) && s.gold < 400) tags.push('reject_expensive');
  const arrivals = 1 + (repLevel(s.rep) >= 3 ? 1 : 0) + (rngFor(s.seed, 'arr', s.day).chance(0.4) ? 1 : 0);
  for (let i = 0; i < arrivals && s.candidates.length < MAX_CANDIDATES; i++) spawnCandidate(s, `d${s.day}_${i}`);

  // 評判の節目
  const lv = repLevel(s.rep);
  if (!s.repMilestones.includes(lv)) { s.repMilestones.push(lv); tags.push('rep_milestone'); notices.push(`ギルドの評判が上がりました(${REP_LEVELS[lv - 1]}〜)。応募者の質と数が増えます。`); }

  // 仲間の個人エピソード
  const charEvents = runCharEvents(s);

  // 勘違いイベント解決
  const scenes = resolveScenes(s, tags, rngFor(s.seed, 'scene', s.day));
  for (const sc of scenes) { s.rep += sc.rep; s.scenes.unshift(sc); }
  if (s.scenes.length > 60) s.scenes.length = 60;
  if (scenes.length) {
    const lv2 = repLevel(s.rep);
    if (!s.repMilestones.includes(lv2)) { s.repMilestones.push(lv2); notices.push(`ギルドの評判が上がりました(${REP_LEVELS[lv2 - 1]}〜)。`); }
  }

  s.dispatchedToday = false;
  s.hiredToday = false;
  for (const n of notices) s.notices.unshift({ day: s.day, text: n });
  if (s.notices.length > 80) s.notices.length = 80;
  return { day: s.day, returned: returning, scenes, notices, expenses, charEvents };
}

// ---- 終了判定 ----
export type EndingGrade = 'legend' | 'clear' | 'timeup';
export function endingState(s: GameState): { over: boolean; cleared: boolean } {
  return { over: s.finalCleared || s.day > MAX_DAY, cleared: s.finalCleared };
}

