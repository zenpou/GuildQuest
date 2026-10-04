import { AREA } from './data';
import type { QuestDef } from './types';

/**
 * Quest-specific benchmark for a full party; fewer adventurers do not make
 * an enemy weaker.  Quests whose real risk differs from their area average
 * (wolves hit harder than the forest suggests, ruins surveys are gentler than
 * the dragon next door) carry their own measured value in quests.json.
 */
export function questRecommendedPower(quest: QuestDef): number {
  if (quest.recommended) return quest.recommended;
  return Math.round(AREA[quest.area].recommended * (quest.type === 'boss' ? 1.1 : 1));
}
