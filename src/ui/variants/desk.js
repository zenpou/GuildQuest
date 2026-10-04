import { dailyCost } from '../../core/game';
import { REP_NAMES, repLevel } from '../../core/scenes';
import { MAX_DAY } from '../../core/types';
import { div, h, span } from '../dom';
import { go, nextDay, askRestart, state, ui, viewDispatch, viewFacility, viewFinance, viewHome, viewLog, viewRecruit, viewRoster } from '../shared';
import { tabUnlocked } from '../shared';
/** A案「管理卓」: 情報密度重視のタブ式ダッシュボード。操作回数が最も少ない。 */
export const desk = {
    id: 'desk',
    name: 'A 管理卓',
    desc: '情報量重視のタブ式管理画面。派遣は3カラムで1画面完結。',
    render() {
        const idleCount = state.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0).length;
        const header = div('header', span('title', '⚔ ギルドクエスト'), span('stat', `📅 ${Math.min(state.day, MAX_DAY)}/${MAX_DAY}日目${state.day > MAX_DAY ? '(延長)' : ''}`), span('stat', '💰 ', h('b', { class: state.gold < 0 ? 'bad' : '' }, `${state.gold}G`)), span('stat', `⭐ ${REP_NAMES[repLevel(state.rep) - 1]}(${state.rep})`), span('stat dim small', `日給計 ${dailyCost(state)}G`), span('spacer'), h('button', { onclick: askRestart }, '最初から'), h('button', { class: 'primary', onclick: nextDay }, '次の日へ ▶'));
        const tabs = [['home', 'ホーム'], ['roster', '冒険者'], ['dispatch', '派遣', idleCount], ['log', '冒険ログ'], ['recruit', '募集', state.candidates.length], ['facility', '施設'], ['finance', '財務']];
        const tabBar = div('tabs', ...tabs.filter(([id]) => tabUnlocked(id)).map(([id, label, n]) => h('button', { class: `tab ${ui.tab === id ? 'active' : ''}`, onclick: () => go(id) }, label, n ? span('badge', n) : null)));
        const view = { home: viewHome, roster: viewRoster, dispatch: viewDispatch, log: viewLog, recruit: viewRecruit, facility: viewFacility, finance: viewFinance }[ui.tab]();
        return [header, tabBar, div('main', view)];
    },
};
