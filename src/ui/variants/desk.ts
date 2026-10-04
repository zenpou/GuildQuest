import { dailyCost } from '../../core/game';
import { REP_NAMES, repLevel } from '../../core/scenes';
import { MAX_DAY } from '../../core/types';
import { div, h, span } from '../dom';
import { clickable, go, nextDay, askRestart, state, ui, viewDispatch, viewFacility, viewFinance, viewHome, viewLog, viewRecruit, viewRoster, type Tab } from '../shared';
import type { Variant } from './types';
import { tabUnlocked } from '../shared';
import './desk.css';

/** A案「管理卓」: 情報密度重視のタブ式ダッシュボード。操作回数が最も少ない。 */
export const desk: Variant = {
  id: 'desk',
  name: 'A 管理卓',
  desc: '情報量重視のタブ式管理画面。派遣は3カラムで1画面完結。',
  render() {
    const idleCount = state.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0).length;
    const dayLabel = state.day > MAX_DAY ? `${state.day}日目（延長）` : `${state.day}/${MAX_DAY}日目`;
    const header = div('header desk-header',
      div('desk-brand',
        span('desk-brand-mark', '⚔'),
        div('desk-brand-copy', span('desk-kicker', 'GUILD QUEST'), span('desk-title', '管理卓'))),
      div('desk-stats',
        div('desk-stat', span('desk-stat-label', '日数'), span('desk-stat-value', dayLabel)),
        div('desk-stat', span('desk-stat-label', '資金'), span(`desk-stat-value ${state.gold < 0 ? 'bad' : ''}`, `${state.gold}G`)),
        div('desk-stat', span('desk-stat-label', '評判'), span('desk-stat-value', `${REP_NAMES[repLevel(state.rep) - 1]} (${state.rep})`)),
        div('desk-stat', span('desk-stat-label', '1日の支出'), span('desk-stat-value', `${dailyCost(state)}G`))),
      div('desk-actions',
        h('button', { class: 'desk-secondary', title: '現在のセーブを破棄して最初から始める', onclick: askRestart }, '最初から'),
        h('button', { class: 'primary desk-next', onclick: nextDay }, '次の日へ ▶')));
    const tabs: [Tab, string, number?][] = [['home', 'ホーム'], ['roster', '冒険者'], ['dispatch', '派遣', idleCount], ['log', '冒険ログ'], ['recruit', '募集', state.candidates.length], ['facility', '施設'], ['finance', '財務']];
    const tabBar = div('tabs desk-tabs', ...tabs.filter(([id]) => tabUnlocked(id)).map(([id, label, n]) => {
      const badgeDescription = id === 'dispatch' ? `待機中の冒険者 ${n ?? 0}人` : undefined;
      return h('button', {
        class: `tab ${ui.tab === id ? 'active' : ''}`,
        title: badgeDescription,
        'aria-label': badgeDescription ? `${label}（${badgeDescription}）` : undefined,
        onclick: () => go(id),
      }, label, n ? span('badge', n) : null);
    }));
    const view = { home: viewHome, roster: viewRoster, dispatch: viewDispatch, log: viewLog, recruit: viewRecruit, facility: viewFacility, finance: viewFinance }[ui.tab]();
    return [header, tabBar, div('main desk-main', view)];
  },
};
