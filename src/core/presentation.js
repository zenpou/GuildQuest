/** Authored scene directions. Independent of UI, audio device and save progression. */
export const CHARACTER_IDS = ['yuto', 'aldo', 'mina', 'lina', 'bruno', 'mirei', 'garo'];
export const CHARACTER_NAMES = {
    yuto: 'ユウト', aldo: 'アルド', mina: 'ミナ', lina: 'リナ', bruno: 'ブルーノ', mirei: 'ミレイ', garo: 'ガロ',
};
export function speakerCharacter(speaker) {
    if (speaker === '{name}')
        return 'yuto';
    return CHARACTER_IDS.find(id => CHARACTER_NAMES[id] === speaker);
}
