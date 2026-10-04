import type { GameState } from './types';

/** Fill newly added presentation progress without restarting an existing campaign. */
export function migrateCampaignSave(s: GameState): GameState {
  if (s.campaign?.version === 1) {
    s.campaign.seenChapters ??= [];
    s.campaign.prologueSeen ??= s.day > 1 || s.campaign.introComplete || s.campaign.seenChapters.length > 0;
  }
  return s;
}
