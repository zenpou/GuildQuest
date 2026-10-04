import chaptersJson from '../data/campaign-story.json';
import { QUEST } from './data';
import type { GameState } from './types';
import type { PresentedLine } from './presentation';

export interface StoryChapter {
  id: string; title: string; day: number; art: string;
  area?: string; ending?: string;
  lines: PresentedLine[];
}
export const CHAPTERS = chaptersJson as StoryChapter[];
export function chapterAvailable(s: GameState, c: StoryChapter): boolean {
  if (s.day < c.day) return false;
  if (c.ending === 'clear') return s.finalCleared;
  if (c.ending === 'extension') return !s.finalCleared;
  if (s.finalCleared && ['eve', 'ruins'].includes(c.id)) return false;
  return !c.area || s.history.some(r => r.success && QUEST[r.questId]?.area === c.area);
}
export function pendingChapters(s: GameState): StoryChapter[] {
  if (!s.campaign) return [];
  return CHAPTERS.filter(c => chapterAvailable(s, c) && !s.campaign!.seenChapters.includes(c.id));
}
/** Reading has no economic side effects; replay cannot farm rewards. */
export function finishChapter(s: GameState, id: string): boolean {
  const c = CHAPTERS.find(c => c.id === id);
  if (!s.campaign || !c || !chapterAvailable(s, c)) return false;
  if (!s.campaign.seenChapters.includes(id)) s.campaign.seenChapters.push(id);
  return true;
}
