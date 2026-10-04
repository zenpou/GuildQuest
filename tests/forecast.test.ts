import { describe, expect, it } from 'vitest';
import { changeJob, dispatch, newGame } from '../src/core/game';
import { forecastExpedition, forecastVerdict, type Forecast, type ForecastInput } from '../src/core/readiness';
import type { GameState } from '../src/core/types';

const plan = (s: GameState, questId: string, over: Partial<ForecastInput> = {}): ForecastInput => ({
  questId, members: s.adventurers, leaderId: 'c_bruno', policy: 'standard', potions: 0,
  relations: s.relations, expMult: 1, clinicLevel: 0, ...over,
});
const trained = (level: number) => {
  const s = newGame(7);
  changeJob(s, 'c_aldo', 'ranger');
  for (const a of s.adventurers) a.level = Math.max(a.level, level);
  return s;
};

describe('派遣前の試算', () => {
  it('同じ編成なら同じ結果を返し、セーブにも実際の派遣結果にも影響しない', () => {
    const s = trained(1);
    const before = structuredClone(s);
    const first = forecastExpedition(plan(s, 'q_patrol'));
    expect(forecastExpedition(plan(s, 'q_patrol'))).toEqual(first);
    expect(s).toEqual(before);

    const untouched = trained(1);
    const order = { questId: 'q_herb', memberIds: ['c_aldo', 'c_mina'], leaderId: 'c_aldo', policy: 'standard', potions: 0 };
    expect(dispatch(s, order)).toEqual(dispatch(untouched, order));
  });

  it('割合の合計は1になる', () => {
    const f = forecastExpedition(plan(trained(3), 'q_golem'));
    expect(f.success + f.timeout + f.retreat + f.wipe).toBeCloseTo(1);
  });

  it('戦力の合計では見えない条件を反映する', () => {
    // 方針: 討伐は「強敵優先」で遭遇が増える
    const s = trained(3);
    expect(forecastExpedition(plan(s, 'q_wolf', { policy: 'hunt' })).success)
      .toBeGreaterThan(forecastExpedition(plan(s, 'q_wolf')).success + 0.1);
    // 採取: 戦力は低くても薬草に強い2人のほうが集められる
    const starters = trained(1);
    const pick = (...ids: string[]) => starters.adventurers.filter((a) => ids.includes(a.id));
    expect(forecastExpedition(plan(starters, 'q_herb', { members: pick('c_aldo', 'c_mina'), leaderId: 'c_aldo' })).success)
      .toBeGreaterThan(forecastExpedition(plan(starters, 'q_herb', { members: pick('c_lina', 'c_bruno') })).success + 0.1);
    // 回復薬: 育った隊ほど最終戦で効く
    const veterans = trained(7);
    expect(forecastExpedition(plan(veterans, 'q_drake', { potions: 6 })).success)
      .toBeGreaterThan(forecastExpedition(plan(veterans, 'q_drake')).success + 0.2);
  });

  it('判定は成功率だけでなく負傷の多さも見る', () => {
    const f = (success: number, injuries: number): Forecast => ({ samples: 80, success, timeout: 1 - success, retreat: 0, wipe: 0, injuries });
    expect(forecastVerdict(f(0.95, 0.1))).toBe('余裕');
    expect(forecastVerdict(f(0.95, 0.6))).toBe('適正');
    expect(forecastVerdict(f(0.75, 0.2))).toBe('適正');
    expect(forecastVerdict(f(0.75, 1.5))).toBe('厳しい');
    expect(forecastVerdict(f(0.5, 0))).toBe('厳しい');
    expect(forecastVerdict(f(0.2, 0))).toBe('危険');
  });

  it('準備不足の灰竜は危険、初期4人の森の見回りは危険と出さない', () => {
    expect(forecastVerdict(forecastExpedition(plan(trained(3), 'q_drake', { potions: 6 })))).toBe('危険');
    expect(['余裕', '適正']).toContain(forecastVerdict(forecastExpedition(plan(trained(1), 'q_patrol'))));
  });
});
