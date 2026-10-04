import { powerOf } from '../../core/adventurer';
import { QUEST } from '../../core/data';
import { dailyCost } from '../../core/game';
import { REP_NAMES, repLevel } from '../../core/scenes';
import { MAX_DAY } from '../../core/types';
import { div, h, span } from '../dom';
import { clickable, nextDay, pname, render, askRestart, state, statusText, ui, viewDispatch, viewFacility, viewFinance, viewLog, viewRecruit, viewRoster, type Tab } from '../shared';
import type { Variant } from './types';
import { campaignHeader, go, tabUnlocked } from '../shared';

const JOB_ICON: Record<string, string> = { fighter: '⚔', ranger: '🏹', mage: '🔮' };
const PERS_ICON: Record<string, string> = { cautious: '🛡', brave: '🔥', greedy: '💰', caring: '💗', proud: '👑', timid: '💧' };

const PANELS: Record<string, { title: string; view: () => HTMLElement }> = {
  dispatch: { title: '📜 依頼掲示板 — 派遣', view: viewDispatch },
  recruit: { title: '🛎 受付 — 冒険者募集', view: viewRecruit },
  log: { title: '📚 書庫 — 冒険ログ', view: viewLog },
  roster: { title: '🛏 宿舎 — 冒険者', view: viewRoster },
  facility: { title: '🔨 工房 — 施設', view: viewFacility },
  finance: { title: '🗝 帳場 — 財務', view: viewFinance },
};

function open(tab: Tab) { go(tab); }

function hotspot(cls: string, icon: string, label: string, tab: Tab, badge?: number) {
  if (!tabUnlocked(tab)) return div(`hs ${cls} locked`, div('hs-icon', '🔒'), div('hs-label', '研修で順に解放'));
  return clickable(div(`hs ${cls}`, div('hs-icon', icon), div('hs-label', label), badge ? span('hs-badge', badge) : null), () => open(tab));
}

/** B案「ギルドホール」: 拠点を1枚のシーンとして見せ、設備を押して各画面を開く。 */
export const hall: Variant = {
  id: 'hall',
  name: 'B ギルドホール',
  desc: '拠点の風景がホーム。掲示板・受付・書庫などを押して開く。冒険者が館内を歩き回る。',
  render() {
    const idle = state.adventurers.filter((a) => a.status === 'idle');
    const away = state.adventurers.filter((a) => a.status === 'away');
    const night = state.day % 2 === 0;
    const recent = state.scenes[0];
    const newLogs = state.history.filter((r) => r.returnDay >= state.day - 1).length;

    const avatars = idle.map((a, i) => {
      const x = 12 + ((i * 37) % 72);
      const y = 58 + ((i * 23) % 28);
      const hurt = a.injuryDays > 0;
      return clickable(div(`avatar ${hurt ? 'hurt' : ''} job-${a.job}`, { style: `left:${x}%;top:${y}%;animation-delay:${(i % 5) * 0.4}s` },
        div('av-body', JOB_ICON[a.job], span('av-pers', PERS_ICON[a.personality])),
        div('av-name', a.name), hurt ? div('av-tag', '🩹') : a.fatigue >= 70 ? div('av-tag', '💤') : null),
      () => { ui.selAdv = a.id; open('roster'); });
    });

    const scene = div('hall-scene',
      div('hall-wall'), div('hall-floor'),
      div('hall-window', div(night ? 'moon' : 'sun')),
      div('hall-banner', 'ギルド'),
      hotspot('hs-board', '📜', '依頼掲示板', 'dispatch', idle.filter((a) => a.injuryDays === 0).length),
      hotspot('hs-desk', '🛎', '受付(募集)', 'recruit', state.candidates.length),
      hotspot('hs-shelf', '📚', '書庫(ログ)', 'log', newLogs),
      hotspot('hs-bed', '🛏', '宿舎', 'roster'),
      hotspot('hs-forge', '🔨', '工房(施設)', 'facility'),
      hotspot('hs-safe', '🗝', '帳場(財務)', 'finance'),
      div('hs hs-door', div('hs-icon', '🚪'), div('hs-label', '出発口'),
        ...state.expeditions.map((e) => div('door-row', `${QUEST[e.questId].name} → ${e.returnDay}日目`))),
      ...avatars,
      away.length ? div('away-note', `🏕 派遣中: ${away.map((a) => a.name).join('・')}`) : null);

    const ticker = div('ticker',
      recent
        ? [span('ticker-h', '💬 街の噂'), div(null, recent.lines[0]), div('ticker-t', `${pname()}: ${recent.thought}`)]
        : [span('ticker-h', '💬 '), span(null, 'ギルドは今日も平和だ。(まだ誰も'+pname()+'を誤解していない)')]);

    const bar = div('hall-bar',
      span('title', '🏰 ギルドホール'),
      span('stat', `📅 ${Math.min(state.day, MAX_DAY)}/${MAX_DAY}日`),
      span('stat', `💰 ${state.gold}G`),
      span('stat', `⭐ ${REP_NAMES[repLevel(state.rep) - 1]}`),
      span('stat dim small', `日給計${dailyCost(state)}G`),
      span('spacer'),
      h('button', { onclick: askRestart }, '最初から'),
      h('button', { class: 'primary', onclick: nextDay }, '☀ 次の日へ'));

    const roster = div('hall-roster', ...state.adventurers.map((a) => clickable(
      div('chip', span(null, JOB_ICON[a.job]), a.name, span('dim small', ` Lv${a.level} ${statusText(a)} 戦力${powerOf(a)}`)),
      () => { ui.selAdv = a.id; open('roster'); })));

    const nodes: HTMLElement[] = [bar, div('hall-main', campaignHeader(), scene, ticker, roster)];
    if (ui.panel && PANELS[ui.panel]) {
      const p = PANELS[ui.panel];
      const close = () => { ui.panel = null; render(); };
      nodes.push(div('drawer-wrap', clickable(div('drawer-bg'), close),
        div(`drawer ${ui.panel === 'dispatch' ? 'wide' : ''}`, div('drawer-head', h('h2', null, p.title), h('button', { onclick: close }, '✕ 閉じる')), p.view())));
    }
    return nodes;
  },
};
