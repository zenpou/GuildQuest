import { bestJob, powerOf } from './adventurer';
import { QUEST } from './data';
import { advanceDay, buildFacility, capacity, changeJob, dispatch, featureUnlocked, hire, hireFee, newGame, partyPower, unlockedQuests } from './game';
import { relationLabel, getRelation } from './relations';
import { MAX_DAY, type GameState } from './types';
import { AREA } from './data';

/** UIなしで30日を自動プレイする簡易ボット(バランス検証・テスト用)。 */
export function autoplay(seed: number, opts: { verbose?: boolean; maxDays?: number } = {}): GameState {
  const s = newGame(seed);
  const maxDays = opts.maxDays ?? MAX_DAY;
  while (s.day < maxDays && !s.finalCleared) {
    // 転職: 適性が20以上高い職業があれば変更
    for (const a of s.adventurers) if (a.status === 'idle') {
      const b = bestJob(a);
      if (a.apt[b] - a.apt[a.job] >= 20) changeJob(s, a.id, b);
    }
    // 雇用: 余裕があれば強い候補を雇う
    if (featureUnlocked(s, 'recruit') && s.adventurers.length < capacity(s)) {
      const best = [...s.candidates].sort((x, y) => powerOf(y.adv, bestJob(y.adv)) - powerOf(x.adv, bestJob(x.adv)))[0];
      if (best && s.gold > hireFee(best.adv) + 250 && s.adventurers.length < 8) { changeJob(s, best.adv.id, bestJob(best.adv)); hire(s, best.adv.id); changeJob(s, best.adv.id, bestJob(best.adv)); }
    }
    // 施設
    if (featureUnlocked(s, 'facility') && s.gold > 700 && (s.facilities.training ?? 0) < 1) buildFacility(s, 'training');
    else if (featureUnlocked(s, 'facility') && s.gold > 900 && (s.facilities.dorm ?? 0) < 1) buildFacility(s, 'dorm');
    else if (featureUnlocked(s, 'facility') && s.gold > 1000 && (s.facilities.clinic ?? 0) < 1) buildFacility(s, 'clinic');
    // 派遣(最大2隊)
    for (let party = 0; party < 2; party++) {
      const idle = s.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0 && a.fatigue < 60).sort((a, b) => powerOf(b) - powerOf(a));
      if (idle.length < 2) break;
      const quests = unlockedQuests(s).filter((q) => q.days <= maxDays - s.day);
      // 最も報酬の高い「勝てそうな」依頼
      let pick = null as null | { q: (typeof quests)[number]; members: typeof idle };
      const members = party === 0 ? idle.slice(0, 4) : idle.slice(0, 4);
      const p = partyPower(members);
      const cands = quests.filter((q) => {
        // A final boss attempt with one or two people is technically valid,
        // but it makes a regression run depend on an unlucky retreat.  Wait
        // until the bot can exercise the complete party path instead.
        if (q.final) return members.length >= 4 && p >= AREA[q.area].recommended;
        return p >= AREA[q.area].recommended * (members.length / 4) * (q.type === 'boss' ? 1.0 : 0.9);
      });
      cands.sort((a, b) => b.reward / b.days - a.reward / a.days);
      if (cands[0]) pick = { q: cands[0], members };
      else {
        const easy = quests.filter((q) => q.area === 'forest').sort((a, b) => b.reward / b.days - a.reward / a.days)[0];
        if (easy) pick = { q: easy, members };
      }
      if (!pick) break;
      const leader = [...pick.members].sort((a, b) => b.level - a.level)[0];
      const potions = pick.q.type === 'boss' || pick.q.area === 'ruins' ? 3 : 0;
      const r = dispatch(s, { questId: pick.q.id, memberIds: pick.members.map((m) => m.id), leaderId: leader.id, policy: 'standard', potions: Math.max(0, Math.min(potions, Math.floor(s.gold / 30))) });
      if (!r.ok) break;
      if (opts.verbose) console.log(`D${s.day} 派遣 ${QUEST[pick.q.id].name} [${pick.members.map((m) => m.name + 'Lv' + m.level).join(',')}] P=${p}`);
    }
    const rep = advanceDay(s);
    if (opts.verbose) for (const r of rep.returned) console.log(`  D${rep.day} 帰還 ${QUEST[r.questId].name}: ${r.success ? '成功' : r.retreated ? '撤退' : r.wiped ? '全滅' : '失敗'} +${r.questGold + r.lootGold + r.materialGold}G 負傷${Object.keys(r.injuries).length} 所持${s.gold}G 評判${s.rep}`);
  }
  void relationLabel; void getRelation;
  return s;
}
