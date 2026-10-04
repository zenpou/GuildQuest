import { describe, expect, it } from 'vitest';
import { autoplay } from '../src/core/autoplay';
import { newGame, partyPower, changeJob } from '../src/core/game';
import { simulateExpedition } from '../src/core/expedition';
import { rngFor } from '../src/core/rng';
import { QUEST } from '../src/core/data';
import { questRecommendedPower } from '../src/core/readiness';
import { salaryOf } from '../src/core/adventurer';

describe('campaign balance and deadline', () => {
  it('does not advance or dispatch beyond the requested final day', () => {
    for (const maxDays of [1, 2, 5, 27, 30]) {
      const s = autoplay(1, { maxDays });
      expect(s.day).toBeLessThanOrEqual(maxDays);
      expect([...s.history, ...s.expeditions].every(e => e.returnDay <= maxDays)).toBe(true);
    }
  });

  it('a developed guild can usually clear within 30 days, without removing uncertainty', () => {
    const states = Array.from({ length: 40 }, (_, i) => autoplay(i + 1));
    const cleared = states.filter(s => s.finalCleared && s.day <= 30).length;
    expect(cleared).toBeGreaterThanOrEqual(24);
    expect(cleared).toBeLessThanOrEqual(38);
    expect(states.filter(s => s.gold < 0).length).toBeLessThanOrEqual(4);
  });

  it('dragon preparation matters: low levels struggle, trained parties benefit from potions', () => {
    const wins = (level: number, potions: number) => {
      const members = newGame(1).adventurers;
      for (const a of members) { a.level = level; if (a.id === 'c_aldo') a.job = 'ranger'; }
      let count = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const result = simulateExpedition({ rng: rngFor(seed, 'fixed-drake'), questId: 'q_drake', members,
          leaderId: 'c_bruno', policy: 'standard', potions, relations: {}, startDay: 24, expMult: 1, clinicLevel: 0 });
        if (result.success) count++;
      }
      return count;
    };
    expect(wins(3, 6)).toBeLessThanOrEqual(6);
    const unprepared = wins(7, 0);
    const prepared = wins(7, 6);
    expect(prepared).toBeGreaterThanOrEqual(42);
    expect(prepared - unprepared).toBeGreaterThanOrEqual(12);
  });

  it('the final quest has a full-party benchmark higher than ordinary ruins exploration', () => {
    expect(questRecommendedPower(QUEST.q_drake)).toBeGreaterThan(questRecommendedPower(QUEST.q_survey));
  });

  it('quest benchmarks follow measured risk rather than the area average', () => {
    const state = newGame(42);
    changeJob(state, 'c_aldo', 'ranger');
    const starters = partyPower(state.adventurers);
    // Lv1の初期4人は森狼で平均1人以上が負傷する。「適正」(目安の95%)と表示しない。
    expect(starters).toBeLessThan(questRecommendedPower(QUEST.q_wolf) * 0.95);
    expect(starters).toBeGreaterThanOrEqual(questRecommendedPower(QUEST.q_patrol) * 0.95);
    // 遺跡の調査・遺物回収は灰竜よりずっと手前の戦力で安定する。
    expect(questRecommendedPower(QUEST.q_survey)).toBeLessThan(questRecommendedPower(QUEST.q_golem));
    expect(questRecommendedPower(QUEST.q_relic)).toBeLessThan(questRecommendedPower(QUEST.q_drake));
  });

  it('the first hunt is not decided by encounter luck alone', () => {
    const state = newGame(42);
    changeJob(state, 'c_aldo', 'ranger');
    let cleared = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const result = simulateExpedition({ rng: rngFor(seed, 'goblin-standard'), questId: 'q_goblin',
        members: state.adventurers.map(a => structuredClone(a)), leaderId: 'c_bruno', policy: 'standard', potions: 0,
        relations: state.relations, startDay: 2, expMult: 1, clinicLevel: 0 });
      if (result.success) cleared++;
    }
    expect(cleared).toBeGreaterThanOrEqual(75);
  });

  it('wages grow with the party: a trained roster costs more than twice the opening one', () => {
    const state = newGame(42);
    changeJob(state, 'c_aldo', 'ranger');
    const payroll = () => state.adventurers.reduce((total, a) => total + salaryOf(a), 0);
    const opening = payroll();
    for (const a of state.adventurers) a.level = 7;
    expect(payroll()).toBeGreaterThanOrEqual(opening * 2);
    // 日給は疲労で変わらない(疲れているときにLvが上がっても安くならない)
    const rested = payroll();
    for (const a of state.adventurers) a.fatigue = 90;
    expect(payroll()).toBe(rested);
  });

  it('the tutorial-recommended pair meets the herb gathering benchmark', () => {
    const state = newGame(42);
    changeJob(state, 'c_aldo', 'ranger');
    const pair = state.adventurers.filter(a => ['c_aldo', 'c_mina'].includes(a.id));
    expect(partyPower(pair)).toBeGreaterThanOrEqual(questRecommendedPower(QUEST.q_herb));
  });
});
