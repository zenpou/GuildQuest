import { AREA } from './data';
import type { QuestDef } from './types';

/** Quest-specific benchmark; fewer adventurers do not make an enemy weaker. */
export function questRecommendedPower(quest: QuestDef): number {
  // The tutorial explicitly recommends Aldo and Mina for this gentle job.
  if (quest.id === 'q_herb') return 100;
  return quest.final ? 430 : Math.round(AREA[quest.area].recommended * (quest.type === 'boss' ? 1.1 : 1));
}
