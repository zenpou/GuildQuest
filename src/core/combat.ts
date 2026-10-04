import { JOB, PERSONALITY } from './data';
import type { Rng } from './rng';
import type { EnemyDef, LogKind } from './types';

export interface Unit {
  id: string; name: string; side: 'ally' | 'enemy';
  hp: number; maxHp: number; atk: number; def: number; spd: number;
  job?: string; personality?: string; enemy?: EnemyDef;
  skillCd: number; down: boolean; magic?: boolean;
}

export interface CombatCtx {
  rng: Rng;
  say(kind: LogKind, text: string): void;
  potions: { n: number; used: number };
  rel(a: string, b: string, delta: number, reason: string): void;
  /** 戦闘中の撤退しやすさ。平均HP割合がこれを下回ると撤退を試みる */
  fleeBelow: number;
  canFlee: boolean;
}

export interface CombatResult {
  outcome: 'won' | 'lost' | 'fled';
  kills: Record<string, number>;
  rounds: number;
  downed: string[];
}

const alive = (us: Unit[]) => us.filter((u) => !u.down);

export function makeEnemies(def: EnemyDef, count: number): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `e_${def.id}_${i}`, name: count > 1 ? `${def.name}${String.fromCharCode(65 + i)}` : def.name, side: 'enemy',
      hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def, spd: def.spd, enemy: def, skillCd: def.skill ? def.skill.cd : 0, down: false,
    });
  }
  return out;
}

function damage(rng: Rng, atk: number, mult: number, def: number, ignoreDef: number): { dmg: number; crit: boolean } {
  const crit = rng.chance(0.08);
  const raw = atk * mult * (crit ? 1.5 : 1) - def * (1 - ignoreDef) * 0.5;
  return { dmg: Math.max(1, Math.round(raw * rng.range(0.9, 1.1))), crit };
}

function hitChance(att: number, def: number, timidBonus = 0): number {
  return Math.max(0.5, Math.min(0.97, 0.85 + (att - def) * 0.01 - timidBonus));
}

export function runCombat(allies: Unit[], enemies: Unit[], ctx: CombatCtx): CombatResult {
  const { rng, say } = ctx;
  const kills: Record<string, number> = {};
  const downed = new Set<string>();
  const avgRatio = () => allies.reduce((s, u) => s + (u.down ? 0 : u.hp / u.maxHp), 0) / allies.length;

  const ko = (u: Unit) => {
    u.down = true;
    u.hp = 0;
    if (u.side === 'ally') {
      downed.add(u.id);
      say('combat', `${u.name}が倒れた!`);
    } else {
      kills[u.enemy!.id] = (kills[u.enemy!.id] ?? 0) + 1;
      say('combat', `${u.name}を倒した。`);
    }
  };

  let round = 0;
  while (alive(allies).length && alive(enemies).length && round < 30) {
    round++;
    const summary: string[] = [];
    const order = rng
      .shuffle([...alive(allies), ...alive(enemies)])
      .sort((a, b) => b.spd - a.spd);
    const coverUsed = new Set<string>();

    for (const u of order) {
      if (u.down || !alive(allies).length || !alive(enemies).length) continue;
      if (u.side === 'ally') allyAct(u);
      else enemyAct(u);
    }
    if (summary.length) say('combat', `【${round}ターン目】` + summary.join(' / '));

    // 撤退判断
    if (ctx.canFlee && alive(allies).length && alive(enemies).length && avgRatio() < ctx.fleeBelow) {
      const fastest = Math.max(...alive(allies).map((u) => u.spd));
      const chaser = Math.max(...alive(enemies).map((u) => u.spd));
      const p = Math.max(0.35, Math.min(0.9, 0.7 + (fastest - chaser) * 0.03));
      if (rng.chance(p)) {
        say('combat', '撤退を決断。殿をつとめながら、全員でその場を離脱した。');
        return { outcome: 'fled', kills, rounds: round, downed: [...downed] };
      }
      say('combat', '撤退を試みたが、敵に回り込まれて失敗した!');
    }

    function allyAct(u: Unit) {
      const p = PERSONALITY[u.personality!];
      const job = JOB[u.job!];
      const mates = alive(allies);
      // 回復薬
      const weakest = [...mates].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (ctx.potions.n > 0 && weakest.hp / weakest.maxHp < 0.35) {
        ctx.potions.n--;
        ctx.potions.used++;
        const heal = Math.round(weakest.maxHp * 0.45);
        weakest.hp = Math.min(weakest.maxHp, weakest.hp + heal);
        say('combat', weakest === u ? `${u.name}は回復薬を飲んだ(HP+${heal})。` : `${u.name}が${weakest.name}に回復薬を使った(HP+${heal})。`);
        if (weakest !== u) ctx.rel(u.id, weakest.id, 2, `${u.name}が${weakest.name}を回復薬で助けた`);
        return;
      }
      // 回復魔法
      if (job.heal && weakest.hp / weakest.maxHp < 0.5 && rng.chance(0.65)) {
        const heal = Math.round(weakest.maxHp * job.heal.ratio + u.atk * 0.4);
        weakest.hp = Math.min(weakest.maxHp, weakest.hp + heal);
        say('combat', `${u.name}の${job.heal.name}!${weakest === u ? '自分' : weakest.name}のHPが${heal}回復した。`);
        if (weakest !== u) ctx.rel(u.id, weakest.id, 1, `${u.name}が${weakest.name}を癒した`);
        return;
      }
      // 臆病による硬直
      if (p.fightBias <= -0.2 && rng.chance(0.12)) {
        say('combat', `${u.name}は恐怖で足がすくみ、動けなかった。`);
        return;
      }
      const foes = alive(enemies);
      const target =
        p.id === 'brave' && rng.chance(0.5)
          ? [...foes].sort((a, b) => b.maxHp - a.maxHp)[0]
          : rng.chance(0.6)
            ? [...foes].sort((a, b) => a.hp - b.hp)[0]
            : rng.pick(foes);
      const useSkill = u.skillCd <= 0;
      const mult = useSkill ? job.skill.mult : 1;
      const never = useSkill && job.skill.neverMiss;
      const ign = useSkill ? job.skill.ignoreDef : 0;
      if (u.skillCd > 0) u.skillCd--;
      if (useSkill) u.skillCd = job.skill.cd;
      if (!never && !rng.chance(hitChance(u.spd, target.spd))) {
        summary.push(`${u.name}→${target.name}(外れ)`);
        return;
      }
      const { dmg, crit } = damage(rng, u.atk, mult, target.def, ign);
      target.hp -= dmg;
      if (useSkill) say('combat', `${u.name}の${job.skill.name}!${target.name}に${dmg}ダメージ${crit ? '(会心!)' : ''}。`);
      else if (crit) say('combat', `${u.name}の会心の一撃!${target.name}に${dmg}ダメージ。`);
      else summary.push(`${u.name}→${target.name}(-${dmg})`);
      if (target.hp <= 0) ko(target);
    }

    function enemyAct(u: Unit) {
      const def = u.enemy!;
      const mates = alive(allies);
      // 範囲スキル
      if (def.skill?.aoe) {
        if (u.skillCd <= 0) {
          u.skillCd = def.skill.cd;
          say('combat', `${u.name}の${def.skill.name}!全員が炎に包まれた!`);
          for (const t of mates) {
            const { dmg } = damage(rng, u.atk, def.skill.mult, t.def, 0);
            t.hp -= dmg;
            if (t.hp <= 0) ko(t);
          }
          return;
        }
        u.skillCd--;
      }
      let target: Unit;
      if (def.ai === 'weakest') target = [...mates].sort((a, b) => a.hp - b.hp)[0];
      else if (def.ai === 'strongest') target = [...mates].sort((a, b) => b.atk - a.atk)[0];
      else target = rng.pick(mates);

      // 庇う
      const coverer = mates.find((m) => {
        if (m.id === target.id || coverUsed.has(m.id)) return false;
        const cp = PERSONALITY[m.personality!].cover;
        return m.hp / m.maxHp > 0.4 && target.hp / target.maxHp < 0.7 && rng.chance(cp);
      });
      if (coverer) {
        coverUsed.add(coverer.id);
        say('combat', `${coverer.name}が${target.name}をかばって前に出た!`);
        ctx.rel(coverer.id, target.id, 3, `${coverer.name}が${target.name}をかばった`);
        target = coverer;
      }
      if (!rng.chance(hitChance(u.spd, target.spd, PERSONALITY[target.personality!].id === 'timid' ? 0.08 : 0))) {
        summary.push(`${u.name}→${target.name}(回避)`);
        return;
      }
      const { dmg } = damage(rng, u.atk, 1, target.def, 0);
      target.hp -= dmg;
      summary.push(`${u.name}→${target.name}(-${dmg})`);
      if (target.hp <= 0) ko(target);
    }
  }

  const won = alive(enemies).length === 0 && alive(allies).length > 0;
  return { outcome: won ? 'won' : 'lost', kills, rounds: round, downed: [...downed] };
}
