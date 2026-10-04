import { QUEST } from './data';
/** The version is part of the save data so later tutorial revisions can migrate cleanly. */
export const CAMPAIGN_VERSION = 1;
/**
 * The opening grant covers the fixed guild running cost for the first five
 * operating days.  Quest income and hiring are still needed once the grant
 * ends, so it is a runway rather than an alternate economy.
 */
export const CAMPAIGN_SUPPORT_DAYS = 5;
export const CAMPAIGN_SUPPORT_AMOUNT = 90;
export function createCampaign() {
    return {
        version: CAMPAIGN_VERSION,
        jobChanged: false,
        seenChapters: [],
        introComplete: false,
        supportPaidDays: [],
    };
}
/** Saves without a campaign marker intentionally retain the original rules. */
export function isCampaignMode(s) {
    return s.campaign?.version === CAMPAIGN_VERSION;
}
const FEATURE_DAYS = {
    policy: 3,
    recruit: 4,
    facility: 5,
    finance: 6,
};
/** Legacy saves have every feature available, as they did before the tutorial. */
export function featureUnlocked(s, feature) {
    if (!isCampaignMode(s))
        return true;
    return s.day >= FEATURE_DAYS[feature];
}
/**
 * During the first five days the player learns the guild in a fixed order:
 * herb gathering first, then reputation-gated forest work, and finally all
 * areas.  The quest's own reputation requirement remains authoritative.
 */
export function questUnlocked(s, input) {
    const q = typeof input === 'string'
        ? (Object.prototype.hasOwnProperty.call(QUEST, input) ? QUEST[input] : undefined)
        : input;
    if (!q || s.rep < q.unlockRep)
        return false;
    if (!isCampaignMode(s))
        return true;
    if (s.day <= 1)
        return q.id === 'q_herb';
    if (s.day < 6)
        return q.area === 'forest';
    return true;
}
/**
 * Returns a user-facing reason while the day-one tutorial gate is active.
 * The function is deliberately side-effect free: advanceDay can return this
 * reason in its report while leaving the save byte-for-byte unchanged.
 */
export function dayAdvanceBlock(s) {
    if (!isCampaignMode(s) || s.day !== 1)
        return null;
    if (!s.campaign.jobChanged)
        return 'まずアルドを狩人へ転職させてください。';
    if (!s.campaign.introComplete)
        return 'アルドを含む1隊を薬草採取へ派遣してから日を進めてください。';
    return null;
}
export function tutorialObjective(s) {
    if (!isCampaignMode(s)) {
        return { title: 'ギルドを運営する', text: '依頼を選び、冒険者を派遣してギルドを成長させよう。', tab: 'home' };
    }
    if (!s.campaign.jobChanged) {
        return { title: 'アルドの転職', text: '「冒険者」でアルドの適性を確かめ、狩人に転職しよう。転職は無料で、いつでも戻せます。', tab: 'roster' };
    }
    if (!s.campaign.introComplete) {
        return { title: '最初の依頼', text: '薬草採取を選び、アルドと薬草が得意なミナを派遣しよう。他の仲間も同行できます。', tab: 'dispatch' };
    }
    if (s.day === 1) {
        return { title: '隊の帰還を待つ', text: '派遣隊を送り出した。帰還を待って次の日へ進もう。', tab: 'home' };
    }
    if (s.day === 2) {
        return { title: '森の依頼', text: '評判条件を満たした森の依頼へ派遣しよう。', tab: 'dispatch' };
    }
    if (s.day === 3) {
        return { title: '派遣方針と薬', text: '方針を選び、必要なら回復薬を持たせよう。', tab: 'dispatch' };
    }
    if (s.day === 4) {
        return { title: '空いている椅子', text: '募集が解放されました。候補者の適性と給与を確認しよう。今日は見るだけでも大丈夫。', tab: 'recruit' };
    }
    if (s.day === 5) {
        return { title: '帰る場所を整える', text: '施設が解放されました。今の仲間に何が必要か、強化の効果と費用を見比べよう。', tab: 'facility' };
    }
    if (s.finalCleared) {
        return { title: '灰竜討伐達成', text: '街に平和が戻った。仲間たちの物語を振り返ろう。', tab: 'log' };
    }
    return { title: '灰竜討伐への道', text: '森から坑道、遺跡へ。評判を高め、休養と回復薬を用意して灰竜に挑もう。', tab: 'dispatch' };
}
