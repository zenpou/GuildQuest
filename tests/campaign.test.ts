import { describe, expect, it } from 'vitest';
import { autoplay } from '../src/core/autoplay';
import {
  advanceDay, buildFacility, changeJob, dispatch, featureUnlocked, hire, newGame,
  questUnlocked, tutorialObjective,
} from '../src/core/game';
import { QUEST } from '../src/core/data';
import { dayAdvanceBlock } from '../src/core/campaign';

const legacyGame = (seed: number) => {
  const s = newGame(seed);
  delete s.campaign;
  return s;
};

describe('段階チュートリアル', () => {
  it('新規ゲームはcampaignを持ち、日ごとの解放と依頼条件を守る', () => {
    const s = newGame(1);
    expect(s.campaign).toMatchObject({ version: 1, jobChanged: false, seenChapters: [], introComplete: false });
    expect(featureUnlocked(s, 'policy')).toBe(false);
    expect(featureUnlocked(s, 'recruit')).toBe(false);
    expect(featureUnlocked(s, 'facility')).toBe(false);
    expect(featureUnlocked(s, 'finance')).toBe(false);
    expect(questUnlocked(s, QUEST.q_herb)).toBe(true);
    expect(questUnlocked(s, QUEST.q_goblin)).toBe(false);

    s.day = 2;
    expect(questUnlocked(s, QUEST.q_goblin)).toBe(true);
    expect(questUnlocked(s, QUEST.q_ore)).toBe(false);
    s.day = 6;
    expect(featureUnlocked(s, 'policy')).toBe(true);
    expect(featureUnlocked(s, 'recruit')).toBe(true);
    expect(featureUnlocked(s, 'facility')).toBe(true);
    expect(featureUnlocked(s, 'finance')).toBe(true);
    expect(questUnlocked(s, QUEST.q_ore)).toBe(false);
    s.rep = QUEST.q_ore.unlockRep;
    expect(questUnlocked(s, QUEST.q_ore)).toBe(true);
  });

  it('日送りは初回転職と派遣を要求し、初回派遣後にだけ進む', () => {
    const s = newGame(2);
    const before = structuredClone(s);
    const blocked = advanceDay(s);
    expect(blocked.day).toBe(1);
    expect(blocked.notices.length).toBe(1);
    expect(s).toEqual(before);
    expect(dayAdvanceBlock(s)).toBe(blocked.notices[0]);

    expect(dispatch(s, { questId: 'q_herb', memberIds: ['c_aldo'], leaderId: 'c_aldo', policy: 'standard', potions: 0 }).ok).toBe(false);
    expect(changeJob(s, 'c_aldo', 'ranger').ok).toBe(true);
    expect(tutorialObjective(s).tab).toBe('dispatch');
    expect(dispatch(s, { questId: 'q_herb', memberIds: ['c_mina'], leaderId: 'c_mina', policy: 'standard', potions: 0 }).ok).toBe(false);
    const first = dispatch(s, { questId: 'q_herb', memberIds: ['c_aldo', 'c_mina'], leaderId: 'c_aldo', policy: 'standard', potions: 0 });
    expect(first.ok).toBe(true);
    expect(s.campaign?.introComplete).toBe(true);
    expect(dispatch(s, { questId: 'q_herb', memberIds: ['c_lina'], leaderId: 'c_lina', policy: 'standard', potions: 0 }).ok).toBe(false);
    expect(advanceDay(s).day).toBe(2);
  });

  it('初回依頼が失敗してもチュートリアルは進み、負傷は短期で済む', () => {
    const s = newGame(8);
    changeJob(s, 'c_aldo', 'ranger');
    const r = dispatch(s, { questId: 'q_herb', memberIds: ['c_aldo'], leaderId: 'c_aldo', policy: 'standard', potions: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.success).toBe(false);
    expect(s.campaign?.introComplete).toBe(true);
    expect(Object.values(r.value.injuries).every((days) => days <= 1)).toBe(true);
    expect(advanceDay(s).day).toBe(2);
  });

  it('派遣入力の不正値と不正施設は状態を変更しない', () => {
    const s = newGame(3);
    changeJob(s, 'c_aldo', 'ranger');
    const valid = { questId: 'q_herb', memberIds: ['c_aldo'], leaderId: 'c_aldo', policy: 'standard', potions: 0 };
    for (const order of [
      { ...valid, questId: 'missing' },
      { ...valid, memberIds: ['missing'] },
      { ...valid, leaderId: 'missing' },
      { ...valid, policy: 'missing' },
      { ...valid, potions: 1.5 },
      { ...valid, potions: -1 },
    ]) {
      const before = structuredClone(s);
      expect(dispatch(s, order).ok).toBe(false);
      expect(s).toEqual(before);
    }
    const before = structuredClone(s);
    expect(buildFacility(s, 'missing').ok).toBe(false);
    expect(s).toEqual(before);
    expect(buildFacility(s, '__proto__').ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('初期5日分の運営支援を台帳に記録し、旧セーブは従来ルールを使う', () => {
    const s = newGame(4);
    changeJob(s, 'c_aldo', 'ranger');
    expect(dispatch(s, { questId: 'q_herb', memberIds: ['c_aldo'], leaderId: 'c_aldo', policy: 'standard', potions: 0 }).ok).toBe(true);
    for (let i = 0; i < 5; i++) advanceDay(s);
    const grants = s.ledger.filter((x) => x.label.startsWith('初期支援金'));
    expect(grants).toHaveLength(5);
    expect(grants.reduce((n, x) => n + x.amount, 0)).toBe(5 * 90);

    const legacy = legacyGame(4);
    expect(featureUnlocked(legacy, 'finance')).toBe(true);
    expect(dispatch(legacy, { questId: 'q_patrol', memberIds: ['c_aldo'], leaderId: 'c_aldo', policy: 'standard', potions: 0 }).ok).toBe(true);
    expect(hire(legacy, legacy.candidates[0].adv.id).ok).toBe(true);
    expect(buildFacility(legacy, 'dorm').ok).toBe(true);
  });
});

describe('campaign autoplay回帰', () => {
  it('新規から最初の5日を進めてもチュートリアル状態と資金が壊れない', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = autoplay(seed, { maxDays: 5 });
      expect(s.day).toBe(5);
      expect(s.campaign?.jobChanged).toBe(true);
      expect(s.campaign?.introComplete).toBe(true);
      expect(s.ledger.some((x) => x.label.startsWith('初期支援金'))).toBe(true);
      expect(Number.isFinite(s.gold)).toBe(true);
    }
  });

  it('30日自動プレイを複数seedで完走可能な状態まで回す', () => {
    const runs = [];
    for (let seed = 1; seed <= 5; seed++) {
      const s = autoplay(seed, { maxDays: 30 });
      runs.push(s);
      expect(s.day).toBeGreaterThan(5); // finalClear may stop the loop before the 30-day cap
      expect(s.day).toBeLessThanOrEqual(30);
      expect(s.expeditions.every(e => e.returnDay <= 30)).toBe(true);
      expect(s.history.length + s.expeditions.length).toBeGreaterThan(0);
      expect(s.campaign?.introComplete).toBe(true);
      expect(Number.isFinite(s.gold)).toBe(true);
      expect(Number.isFinite(s.rep)).toBe(true);
    }
    expect(runs.some((s) => s.finalCleared)).toBe(true);
  });
});
