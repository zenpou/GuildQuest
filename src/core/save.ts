import { salaryOf } from './adventurer';
import type { GameState } from './types';

/** Fill newly added presentation progress without restarting an existing campaign. */
export function migrateCampaignSave(s: GameState): GameState {
  if (s.campaign?.version === 1) {
    s.campaign.seenChapters ??= [];
    s.campaign.prologueSeen ??= s.day > 1 || s.campaign.introComplete || s.campaign.seenChapters.length > 0;
  }
  // 日給は能力から決まる派生値。計算式を変えても、読み込み時に現行の式へ揃える。
  for (const a of s.adventurers) a.salary = salaryOf(a);
  for (const c of s.candidates ?? []) c.adv.salary = salaryOf(c.adv);
  return s;
}
