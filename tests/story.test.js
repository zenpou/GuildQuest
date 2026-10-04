import { describe, it, expect } from 'vitest';
import { newGame, changeJob, dispatch, advanceDay } from '../src/core/game';
import { CHAPTERS, chapterAvailable, pendingChapters, finishChapter } from '../src/core/story';
import { dayAdvanceBlock } from '../src/core/campaign';
import { migrateCampaignSave } from '../src/core/save';
describe('物語とプレイの統合', () => {
    it('初期v1の進行済みセーブはプロローグを再表示せず、未開始とlegacyを維持する', () => {
        const s = newGame(7);
        s.day = 4;
        const migrated = migrateCampaignSave(JSON.parse(JSON.stringify(s)));
        expect(migrated.campaign?.prologueSeen).toBe(true);
        expect(migrated.day).toBe(4);
        expect(migrateCampaignSave(newGame(7)).campaign?.prologueSeen).toBe(false);
        delete s.campaign;
        expect(migrateCampaignSave(s).campaign).toBeUndefined();
    });
    it('赤字でも薬なし派遣で収入を得る道を残す', () => {
        const s = newGame(9);
        s.day = 6;
        s.campaign.introComplete = true;
        s.gold = -30;
        const ids = s.adventurers.map(a => a.id);
        const before = structuredClone(s);
        expect(dispatch(s, { questId: 'q_herb', memberIds: ids, leaderId: ids[0], policy: 'standard', potions: 1 }).ok).toBe(false);
        expect(s).toEqual(before);
        expect(dispatch(s, { questId: 'q_herb', memberIds: ids, leaderId: ids[0], policy: 'standard', potions: 0 }).ok).toBe(true);
        expect(s.gold).toBe(-30);
        const result = s.expeditions[0];
        result.questGold = 400;
        result.injuries = {};
        advanceDay(s);
        expect(s.gold).toBeGreaterThan(0);
        expect(s.debt).toBe(false);
    });
    it('プロローグ読了では転職・初回派遣を迂回できない', () => {
        const s = newGame(42);
        s.campaign.prologueSeen = true;
        expect(dayAdvanceBlock(s)).not.toBeNull();
        changeJob(s, 'c_aldo', 'ranger');
        expect(dayAdvanceBlock(s)).not.toBeNull();
        dispatch(s, { questId: 'q_herb', memberIds: ['c_aldo', 'c_mina'], leaderId: 'c_aldo', policy: 'standard', potions: 0 });
        expect(dayAdvanceBlock(s)).toBeNull();
        advanceDay(s);
        expect(s.day).toBe(2);
    });
    it('日数・実際の探索帰還・討伐で章が解放される', () => {
        const s = newGame(3);
        expect(pendingChapters(s).map(c => c.id)).toEqual(['first_desk']);
        const mine = CHAPTERS.find(c => c.id === 'mine');
        s.day = 10;
        s.rep = 100;
        expect(chapterAvailable(s, mine)).toBe(false);
        changeJob(s, 'c_aldo', 'ranger');
        // Story conditions depend on claimed return history, never undisclosed dispatch results.
        s.campaign.introComplete = true;
        const r = dispatch(s, { questId: 'q_safety', memberIds: s.adventurers.map(a => a.id), leaderId: 'c_aldo', policy: 'standard', potions: 0 });
        expect(r.ok).toBe(true);
        if (!r.ok)
            return;
        r.value.success = true;
        expect(chapterAvailable(s, mine)).toBe(false);
        advanceDay(s);
        advanceDay(s);
        expect(chapterAvailable(s, mine)).toBe(true);
        expect(chapterAvailable(s, CHAPTERS.find(c => c.id === 'homecoming'))).toBe(false);
        s.finalCleared = true;
        expect(chapterAvailable(s, CHAPTERS.find(c => c.id === 'homecoming'))).toBe(true);
    });
    it('既読とプロローグは保存後も維持、再読で報酬は増えない', () => {
        const s = newGame(1);
        s.campaign.prologueSeen = true;
        expect(finishChapter(s, 'homecoming')).toBe(false);
        expect(finishChapter(s, 'first_desk')).toBe(true);
        const snapshot = structuredClone(s);
        finishChapter(s, 'first_desk');
        expect(s).toEqual(snapshot);
        const restored = JSON.parse(JSON.stringify(s));
        expect(restored.campaign.prologueSeen).toBe(true);
        expect(pendingChapters(restored)).toEqual([]);
        delete restored.campaign;
        expect(pendingChapters(restored)).toEqual([]);
    });
    it('期限超過後も討伐エンドに到達でき、終了前スチルを先出ししない', () => {
        const s = newGame(8);
        s.day = 31;
        expect(pendingChapters(s).some(c => c.id === 'extension')).toBe(true);
        s.finalCleared = true;
        expect(pendingChapters(s).some(c => c.id === 'extension')).toBe(false);
        expect(pendingChapters(s).some(c => c.id === 'homecoming')).toBe(true);
        expect(CHAPTERS.filter(c => c.art === 'ruins-vow').map(c => c.id)).toEqual(['homecoming']);
        expect(new Set(CHAPTERS.map(c => c.id)).size).toBe(CHAPTERS.length);
    });
});
