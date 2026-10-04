import { powerOf } from '../../core/adventurer';
import { AREA, JOB, QUEST, QUESTS } from '../../core/data';
import { REP_NAMES, repLevel } from '../../core/scenes';
import { MAX_DAY, PARTY_MAX } from '../../core/types';
import { bar, div, h, span } from '../dom';
import {
  askRestart, clickable, dispatchMembers, go, goButton, nextDay, persTag, policyCard, previewCard, render, state, statusText, toast, traitTags, ui,
  viewFacility, viewFinance, viewHome, viewLog, viewRecruit, viewRoster, type Tab,
} from '../shared';
import type { Variant } from './types';
import { questUnlocked } from '../../core/campaign';
import { tabUnlocked } from '../shared';

const TYPE_LABEL = { gather: '採取', hunt: '討伐', explore: '探索', boss: 'ボス' } as const;
const MORE: [Tab, string][] = [['recruit', '募集'], ['facility', '施設'], ['finance', '財務']];

function stepDots() {
  const labels = ['① 依頼', '② 編成', '③ 方針・確認'];
  return div('pk-steps', ...labels.map((l, i) => clickable(div(`pk-step ${ui.step === i ? 'on' : ''} ${i < ui.step ? 'done' : ''}`, l), () => { if (i === 0 || ui.d.questId) { if (i < 2 || ui.d.members.length) { ui.step = i; render(); } } })));
}

function wizard(): HTMLElement {
  const d = ui.d;
  if (ui.step === 2 && d.members.length === 0) ui.step = 0;
  const members = dispatchMembers();

  if (ui.step === 0) {
    return div(null, stepDots(), ...QUESTS.filter(q => !state.campaign || state.day >= 6 || (state.day === 1 ? q.id === 'q_herb' : q.area === 'forest')).map((q) => {
      const locked = !questUnlocked(state, q);
      const el = div(`card ${locked ? 'locked' : 'click'} ${d.questId === q.id ? 'sel' : ''}`,
        div('row between', h('b', null, q.name), span('gold', `${q.reward}G`)),
        div('small dim', `${AREA[q.area].name} ・${q.days}日 ・${TYPE_LABEL[q.type]}${q.final ? ' ・★最終目標' : ''}`),
        div('small', locked ? `🔒 評判${q.unlockRep}で解放` : q.desc));
      if (!locked) el.addEventListener('click', () => { d.questId = q.id; ui.step = 1; render(); });
      return el;
    }));
  }

  if (ui.step === 1) {
    const q = d.questId ? QUEST[d.questId] : null;
    const avail = state.adventurers.filter((a) => !d.members.includes(a.id));
    return div(null, stepDots(),
      div('card', div('small dim', '依頼'), h('b', null, q?.name ?? '-'), div('small dim', `${q ? AREA[q.area].name : ''}`)),
      div('card', h('h3', null, `編成 ${members.length}/${PARTY_MAX}`),
        members.length === 0 ? div('dim small', '下の一覧から冒険者をタップ') : members.map((a) => div('row between',
          div('row', span(null, a.id === d.leader ? '★' : ''), h('b', null, a.name), span('dim small', `${JOB[a.job].name} 戦力${powerOf(a)}`), persTag(a)),
          div('row', h('button', { disabled: a.id === d.leader, onclick: () => { d.leader = a.id; render(); } }, 'リーダー'), h('button', { onclick: () => { d.members = d.members.filter((x) => x !== a.id); render(); } }, '外す'))))),
      ...avail.map((a) => {
        const un = a.status !== 'idle' || a.injuryDays > 0;
        const el = div(`card ${un ? 'locked' : 'click'}`,
          div('row between', div('row', h('b', null, a.name), span('dim small', `Lv${a.level} ${JOB[a.job].name}`), persTag(a)), span('gold small', `${a.salary}G`)),
          div('row small', un ? span('warn', statusText(a)) : span('dim', `戦力${powerOf(a)}`), span('dim', ' 疲労'), bar(a.fatigue, 100, 'fat')),
          div('small', ...traitTags(a)));
        if (!un) el.addEventListener('click', () => { if (d.members.length >= PARTY_MAX) return toast(`最大${PARTY_MAX}人です`, true); d.members.push(a.id); if (!d.leader) d.leader = a.id; render(); });
        return el;
      }),
      div('pk-actions', h('button', { onclick: () => { ui.step = 0; render(); } }, '← 依頼へ'), h('button', { class: 'primary', disabled: !members.length, onclick: () => { ui.step = 2; render(); } }, '方針へ →')));
  }

  return div(null, stepDots(), previewCard(), policyCard(),
    div('pk-actions', h('button', { onclick: () => { ui.step = 1; render(); } }, '← 編成へ'), goButton('出発させる')));
}

function moreTab(): HTMLElement {
  const cur = MORE.some(([t]) => t === ui.tab && tabUnlocked(t)) ? ui.tab : MORE.find(([t]) => tabUnlocked(t))?.[0] ?? 'recruit';
  const view = { recruit: viewRecruit, facility: viewFacility, finance: viewFinance }[cur as 'recruit' | 'facility' | 'finance']();
  return div(null, div('pk-seg', ...MORE.filter(([t]) => tabUnlocked(t)).map(([t, l]) => h('button', { class: `pk-seg-i ${cur === t ? 'on' : ''}`, onclick: () => go(t) }, l))), view);
}

/** C案「ポケット手帳」: 縦長・片手操作を想定。派遣は3ステップのウィザード、下部ナビ。 */
export const pocket: Variant = {
  id: 'pocket',
  name: 'C ポケット手帳',
  desc: '縦持ち・スマホ想定。下部ナビと3ステップ派遣。1画面1目的で迷わない。',
  render() {
    const t = ui.tab;
    const idle = state.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0).length;
    const body =
      t === 'home' ? viewHome() : t === 'dispatch' ? wizard() : t === 'roster' ? viewRoster() : t === 'log' ? viewLog() : moreTab();
    const more = MORE.find(([tab]) => tabUnlocked(tab));
    const nav: [string, string, Tab, number?][] = [['🏠', 'ホーム', 'home'], ['📜', '派遣', 'dispatch', idle], ['👥', '冒険者', 'roster'], ['📖', 'ログ', 'log']];
    if (more) nav.push(['⋯', 'その他', more[0]]);
    const isActive = (tab: Tab) => (MORE.some(([x]) => x === tab) ? MORE.some(([x]) => x === t) : t === tab);
    return [div('pk-frame',
      div('pk-top', span(null, `📅 ${Math.min(state.day, MAX_DAY)}/${MAX_DAY}`), span('gold', `💰 ${state.gold}G`), h('button', { class: 'pk-reset', onclick: askRestart }, '↺'), span(null, `⭐ ${REP_NAMES[repLevel(state.rep) - 1]}`)),
      div('pk-body', body),
      h('button', { class: 'primary pk-fab', onclick: nextDay }, '次の日へ ▶'),
      div('pk-nav', ...nav.map(([ic, label, tab, n]) => h('button', { class: `pk-nav-i ${isActive(tab) ? 'on' : ''}`, onclick: () => go(tab) }, div('pk-ic', ic, n ? span('hs-badge', n) : null), div('pk-lb', label)))))];
  },
};
