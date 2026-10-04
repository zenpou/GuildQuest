import { effectiveStats, attackOf, traitNum } from './adventurer';
import { runCombat, makeEnemies, type Unit } from './combat';
import { AREA, DIALOGUE, ENEMY, EVENTS, ITEM, JOB, PERSONALITY, POLICY, QUEST, TRAIT } from './data';
import { generateOutcomeDialogue, outcomeDialogueKind } from './outcomeDialogue';
import { getRelation, addRelation } from './relations';
import { Rng, rngFor } from './rng';
import type { Adventurer, EventDef, ExpeditionResult, LogEntry, LogKind } from './types';

export interface SimInput {
  rng: Rng;
  questId: string;
  members: Adventurer[];
  leaderId: string;
  policy: string;
  potions: number;
  relations: Record<string, number>;
  startDay: number;
  expMult: number;      // 訓練所などによる経験値倍率
  clinicLevel: number;  // 治療所レベル(負傷日数の軽減)
}

const AREA_ITEM: Record<string, string> = { forest: 'herb', mine: 'ore', ruins: 'relic' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function simulateExpedition(inp: SimInput): ExpeditionResult {
  const { rng, members } = inp;
  const quest = QUEST[inp.questId];
  const area = AREA[quest.area];
  const policy = POLICY[inp.policy];
  const leader = members.find((m) => m.id === inp.leaderId) ?? members[0];
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const rel = { ...inp.relations };
  const potions = { n: inp.potions, used: 0 };

  const units: Unit[] = members.map((m) => {
    const s = effectiveStats(m);
    return {
      id: m.id, name: m.name, side: 'ally', hp: s.hp, maxHp: s.hp, atk: attackOf(s, m.job), def: s.def, spd: s.spd,
      job: m.job, personality: m.personality, skillCd: 1, down: false, magic: JOB[m.job].attackStat === 'mag',
    };
  });
  const unit = (id: string) => units.find((u) => u.id === id)!;
  const stats = Object.fromEntries(members.map((m) => [m.id, effectiveStats(m)]));

  let day = 1;
  const log: LogEntry[] = [];
  const say = (kind: LogKind, text: string) => { if (text) log.push({ day, kind, text }); };

  const res: ExpeditionResult = {
    questId: quest.id, partyIds: members.map((m) => m.id), leaderId: leader.id, policy: policy.id, potions: inp.potions,
    days: quest.days, startDay: inp.startDay, returnDay: inp.startDay + quest.days,
    success: false, retreated: false, wiped: false, log,
    questGold: 0, lootGold: 0, materials: {}, materialGold: 0, injuries: {}, expGain: {}, fatigue: {},
    relationDeltas: [], revealedTraits: [], kills: {}, potionsUsed: 0, repGain: 0,
    names: Object.fromEntries(members.map((m) => [m.id, m.name])), returnDialogue: [],
  };
  for (const m of members) res.fatigue[m.id] = 0;
  const downedEver = new Set<string>();

  const bumpRel = (aId: string, bId: string, d: number, reason: string) => {
    if (aId === bId || !byId[aId] || !byId[bId] || d === 0) return;
    addRelation(rel, byId[aId], byId[bId], d);
    res.relationDeltas.push({ a: aId, b: bId, delta: d, reason });
    say('relation', `${byId[aId].name}と${byId[bId].name}の関係値 ${d > 0 ? '+' : ''}${d}(${reason})`);
  };
  const addFatigue = (n: number) => {
    for (const m of members) res.fatigue[m.id] += Math.round(n * traitNum(m, 'fatigueRate', 1));
  };
  const addMaterial = (item: string, n: number) => {
    if (n > 0) res.materials[item] = (res.materials[item] ?? 0) + n;
  };

  const aliveUnits = () => units.filter((u) => !u.down);
  const avgRatio = () => units.reduce((s, u) => s + (u.down ? 0 : u.hp / u.maxHp), 0) / units.length;
  const pers = (id: string) => PERSONALITY[byId[id].personality];
  const avgPers = (k: 'fightBias' | 'lootBias' | 'retreatBias') => members.reduce((s, m) => s + PERSONALITY[m.personality][k], 0) / members.length;
  const sumPers = (k: 'trapCare') => members.reduce((s, m) => s + PERSONALITY[m.personality][k], 0);
  const maxBy = (k: 'scout' | 'gather') => [...members].sort((a, b) => stats[b.id][k] - stats[a.id][k])[0];
  const luck = members.reduce((s, m) => s + traitNum(m, 'luck'), 0) / members.length;
  const line = (m: Adventurer, ctx: string): string => {
    const arr = DIALOGUE[m.personality]?.[ctx];
    return arr && arr.length ? `${m.name}「${rng.pick(arr)}」` : '';
  };
  const fmt = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
  const randMember = (except?: string) => { const others = members.filter((m) => m.id !== except); return others.length ? rng.pick(others) : members[0]; };
  const hpFinal = (id: string) => unit(id).hp / unit(id).maxHp;

  // ---- 戦闘ヘルパ ----
  const retreatThreshold = () => clamp(policy.retreat + pers(leader.id).retreatBias * 0.6 + (avgFatigue() > 70 ? 0.08 : 0), 0.1, 0.75);
  const avgFatigue = () => members.reduce((s, m) => s + m.fatigue + res.fatigue[m.id], 0) / members.length;

  type Outcome = 'won' | 'lost' | 'fled';
  const fight = (enemyId: string, count: number, canFlee = true): Outcome => {
    const def = ENEMY[enemyId];
    const foes = makeEnemies(def, count);
    say('combat', `敵: ${foes.map((f) => f.name).join('、')}`);
    const r = runCombat(units, foes, {
      rng, say, potions, rel: bumpRel, canFlee, fleeBelow: retreatThreshold() * 0.55,
    });
    for (const [k, v] of Object.entries(r.kills)) res.kills[k] = (res.kills[k] ?? 0) + v;
    for (const id of r.downed) downedEver.add(id);
    addFatigue(4);
    if (r.outcome === 'won') {
      let gold = 0;
      for (let i = 0; i < count; i++) {
        gold += rng.int(def.gold[0], def.gold[1]);
        if (rng.chance(def.loot.chance)) addMaterial(def.loot.item, 1);
      }
      gold = Math.round(gold * policy.goldMult);
      res.lootGold += gold;
      say('combat', `戦闘終了。戦利品を回収した(${gold}G相当)。`);
      for (const u of units) if (u.down) { u.down = false; u.hp = Math.max(1, Math.round(u.maxHp * 0.2)); say('narration', `${u.name}は仲間に担がれ、しばらくして意識を取り戻した。`); }
      // 戦闘後の会話
      const talker = rng.pick(members);
      const t = line(talker, 'battleEnd');
      if (t) say('talk', t);
      // 無事な戦闘で性格由来の小事件
      const caring = members.find((m) => m.personality === 'caring' && hpFinal(m.id) > 0.3);
      const hurtOne = members.find((m) => m.id !== caring?.id && hpFinal(m.id) < 0.5);
      if (caring && hurtOne && rng.chance(0.6)) {
        say('narration', `${caring.name}が${hurtOne.name}の手当てを買って出た。`);
        bumpRel(caring.id, hurtOne.id, 2, '手当てをした');
      }
      const greedy = members.find((m) => m.personality === 'greedy');
      if (greedy && rng.chance(0.25)) {
        const victim = randMember(greedy.id);
        if (victim && victim.personality !== 'greedy') {
          say('talk', line(greedy, 'chest'));
          bumpRel(greedy.id, victim.id, -1, '戦利品を多めにくすねた');
        }
      }
    }
    return r.outcome;
  };

  const pickEnemy = (): { id: string; count: number } => {
    const targetEnemy = quest.type === 'hunt' ? quest.target.enemy : undefined;
    const entry = rng.weighted(area.enemies, (e) => e.weight * (e.id === targetEnemy ? 6 : 1));
    let count = rng.int(entry.group[0], entry.group[1]) + policy.groupBonus;
    if (members.length <= 2) count = Math.max(1, count - 1);
    return { id: entry.id, count };
  };

  // ---- イベント抽選 ----
  const lowRelPairs = () => {
    const out: [Adventurer, Adventurer][] = [];
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) if (getRelation(rel, members[i], members[j]) <= -8) out.push([members[i], members[j]]);
    return out;
  };
  const eventWeight = (e: EventDef): number => {
    if (e.areas && !e.areas.includes(quest.area)) return 0;
    let w = e.weight;
    switch (e.kind) {
      case 'combat': w *= policy.combat * (1 + avgPers('fightBias')) * (quest.type === 'hunt' ? 5 : quest.type === 'gather' ? 0.6 : 1); break;
      case 'treasure': case 'ruin': w *= policy.treasure * (1 + avgPers('lootBias')); break;
      case 'gather': {
        const match = quest.type === 'gather' && quest.target.item === e.params.item;
        w *= policy.treasure * (match ? 12 : 1);
        break;
      }
      case 'lost': w *= (1 + members.reduce((s, m) => s + traitNum(m, 'lostBias'), 0)) / (1 + stats[maxBy('scout').id].scout / 12); break;
      case 'quarrel': w = lowRelPairs().length ? w * (1 + lowRelPairs().length * 0.5) : 0; break;
      case 'cooperate': w *= members.length >= 2 ? 1 : 0; break;
      case 'chat': w *= members.length >= 2 ? 1 : 0; break;
    }
    return w;
  };

  const detectChance = (dc: number, base = 0.35) =>
    clamp(base + (stats[maxBy('scout').id].scout - dc) * 0.03 + sumPers('trapCare') * 0.4 + luck * 0.1, 0.1, 0.95);

  const damageRandom = (range: [number, number]) => {
    const victim = rng.pick(aliveUnits());
    const d = rng.int(range[0], range[1]);
    victim.hp = Math.max(1, victim.hp - d);
    return { victim, d };
  };

  /** 1イベント処理。パーティーが継続不能なら 'end' を返す */
  const runEvent = (e: EventDef): 'ok' | 'end' => {
    const a = maxBy('scout');
    const names = { a: a.name, b: randMember(a.id)?.name ?? a.name, leader: leader.name };
    switch (e.kind) {
      case 'combat': {
        const en = pickEnemy();
        const def = ENEMY[en.id];
        say('event', fmt(rng.pick(e.texts), { ...names, enemy: def.name + (en.count > 1 ? `${en.count}体` : '') }));
        if (!e.params.ambush && rng.chance(clamp(policy.avoid + stats[a.id].scout * 0.01, 0, 0.8)) && policy.avoid > 0) {
          say('narration', `${a.name}の先導で物陰に身を潜め、${def.name}をやり過ごした。`);
          return 'ok';
        }
        if (e.params.ambush) {
          const { victim, d } = damageRandom([5, 10]);
          say('combat', `先制攻撃で${victim.name}が${d}ダメージを受けた。`);
        } else {
          const finder = maxBy('scout');
          say('narration', `${finder.name}が先に気づき、${leader.name}が隊形を整えた。`);
        }
        const o = fight(en.id, en.count);
        if (o === 'lost') { res.wiped = true; return 'end'; }
        if (o === 'fled') { res.retreated = true; return 'end'; }
        return 'ok';
      }
      case 'treasure': {
        say('event', fmt(rng.pick(e.texts), names));
        const greedy = members.find((m) => m.personality === 'greedy');
        const cautious = members.find((m) => m.personality === 'cautious' || m.personality === 'timid');
        if (greedy) say('talk', line(greedy, 'chest'));
        else if (cautious) say('talk', line(cautious, 'chest'));
        const pTrap = e.params.trap * (1 - Math.min(0.7, stats[a.id].scout / 35 + sumPers('trapCare') * 0.5)) * (1 - luck * 0.2);
        const gold = Math.round(rng.int(e.params.gold[0], e.params.gold[1]) * policy.goldMult);
        if (rng.chance(pTrap)) {
          const { victim, d } = damageRandom(e.params.trapDmg);
          say('event', fmt(rng.pick(e.ng!), { ...names, a: victim.name }));
          say('combat', `${victim.name}は${d}ダメージを受けたが、中身は無事だった(${gold}G相当)。`);
          if (greedy && greedy.id !== victim.id) bumpRel(victim.id, greedy.id, -1, '「開けろ」と急かされたことを根に持っている');
        } else {
          say('event', fmt(rng.pick(e.ok!), names) + `(${gold}G相当)`);
        }
        res.lootGold += gold;
        if (rng.chance(e.params.itemChance)) {
          const item = AREA_ITEM[quest.area];
          addMaterial(item, 1);
          say('narration', `さらに${ITEM[item].name}も見つけた。`);
        }
        return 'ok';
      }
      case 'gather': {
        const g = maxBy('gather');
        const item = e.params.item as string;
        say('event', fmt(rng.pick(e.texts), { ...names, a: g.name }));
        const power = stats[g.id].gather * 0.6 + (members.reduce((s, m) => s + stats[m.id].gather, 0) / members.length) * 0.4;
        // 薬草博士がいれば、薬草の採取は成功しやすく量も増える
        const expert = item === 'herb' && members.some((m) => m.traits.some((t) => t.id === 'herbalist'));
        const p = clamp(0.3 + power * 0.025 + luck * 0.1 + (expert ? 0.15 : 0), 0.2, 0.97);
        let qty = rng.int(e.params.qty[0], e.params.qty[1]) + (expert ? 1 : 0);
        if (rng.chance(p)) {
          if (qty > 1 && power >= 22 && rng.chance(0.4)) qty++;
          say('event', `${fmt(rng.pick(e.ok!), names)}(${ITEM[item].name}×${qty})`);
        } else {
          qty = e.params.qty[1] === 1 ? 0 : Math.ceil(qty / 2);
          say('event', `${fmt(rng.pick(e.ng!), { ...names, a: g.name })}(${ITEM[item].name}×${qty})`);
        }
        addMaterial(item, qty);
        return 'ok';
      }
      case 'trap': {
        say('event', fmt(rng.pick(e.texts), names));
        if (rng.chance(detectChance(e.params.dc))) {
          say('event', fmt(rng.pick(e.ok!), names));
        } else {
          const { victim, d } = damageRandom(e.params.dmg);
          say('event', fmt(rng.pick(e.ng!), { ...names, b: victim.name }));
          say('combat', `${victim.name}は${d}ダメージを受けた。`);
          const t = line(byId[victim.id], 'hurt');
          if (t) say('talk', t);
          const cautious = members.find((m) => m.personality === 'cautious' && m.id !== victim.id);
          if (cautious) say('talk', line(cautious, 'blame'));
        }
        addFatigue(2);
        return 'ok';
      }
      case 'lost': {
        say('event', fmt(rng.pick(e.texts), names));
        addFatigue(e.params.fatigue);
        const d = members.find((m) => m.traits.some((t) => t.id === 'directionless'));
        const talker = d ?? rng.pick(members);
        const t = line(talker, 'lost');
        if (t) say('talk', t);
        if (d) {
          const other = randMember(d.id);
          if (other && other.id !== d.id) bumpRel(other.id, d.id, -1, 'また道に迷ったことで');
        }
        return 'ok';
      }
      case 'merchant': {
        say('event', fmt(rng.pick(e.texts), names));
        if (rng.chance(0.5)) {
          potions.n++;
          say('event', '格安で回復薬を一本譲ってもらった。');
        } else {
          const g = rng.int(15, 40);
          res.lootGold += g;
          say('event', `世間話の駄賃として${g}Gもらった。`);
        }
        return 'ok';
      }
      case 'help': {
        say('event', fmt(rng.pick(e.texts), names));
        const caring = members.find((m) => m.personality === 'caring');
        const greedy = members.find((m) => m.personality === 'greedy');
        const gold = rng.int(e.params.gold[0], e.params.gold[1]);
        if (caring) {
          say('talk', `${caring.name}「大丈夫ですか?肩を貸します」`);
          say('event', `${caring.name}が手当てをして、近くの村まで送り届けた。お礼に${gold}Gをもらった。`);
          res.repGain += e.params.rep;
          res.lootGold += gold;
          for (const m of members) if (m.id !== caring.id) bumpRel(m.id, caring.id, 1, `${caring.name}の優しさに触れた`);
        } else if (greedy) {
          say('event', `${greedy.name}は「助けてやるが、謝礼は頂くぞ」と手を差し出した。${Math.round(gold * 1.5)}Gを受け取った。`);
          res.lootGold += Math.round(gold * 1.5);
          const other = randMember(greedy.id);
          if (other.id !== greedy.id) bumpRel(other.id, greedy.id, -1, '助けた相手から金を取ったことで');
        } else {
          say('event', `${leader.name}の指示で手当てをして送り届けた。お礼に${gold}Gをもらった。`);
          res.repGain += e.params.rep;
          res.lootGold += gold;
        }
        addFatigue(2);
        return 'ok';
      }
      case 'ruin': {
        say('event', fmt(rng.pick(e.texts), names));
        const p = clamp(0.4 + stats[a.id].scout * 0.02 + luck * 0.1, 0.2, 0.92);
        if (rng.chance(p)) {
          const gold = Math.round(rng.int(e.params.gold[0], e.params.gold[1]) * policy.goldMult);
          say('event', `${fmt(rng.pick(e.ok!), names)}(${gold}G相当)`);
          res.lootGold += gold;
          if (rng.chance(e.params.itemChance)) {
            addMaterial('relic', 1);
            say('narration', '奥から古代の遺物も見つかった!');
          }
          return 'ok';
        }
        say('event', fmt(rng.pick(e.ng!), names));
        const guardian = quest.area === 'ruins' ? 'sentinel' : 'skeleton';
        const o = fight(guardian, 1);
        if (o === 'lost') { res.wiped = true; return 'end'; }
        if (o === 'fled') { res.retreated = true; return 'end'; }
        return 'ok';
      }
      case 'hidden': {
        say('event', fmt(rng.pick(e.texts), names));
        if (rng.chance(clamp(0.35 + stats[a.id].scout * 0.025, 0.2, 0.9))) {
          say('event', fmt(rng.pick(e.ok!), names));
          for (const m of members) res.fatigue[m.id] -= 5;
          const g = rng.int(10, 30);
          res.lootGold += g;
        } else {
          say('event', fmt(rng.pick(e.ng!), names));
        }
        return 'ok';
      }
      case 'chat': {
        const x = rng.pick(members);
        const y = randMember(x.id);
        const topic = rng.pick<string>(DIALOGUE._chat);
        say('talk', fmt(topic, { a: x.name, b: y.name }));
        const t = line(x, 'camp');
        if (t) say('talk', t);
        const r = getRelation(rel, x, y);
        if (r >= -8) bumpRel(x.id, y.id, 1, '打ち解けた');
        else say('narration', `${y.name}は適当に相づちを打つだけだった。`);
        return 'ok';
      }
      case 'quarrel': {
        const pairs = lowRelPairs();
        const [x, y] = rng.pick(pairs);
        say('talk', fmt(rng.pick(DIALOGUE._quarrel), { a: x.name, b: y.name }));
        say('talk', line(x, 'blame'));
        const peacemaker = members.find((m) => m.personality === 'caring' && m.id !== x.id && m.id !== y.id);
        const heated = x.personality === 'proud' || x.personality === 'greedy' || y.personality === 'proud';
        let d = heated ? -4 : -2;
        if (peacemaker) {
          say('talk', line(peacemaker, 'blame'));
          say('narration', `${peacemaker.name}が間に入り、なんとかその場は収まった。`);
          d = -1;
        } else if (leader.id !== x.id && leader.id !== y.id) {
          say('narration', `${leader.name}が間に入ったが、気まずい空気は残った。`);
        }
        bumpRel(x.id, y.id, d, '言い争いになった');
        addFatigue(2);
        return 'ok';
      }
      case 'cooperate': {
        const x = rng.pick(members);
        const y = randMember(x.id);
        say('talk', fmt(rng.pick(DIALOGUE._coop), { a: x.name, b: y.name }));
        const t = line(y, 'praise');
        if (t) say('talk', t);
        bumpRel(x.id, y.id, pers(x.id).id === 'caring' ? 3 : 2, '助け合った');
        return 'ok';
      }
    }
    return 'ok';
  };

  // ---- 本編 ----
  const stepsPerDay = 3;
  const totalSteps = quest.days * stepsPerDay;
  const questDone = (): boolean => {
    const t = quest.target;
    if (quest.type === 'hunt') return (res.kills[t.enemy!] ?? 0) >= t.n!;
    if (quest.type === 'gather') return (res.materials[t.item!] ?? 0) >= t.n!;
    if (quest.type === 'boss') return (res.kills[t.enemy!] ?? 0) >= 1;
    return false;
  };

  say('narration', `${area.name}へ到着。${leader.name}がリーダーとして「${policy.name}」の方針を告げた。`);
  const leadLine = line(leader, 'camp');
  if (leadLine) say('talk', leadLine);

  let ended = false;
  let completedAll = false;
  for (let step = 0; step < totalSteps && !ended; step++) {
    day = Math.floor(step / stepsPerDay) + 1;
    if (step % stepsPerDay === 0 && step > 0) {
      // 野営
      say('narration', `夜。焚き火を囲んで野営した。`);
      for (const u of units) if (!u.down) u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.25));
      for (const m of members) res.fatigue[m.id] -= 8;
      const x = rng.pick(members);
      const t = line(x, 'camp');
      if (t) say('talk', t);
      if (members.length >= 2 && rng.chance(0.6)) {
        const y = randMember(x.id);
        if (getRelation(rel, x, y) >= -8) bumpRel(x.id, y.id, 1, '夜通し語り合った');
      }
      say('narration', `${day}日目。`);
    }
    // ボス依頼は最終ステップでボス戦
    if (quest.type === 'boss' && step === totalSteps - 1) {
      const boss = ENEMY[quest.target.enemy!];
      say('event', `最奥の間。${boss.name}が、侵入者を見下ろしていた。`);
      const t = line(leader, 'chest');
      if (t) say('talk', t);
      const o = fight(boss.id, 1);
      if (o === 'lost') res.wiped = true;
      else if (o === 'fled') res.retreated = true;
      ended = true;
      break;
    }
    const pool = EVENTS.filter((e) => eventWeight(e) > 0);
    const ev = rng.weighted(pool, eventWeight);
    const r = runEvent(ev);
    if (r === 'end') { ended = true; break; }
    if (questDone() && quest.type !== 'boss') {
      say('result', '依頼の目標を達成した。余計な寄り道はせず、帰路についた。');
      completedAll = true;
      break;
    }
    addFatigue(2);
    // 撤退判断
    if (step < totalSteps - 1 && avgRatio() < retreatThreshold()) {
      const who = [...members].sort((a, b) => pers(b.id).retreatBias - pers(a.id).retreatBias)[0];
      say('narration', `隊の消耗が目立ってきた。${leader.name}が一同を見回した。`);
      say('talk', line(leader, 'retreat') || line(who, 'retreat'));
      const brave = members.find((m) => m.personality === 'brave' && m.id !== leader.id);
      if (brave) {
        say('talk', line(brave, 'retreat'));
      }
      say('result', '撤退を決めた。');
      res.retreated = true;
      ended = true;
    }
  }
  if (!ended && !completedAll) completedAll = true;

  // ---- 判定 ----
  if (res.wiped) {
    say('result', `全員が倒れてしまった……。${members.map((m) => m.name).join('、')}は街の救護隊に運ばれた。`);
  } else if (res.retreated) {
    res.success = false;
    say('result', '依頼は未達成のまま帰還した。');
  } else {
    if (quest.type === 'explore') res.success = completedAll;
    else res.success = questDone();
    say('result', res.success ? `依頼「${quest.name}」を達成!` : `目標に届かず時間切れ。依頼「${quest.name}」は未達成に終わった。`);
  }

  // 納品素材は売却対象から差し引く
  if (res.success && quest.type === 'gather') res.materials[quest.target.item!] -= quest.target.n!;
  for (const [k, v] of Object.entries(res.materials)) res.materialGold += ITEM[k].price * v;
  for (const k of Object.keys(res.materials)) if (res.materials[k] <= 0) delete res.materials[k];
  if (res.success) res.questGold = quest.reward;

  // 絆の深まり
  if (res.success) {
    const d = quest.type === 'boss' ? 3 : 1;
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      addRelation(rel, members[i], members[j], d);
      res.relationDeltas.push({ a: members[i].id, b: members[j].id, delta: d, reason: '依頼を共に達成した' });
    }
    if (members.length > 1) say('relation', `共に依頼を達成し、全員の仲間意識が深まった(関係値 +${d})。`);
  }

  // 負傷
  for (const m of members) {
    const u = unit(m.id);
    let days = 0;
    if (res.wiped) days = rng.int(2, 4);
    else if (downedEver.has(m.id)) days = rng.int(1, 3);
    else if (u.hp / u.maxHp < 0.25) days = 1;
    if (days > 0) {
      days = Math.max(1, days - inp.clinicLevel);
      res.injuries[m.id] = days;
    }
  }
  for (const [id, d] of Object.entries(res.injuries)) say('result', `${byId[id].name}は負傷した(療養${d}日)。`);

  // 経験値
  const killExp = Object.entries(res.kills).reduce((s, [k, n]) => s + ENEMY[k].exp * n, 0);
  for (const m of members) {
    const base = quest.exp * (res.success ? 1 : 0.4) * policy.expMult + killExp / members.length;
    res.expGain[m.id] = Math.max(1, Math.round(base * traitNum(m, 'expRate', 1) * inp.expMult));
  }

  // 特性判明
  for (const m of members) {
    for (const t of m.traits) {
      if (!t.revealed && rng.chance(0.8)) {
        res.revealedTraits.push({ advId: m.id, traitId: t.id });
        say('result', `【発見】${m.name}の特性「${TRAIT[t.id].name}」が判明した。(${TRAIT[t.id].desc})`);
      }
    }
  }

  // 帰還時の一言は探索用RNGから分離する。戦闘や負傷の結果を含むタグを
  // 固定seedへ渡すことで、同じ結果の再読では同じ台詞を使い回せる。
  const kind = outcomeDialogueKind(res);
  const returnTag = JSON.stringify({
    questId: res.questId, partyIds: res.partyIds, leaderId: res.leaderId, policy: res.policy,
    startDay: res.startDay, returnDay: res.returnDay, kind,
    members: members.map((m) => ({ id: m.id, name: m.name, personality: m.personality, character: m.profile?.key })),
    injuries: res.injuries, kills: res.kills, materials: res.materials,
    log: res.log.map((entry) => `${entry.kind}:${entry.text}`),
  });
  const returnDialogue = generateOutcomeDialogue(members, kind, rngFor(0, 'return-dialogue', returnTag));
  res.returnDialogue = returnDialogue;
  for (const line of returnDialogue) say('talk', `${line.name}「${line.text}」`);

  res.potionsUsed = potions.used;
  // 戦闘で消費せず余った薬は持ち帰り(状態には反映しない=消耗品は出発時に消費済み)
  return res;
}
