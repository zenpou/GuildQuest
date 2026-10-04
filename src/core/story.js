import chaptersJson from '../data/campaign-story.json';
import { QUEST } from './data';
export const CHAPTERS = chaptersJson;
export function chapterAvailable(s, c) {
    if (s.day < c.day)
        return false;
    if (c.ending === 'clear')
        return s.finalCleared;
    if (c.ending === 'extension')
        return !s.finalCleared;
    if (s.finalCleared && ['eve', 'ruins'].includes(c.id))
        return false;
    return !c.area || s.history.some(r => r.success && QUEST[r.questId]?.area === c.area);
}
export function pendingChapters(s) {
    if (!s.campaign)
        return [];
    return CHAPTERS.filter(c => chapterAvailable(s, c) && !s.campaign.seenChapters.includes(c.id));
}
/** Reading has no economic side effects; replay cannot farm rewards. */
export function finishChapter(s, id) {
    const c = CHAPTERS.find(c => c.id === id);
    if (!s.campaign || !c || !chapterAvailable(s, c))
        return false;
    if (!s.campaign.seenChapters.includes(id))
        s.campaign.seenChapters.push(id);
    return true;
}
