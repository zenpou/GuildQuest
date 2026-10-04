import { bestJob, effectiveStats, growthRank, powerOf, rankOf, traitDefs } from '../core/adventurer';
import STORY_JSON from '../data/story-prologue.json';
import { dayAdvanceBlock, featureUnlocked, questUnlocked, tutorialObjective } from '../core/campaign';
import { CHAPTERS, chapterAvailable, finishChapter, pendingChapters, type StoryChapter } from '../core/story';
import { migrateCampaignSave } from '../core/save';
import { CHARACTER_IDS, CHARACTER_NAMES, type CharacterId, type PresentedLine } from '../core/presentation';
import { createStoryPlayer } from './storyPlayer';
import { AREA, CHAR_EVENTS, FACILITIES, JOBS, PERSONALITIES, PERSONALITY, POLICIES, POLICY, PROTAGONIST, QUEST, QUESTS, JOB, TRAIT, ITEM } from '../core/data';
import {
  advanceDay, buildFacility, capacity, changeJob, dailyCost, dismiss, dispatch, facilityCost, hire, hireFee, newGame,
  partyPower, type DayReport,
} from '../core/game';
import { getRelation, relationLabel, relationMark } from '../core/relations';
import { REP_NAMES, repLevel } from '../core/scenes';
import { MAX_DAY, PARTY_MAX, POTION_PRICE, STAT_KEYS, STAT_LABEL, UPKEEP_PER_DAY, type Adventurer, type ExpeditionResult, type GameState } from '../core/types';
import { questRecommendedPower } from '../core/readiness';
import { bar, div, h, span } from './dom';

const SAVE_KEY = 'guildquest_save_v1';
export type Tab = 'home' | 'roster' | 'dispatch' | 'log' | 'recruit' | 'facility' | 'finance';
export const artUrl = (id: string) => `${import.meta.env.BASE_URL}art/${id}.webp`;
export function tabUnlocked(tab: Tab): boolean {
  return !['recruit', 'facility', 'finance'].includes(tab) || featureUnlocked(state, tab as 'recruit' | 'facility' | 'finance');
}

const STORY = STORY_JSON as PresentedLine[];
export let state: GameState = load() ?? newGame(Date.now() % 1000000);
export const ui = {
  panel: null as Tab | null,
  step: 0,
  tab: 'home' as Tab,
  selAdv: null as string | null,
  selLog: null as string | null,
  d: { questId: null as string | null, members: [] as string[], leader: null as string | null, policy: 'standard', potions: 0 },
  modals: [] as (() => HTMLElement)[],
  toast: null as null | { text: string; err: boolean },
  introSeen: false,
  storyPage: 0,
};

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.adventurers && s.pendingTags ? migrateCampaignSave(s) : null;
  } catch { return null; }
}
let saveWarning = '';
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); saveWarning = ''; }
  catch { saveWarning = '保存できませんでした。ブラウザの空き容量・保存設定を確認してください。この画面を閉じると進行が失われる場合があります。'; }
}
export function commit() { save(); render(); }
export function toast(text: string, err = false) {
  ui.toast = { text, err };
  render();
  setTimeout(() => { if (ui.toast?.text === text) { ui.toast = null; render(); } }, 2600);
}
export const adv = (id: string) => state.adventurers.find((a) => a.id === id);
export const nameOf = (r: ExpeditionResult, id: string) => r.names[id] ?? adv(id)?.name ?? '?';

// ---------- 部品 ----------
export const persTag = (a: Adventurer) => span(`tag p-${a.personality}`, PERSONALITY[a.personality].name);
export const rankSpan = (v: number) => span(`rank rank-${rankOf(v)}`, rankOf(v));

export function traitTags(a: Adventurer) {
  if (!a.traits.length) return [span('dim small', '特性なし(に見える)')];
  return a.traits.map((t) => (t.revealed ? span('tag', TRAIT[t.id].name) : span('tag unk', '？？？')));
}

export function statusText(a: Adventurer): string {
  if (a.status === 'away') return '派遣中';
  if (a.injuryDays > 0) return `負傷(あと${a.injuryDays}日)`;
  if (a.fatigue >= 70) return '疲労大';
  return '待機';
}

export function statBlock(a: Adventurer, job = a.job) {
  const s = effectiveStats(a, job);
  return div(null, ...STAT_KEYS.map((k) => div('stat-row', span('dim small', STAT_LABEL[k]), span(null, s[k]), bar(s[k], k === 'hp' ? 200 : 40, k === 'hp' ? 'hp' : ''))));
}

export function aptBlock(a: Adventurer, canChange: boolean) {
  const best = bestJob(a);
  return div(null, ...JOBS.map((j) => {
    const p = powerOf(a, j.id);
    return div('row between',
      div('row', span(null, `${j.name}`), rankSpan(a.apt[j.id]), span('dim small', `適性${a.apt[j.id]}`), j.id === best ? span('note', '★向き') : null, j.id === a.job ? span('tag', '現職') : null),
      div('row', span('dim small', `戦力${p}`), canChange && j.id !== a.job ? h('button', { onclick: () => { const r = changeJob(state, a.id, j.id); if (!r.ok) toast(r.error, true); else { toast(`${a.name}を${j.name}に転職させた`); commit(); } } }, '転職') : null));
  }));
}

export function advCard(a: Adventurer, opts: { onClick?: () => void; selected?: boolean; extra?: HTMLElement | null } = {}) {
  return div(`card ${opts.onClick ? 'click' : ''} ${opts.selected ? 'sel' : ''}`.trim(),
    div('row between', div('row', h('b', null, a.profile ? `${a.profile.icon} ${a.name}` : a.name), span('dim small', `Lv${a.level} ${JOB[a.job].name}`), persTag(a)), span('gold', `${a.salary}G/日`)),
    div('row small dim', `戦力${powerOf(a)}`, ` ・${statusText(a)}`, ' ・疲労', span(null, bar(a.fatigue, 100, 'fat'))),
    opts.extra ?? null);
  // onClick は呼び出し側で設定
}

export interface ClickableOptions {
  /** Stable identity used to restore keyboard focus after a re-render. */
  focusKey?: string;
  /** Accessible name for cards whose visible text is not enough on its own. */
  label?: string;
  /** Selection state for cards that behave like a single-select control. */
  selected?: boolean;
}

/**
 * Turn a presentational card into a keyboard-operable button-like control.
 * Native buttons inside the card keep their own keyboard behavior.
 */
export function clickable(el: HTMLElement, fn: () => void, options: ClickableOptions = {}) {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  if (options.label) el.setAttribute('aria-label', options.label);
  if (options.selected !== undefined) el.setAttribute('aria-pressed', String(options.selected));
  if (options.focusKey) el.dataset.focusKey = options.focusKey;
  el.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea, a')) return;
    fn();
  });
  el.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea, a')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    fn();
  });
  return el;
}

// ---------- 画面: ホーム ----------
export function viewHome() {
  const finalQ = QUESTS.find((q) => q.final)!;
  const locked = state.rep < finalQ.unlockRep;
  const finalDepartureDeadline = MAX_DAY - finalQ.days;
  const finalExpedition = state.expeditions.find(e => e.questId === finalQ.id);
  const deadlineMissed = !state.finalCleared && state.day > finalDepartureDeadline;
  const timeStatus = state.finalCleared
    ? div('small good home-goal-status', '達成済み。灰竜は討伐され、街に帰る場所ができました。')
    : finalExpedition
      ? div('small home-goal-status', `灰竜討伐隊は派遣中。${finalExpedition.returnDay}日目に帰還予定です。${finalExpedition.returnDay > MAX_DAY ? '期限後も討伐を続けられます。' : ''}`)
    : state.day > MAX_DAY
      ? div('small warn home-goal-status', `期限超過。${finalQ.name}はまだ達成されていません。`)
      : deadlineMissed
        ? div('small warn home-goal-status', `出発期限超過。${finalDepartureDeadline}日目までに出発が必要でした。`)
        : div('small dim home-goal-status', `出発期限まであと${finalDepartureDeadline - state.day + 1}日。帰還まで${finalQ.days}日かかります。`);
  const latestNotices = state.notices.filter((n) => n.day >= state.day - 1).slice(0, 8);
  return div(
    'home-dashboard',
    campaignHeader(),
    saveWarning ? div('card warn', { role: 'alert' }, saveWarning) : null,
    div(
      'grid2 home-columns',
      div(
        'home-primary',
        div(
          'card home-card home-status',
          h('h2', null, `${state.day}日目の状況`),
          div(null, `冒険者 ${state.adventurers.length}/${capacity(state)}人 ・待機 ${state.adventurers.filter((a) => a.status === 'idle' && a.injuryDays === 0).length}人 ・負傷 ${state.adventurers.filter((a) => a.injuryDays > 0).length}人`),
          div(null, `${tabUnlocked('recruit') ? `応募者 ${state.candidates.length}人 ・` : ''}派遣中の隊 ${state.expeditions.length}`),
          div('small dim', `1日の支出(日給+維持費): ${dailyCost(state)}G`),
          state.debt ? div('warn', '⚠ 借金中です。冒険者の忠誠度と評判が下がっています。依頼で立て直しましょう。') : null,
          div(
            'row',
            { style: 'margin-top:8px' } as any,
            h('button', { class: 'primary', onclick: () => go('dispatch') }, '派遣画面へ'),
            tabUnlocked('recruit') ? h('button', { onclick: () => go('recruit') }, '募集を見る') : null,
          ),
        ),
        div(
          'card home-card home-dispatch',
          h('h2', null, '派遣中'),
          state.expeditions.length === 0
            ? div('dim', '誰も出ていません。')
            : state.expeditions.map((e) => div(
              'row between',
              span(null, `${QUEST[e.questId].name}:${e.partyIds.map((i) => e.names[i]).join('・')}`),
              span('dim small', `${e.returnDay}日目に帰還`),
            )),
        ),
        div(
          'card home-card home-goal',
          h('h2', null, state.finalCleared ? '目標達成' : '目標'),
          !state.finalCleared ? div(null, `${MAX_DAY}日目までに「${finalQ.name}」を成功させる。`) : null,
          !state.finalCleared && !finalExpedition ? div('small dim', `最終依頼は${finalDepartureDeadline}日目までに出発が必要です(帰還まで${finalQ.days}日)。`) : null,
          timeStatus,
          state.finalCleared ? div('small dim', '物語と冒険ログを振り返ったり、ギルドの運営を続けたりできます。')
            : !finalExpedition ? div('small dim', locked ? `依頼の解放には評判が${finalQ.unlockRep}必要(現在${state.rep})。` : '依頼は解放済み。仲間を整えて挑もう。') : null,
        ),
      ),
      div(
        'home-secondary',
        div(
          'card home-card home-notices',
          h('h2', null, 'お知らせ'),
          latestNotices.length === 0 ? div('dim', '特になし。') : latestNotices.map((n) => div('small', `・${n.text}`)),
        ),
        h('details',
          { class: 'card home-card home-rumors' },
          h('summary', null, `街の噂 — ${pname()}の知らない所で……`),
          state.scenes.length === 0 ? div('dim', 'まだ噂は立っていない。') : state.scenes.slice(0, 2).map((s) => sceneEl(s.lines, s.thought, s.rep)),
        ),
        state.history[0]
          ? div(
            'card home-card home-history',
            h('h2', null, '直近の冒険'),
            div(null, `${QUEST[state.history[0].questId].name}:${state.history[0].success ? '成功' : state.history[0].wiped ? '全滅' : state.history[0].retreated ? '撤退' : '未達成'}`),
            h('button', { onclick: () => { ui.selLog = histKey(state.history[0]); go('log'); } }, 'ログを読む'),
          )
          : null,
      ),
    ),
    storyLibrary(),
  );
}

export function campaignHeader() {
  const task = tutorialObjective(state);
  return div('campaign-hero',
    h('img', { src: artUrl('guild-dawn'), alt: '小さなギルドに集まるアルド、ミナ、リナ、ブルーノ、ミレイ', class: 'campaign-art' }),
    div('campaign-caption', span('eyebrow', 'GUILD QUEST / 帰ってくる場所を、つくろう。'),
      h('h1', null, state.finalCleared ? '帰ってくる人たち' : task.title),
      h('p', null, task.text),
      div('row', h('button', { class: 'primary', onclick: () => go(task.tab) }, state.day === 1 && !state.campaign?.jobChanged ? 'アルドの適性を見る →' : '今日の仕事へ →'),
        h('button', { onclick: () => { ui.modals.push(() => div('modal', h('h2', null, '物語の記録'), storyLibrary(), h('button', { onclick: closeModal }, '閉じる'))); render(); } }, '物語の記録'))));
}

function closeModal() { ui.modals.shift(); render(); }
export function openChapter(chapter: StoryChapter) {
  openDialogue(chapter.id, chapter.title, chapter.lines, () => finishChapter(state, chapter.id));
}
function openDialogue(id: string, title: string, lines: PresentedLine[], after?: () => void) {
  const player = createStoryPlayer({ id, title, lines, playerName: pname(), onClose: () => {
    player.dispose(); after?.(); ui.modals.shift(); commit();
  } });
  ui.modals.unshift(() => player.element);
}
function queueStory() {
  if (ui.modals.length || !state.campaign?.prologueSeen) return;
  const pending = pendingChapters(state)[0];
  if (pending) openChapter(pending);
}
export function storyLibrary() {
  if (!state.campaign) return div('card', h('h2', null, '旧セーブで継続中'), div(null, 'これまでの進行と機能を維持しています。新しい序盤と本編の章は「最初から」で始められます。現在のセーブは上書きされるため、続行する場合はこのまま遊んでください。'));
  const seen = state.campaign?.seenChapters ?? [];
  return div('story-library', h('h2', null, '物語とスチル'),
    div('small dim', '読んだ章はいつでも再読できます。未読の章は進行に応じて開きます。'),
    div('chapter-grid', ...CHAPTERS.map(c => {
      const available = seen.includes(c.id) || chapterAvailable(state, c);
      return h('button', { class: `chapter-card ${available ? '' : 'locked'}`, disabled: !available, onclick: () => { openChapter(c); render(); } },
        available ? h('img', { src: artUrl(c.art), alt: '', loading: 'lazy' }) : div('chapter-lock', '◇'),
        span(null, available ? c.title : 'まだ知らない物語'), span('small dim', seen.includes(c.id) ? '読了 · 再読する' : available ? '読む' : c.ending ? '物語の結末で解放' : c.area ? '探索を進めると解放' : `${c.day}日目以降`));
    })),
    div('row', h('button', { onclick: () => { ui.storyPage = 0; ui.modals.unshift(storyModal); render(); } }, 'プロローグを再読する'),
      h('button', { onclick: () => openCharacterGuide() }, 'キャラクター設定資料')),
    (state.seenCharEvents?.length ?? 0) > 0 ? div('card', h('h3', null, '仲間との会話'), ...CHAR_EVENTS.filter(e => state.seenCharEvents?.includes(e.id)).map(e =>
      h('button', { onclick: () => { openDialogue(e.id, e.title, e.lines); render(); } }, e.title))) : null);
}

const CHARACTER_DESIGN: Record<CharacterId, string> = {
  yuto: '短い黒髪・灰青の瞳。生成りのシャツと紺のベスト、茶革の鞄。武器を持たず、帳簿で仲間を支える。',
  aldo: '茶色のくしゃ髪と琥珀の瞳。オリーブ色のマント、生成りのチュニック、短弓。慎重さを強みに変える青年。',
  mina: '茶髪の三つ編み。セージグリーンの服と生成りのケープ、薬草袋。優しい薬草師の孫。',
  lina: '銅色のボブ、錆色のスカーフ、紺のチュニック、コイン袋。軽口の奥に帰る場所を大切にする気持ちがある。',
  bruno: '短い黒髪と顎髭。古い鋼の胸当て、ワイン色のマントと盾。仲間の前に立つ、経験豊かな剣士。',
  mirei: '濃紺髪のローポニーと丸眼鏡。生成りのブラウス、青緑のベスト、受付帳。記録と手続きを担う受付。',
  garo: '年上の酒場店主。丸顔とふっくらしたお腹、薄い灰褐色の髪と大きな口髭。顎髭はなく、赤茶の前掛けとお玉が目印。食事と仕事を先に差し出す。',
};
export function openCharacterGuide(initial: CharacterId = 'aldo') {
  let selected = initial;
  let mode: 'reference' | 'neutral' | 'thoughtful' | 'happy' = 'reference';
  const show = () => div('modal character-guide',
    div('row between', h('h2', null, 'キャラクター設定資料'), h('button', { onclick: closeModal }, '閉じる')),
    div('row character-tabs', ...CHARACTER_IDS.map(id => h('button', { class: selected === id ? 'primary' : '', onclick: () => { selected = id; render(); } }, id === 'yuto' ? pname() : CHARACTER_NAMES[id]))),
    h('p', null, CHARACTER_DESIGN[selected]),
    div('row', ...([['reference', '設定資料'], ['neutral', '通常'], ['thoughtful', '考える・困る'], ['happy', '笑顔・安堵']] as const).map(([id, name]) => h('button', { class: mode === id ? 'primary' : '', onclick: () => { mode = id; render(); } }, name))),
    h('img', { class: `character-guide-image ${mode === 'reference' ? '' : 'is-pose'}`, src: `${import.meta.env.BASE_URL}art/characters/${selected}/${mode}.webp`, alt: `${CHARACTER_NAMES[selected]} ${mode === 'reference' ? '正面・側面・背面と表情の設定資料' : '立ち絵'}` }));
  ui.modals.unshift(show); render();
}

export function sceneEl(lines: string[], thought: string, rep: number) {
  return div('scene', ...lines.map((l) => div('npc', l)), div('thought', `${pname()}: ${thought}`), div('rep', `ギルドの評判 +${rep}(${pname()}本人は理由が分かっていない)`));
}

// ---------- 画面: 冒険者 ----------
export function adventurerDetail(a: Adventurer, opts: { recruit?: boolean } = {}) {
  const relRows = state.adventurers.filter((o) => o.id !== a.id).map((o) => {
    const v = getRelation(state.relations, a, o);
    return div('row between small', span(null, o.name), span(v < -8 ? 'bad' : v >= 8 ? 'good' : 'dim', `${relationLabel(v)} ${relationMark(v)}(${v})`));
  });
  return div('card',
    div('row between', h('h2', null, `${a.name}`), span('dim', `${a.age}歳 / Lv${a.level} / ${JOB[a.job].name}`)),
    div('row', persTag(a), ...traitTags(a)),
    div('small dim', PERSONALITY[a.personality].desc),
    a.profile ? div('character-profile',
      h('img', { class: 'character-portrait', src: `${import.meta.env.BASE_URL}art/characters/${a.profile.key}/neutral.webp`, alt: `${a.name}の立ち絵` }),
      div(null, div('scene', div('small', a.profile.bio), div('thought', `「${a.profile.quote}」`)), h('button', { onclick: () => openCharacterGuide(a.profile!.key as CharacterId) }, '設定資料とポーズを見る'))) : null,
    h('h3', { style: 'margin-top:10px' }, '能力(現職での実効値)'), statBlock(a),
    h('h3', { style: 'margin-top:10px' }, '職業適性'), aptBlock(a, !opts.recruit && a.status === 'idle'),
    div('row', { style: 'margin-top:8px' } as any, span(null, '成長傾向 '), span(`rank rank-${growthRank(a.growth)}`, growthRank(a.growth)), span('dim small', growthRank(a.growth) === 'S' ? '(伸びしろ抜群)' : growthRank(a.growth) === 'D' ? '(伸びにくい)' : ''),
      span(null, ' 忠誠 '), span(a.loyalty < 30 ? 'bad' : 'dim', `${a.loyalty}`), span(null, ' 日給 '), span('gold', `${a.salary}G`)),
    div('small dim', `経験値 ${a.exp}/${40 * a.level}`),
    !opts.recruit ? [h('h3', { style: 'margin-top:10px' }, '他の冒険者との関係'), relRows.length ? relRows : div('dim small', '他に誰もいない')] : null,
    !opts.recruit && a.status === 'idle' && !a.profile ? h('button', { class: 'danger', style: 'margin-top:8px', onclick: () => { ask(`${a.name}を解雇しますか?`, () => { dismiss(state, a.id); ui.selAdv = null; commit(); }); } }, '解雇') : null);
}

export function viewRoster() {
  const sel = ui.selAdv ? adv(ui.selAdv) : state.adventurers[0];
  return div('cols',
    div(null, ...state.adventurers.map((a) => clickable(advCard(a, { onClick: () => {}, selected: sel?.id === a.id }), () => { ui.selAdv = a.id; render(); }, {
      selected: sel?.id === a.id,
      focusKey: `roster:${a.id}`,
      label: `${a.name}の詳細を表示`,
    }))),
    sel ? adventurerDetail(sel) : div('dim', '冒険者がいません。'));
}

// ---------- 画面: 募集 ----------
export function viewRecruit() {
  if (!tabUnlocked('recruit')) return lockedView('募集は4日目に解放されます。まずは今いる仲間の適性を確かめましょう。');
  const full = state.adventurers.length >= capacity(state);
  const sel = state.candidates.find((c) => c.adv.id === ui.selAdv)?.adv ?? state.candidates[0]?.adv;
  return div(null,
    div('card', `定員 ${state.adventurers.length}/${capacity(state)} ・契約金=日給×4 ・応募者は${repLevel(state.rep) >= 3 ? '2〜3' : '1〜2'}人/日。評判が上がると優秀な人材が来ます。`),
    div('cols',
      div(null, ...state.candidates.map((c) => clickable(advCard(c.adv, { onClick: () => {}, selected: sel?.id === c.adv.id, extra: div('small dim', `あと${Math.max(0, c.expiresDay - state.day)}日で去る ・契約金${hireFee(c.adv)}G`) }), () => { ui.selAdv = c.adv.id; render(); }, {
        selected: sel?.id === c.adv.id,
        focusKey: `candidate:${c.adv.id}`,
        label: `${c.adv.name}の応募内容を表示`,
      }))),
      sel ? div(null, adventurerDetail(sel, { recruit: true }),
        h('button', { class: 'primary', disabled: full || state.gold < hireFee(sel), onclick: () => { const r = hire(state, sel.id); if (!r.ok) toast(r.error, true); else { toast(`${sel.name}を雇った`); ui.selAdv = sel.id; commit(); } } }, `雇う(${hireFee(sel)}G)`),
        full ? span('warn', '  宿舎がいっぱいです') : null) : div('dim', '今は応募者がいません。')));
}

// ---------- 画面: 派遣 ----------
export function viewDispatch() {
  const d = ui.d;
  const q = d.questId ? QUEST[d.questId] : null;
  const members = dispatchMembers();
  const stepHeading = (number: string, title: string, description: string) => div('dispatch-step-heading',
    span('dispatch-step-number', number),
    div(null, h('h2', null, title), div('small dim', description)));

  const questCards: HTMLElement[] = [];
  let previousArea: string | undefined;
  for (const qq of QUESTS.filter(quest => !state.campaign || state.day >= 6 || (state.day === 1 ? quest.id === 'q_herb' : quest.area === 'forest'))) {
    const locked = !questUnlocked(state, qq);
    const selected = d.questId === qq.id;
    if (qq.area !== previousArea) {
      questCards.push(h('h3', { class: 'dispatch-area-heading' }, AREA[qq.area].name));
      previousArea = qq.area;
    }
    const el = div(`card dispatch-quest-card ${selected ? 'sel' : ''} ${locked ? 'locked' : ''}`.trim(),
      div('dispatch-quest-card-heading',
        h('span', { class: 'dispatch-select-mark', 'aria-hidden': 'true' }, selected ? '✓' : '○'),
        div('dispatch-quest-card-title', h('b', null, qq.name), span('small dim', `${qq.days}日 ・${{ gather: '採取', hunt: '討伐', explore: '探索', boss: 'ボス' }[qq.type]} ・目安${questRecommendedPower(qq)}`)),
        span('gold', `${qq.reward}G`)),
      div('small', locked ? `🔒 評判${qq.unlockRep}で解放（現在${state.rep}）` : qq.desc),
      qq.final ? div('small note', '★ 最終目標') : null,
      state.clears[qq.id] ? div('small good', `達成 ${state.clears[qq.id]}回`) : null);
    if (locked) {
      el.setAttribute('role', 'group');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-label', `${qq.name}（ロック中。操作できません）`);
    } else {
      clickable(el, () => { d.questId = qq.id; render(); }, {
        selected,
        focusKey: `quest:${qq.id}`,
        label: `${qq.name}を依頼に選択`,
      });
    }
    questCards.push(el);
  }
  const questList = div('dispatch-column-inner dispatch-requests-inner',
    stepHeading('01', '依頼を選ぶ', '目的・日数・報酬を先に確認します。'),
    div('dispatch-selection-hint', '選択中の依頼には ✓ が付きます。'),
    ...questCards);

  const slots = div('dispatch-slots',
    ...Array.from({ length: PARTY_MAX }, (_, i) => {
      const a = members[i];
      if (!a) return div('slot dispatch-slot-empty dim', `空き枠（冒険者一覧から選択）`);
      return div(`slot dispatch-slot filled ${a.id === d.leader ? 'leader' : ''}`,
        div('row between', div('row', h('b', null, a.name), span('dim small', `Lv${a.level} ${JOB[a.job].name}`), persTag(a)), div('row',
          h('button', { 'aria-label': `${a.name}をリーダーにする`, 'aria-pressed': String(a.id === d.leader), onclick: () => { d.leader = a.id; render(); }, disabled: a.id === d.leader }, a.id === d.leader ? '★リーダー' : 'リーダーに'),
          h('button', { onclick: () => { d.members = d.members.filter((x) => x !== a.id); render(); } }, '外す'))),
        div('small dim', `戦力${powerOf(a)} ・HP${effectiveStats(a).hp} ・疲労${a.fatigue} ・日給${a.salary}G ・`, ...traitTags(a)));
    }));

  const preview = previewCard();
  const policyBox = policyCard();
  const goBtn = div('dispatch-departure',
    h('h3', { class: 'dispatch-departure-heading' }, '出発'),
    div('small dim', q ? `選択した隊を${q.days}日間送り出します。` : '依頼と冒険者を選ぶと出発できます。'),
    goButton());

  const list = div('dispatch-column-inner dispatch-adventurers-inner',
    stepHeading('02', '冒険者を選ぶ', 'カードを選ぶと編成に追加。選択済みを再度押すと外せます。'),
    div('dispatch-party-status', h('strong', null, `${members.length}/${PARTY_MAX}人選択`), span('small dim', members.length >= PARTY_MAX ? '最大人数です' : '4人まで編成できます')),
    ...state.adventurers.map((a) => {
    const unavailable = a.status !== 'idle' || a.injuryDays > 0;
    const selected = d.members.includes(a.id);
    const el = div(`card dispatch-member-card ${unavailable ? 'locked' : ''} ${selected ? 'sel' : ''}`.trim(),
      div('dispatch-member-heading', h('span', { class: 'dispatch-select-mark', 'aria-hidden': 'true' }, selected ? '✓' : '○'), div('row', h('b', null, a.name), span('dim small', `Lv${a.level}`), persTag(a)), span('gold small', `${a.salary}G`)),
      div('row small',
        unavailable ? span('warn', statusText(a)) : span('dim', `${JOB[a.job].name} 戦力${powerOf(a)}`),
        span('dim', ' 疲労'), span(null, bar(a.fatigue, 100, 'fat')),
        ...JOBS.map((j) => span(`rank rank-${rankOf(a.apt[j.id])}`, `${j.name[0]}${rankOf(a.apt[j.id])}`))),
      div('small', ...traitTags(a)));
    if (unavailable) {
      el.setAttribute('role', 'group');
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-label', `${a.name}（${statusText(a)}。操作できません）`);
    } else {
      clickable(el, () => {
        if (d.members.includes(a.id)) {
          d.members = d.members.filter((id) => id !== a.id);
          if (d.leader === a.id) d.leader = d.members[0] ?? null;
        } else if (d.members.length < PARTY_MAX) {
          d.members.push(a.id);
          if (!d.leader) d.leader = a.id;
        } else {
          toast(`パーティーは最大${PARTY_MAX}人です`, true);
          return;
        }
        render();
      }, {
        selected,
        focusKey: `dispatch-member:${a.id}`,
        label: selected ? `${a.name}を編成から外す` : `${a.name}を編成に追加`,
      });
    }
    return el;
  }), div('small dim dispatch-member-help', '職業は「冒険者」タブで転職できます(無料)。適性ランクの高い職業が向いています。'));

  const plan = div('dispatch-column-inner dispatch-plan-inner',
    stepHeading('03', '編成と見込み', '人数・回復・疲労を確認してから出発します。'),
    q ? div('card dispatch-current-quest', span('small dim', '選択中の依頼'), h('strong', null, q.name), span('small dim', `${q.days}日間 / 報酬 ${q.reward}G`)) : null,
    div('dispatch-party-status dispatch-party-status-plan', h('strong', null, `${members.length}/${PARTY_MAX}人選択`), span('small dim', members.length ? `隊の戦力 ${partyPower(members)}` : '冒険者を選んでください')),
    slots,
    preview,
    policyBox,
    goBtn);

  return div('grid3 dispatch-layout', div('dispatch-column dispatch-requests', questList), div('dispatch-column dispatch-roster dispatch-adventurers', list), div('dispatch-column dispatch-plan', plan));
}


export function dispatchMembers(): Adventurer[] {
  const d = ui.d;
  if (d.leader && !d.members.includes(d.leader)) d.leader = d.members[0] ?? null;
  if (!d.leader && d.members.length) d.leader = d.members[0];
  return d.members.map(adv).filter(Boolean) as Adventurer[];
}
export function previewCard(): HTMLElement {
  const d = ui.d;
  const q = d.questId ? QUEST[d.questId] : null;
  const members = dispatchMembers();
  let preview: HTMLElement;
  if (!q) preview = div('card dispatch-preview-card dim', '依頼を選んでください。');
  else {
    const rec = questRecommendedPower(q);
    const pw = partyPower(members);
    const ratio = rec ? pw / rec : 0;
    const verdict = members.length === 0 ? '—' : ratio >= 1.15 ? '余裕' : ratio >= 0.95 ? '適正' : ratio >= 0.75 ? '厳しい' : '危険';
    const pairs: { a: Adventurer; b: Adventurer; v: number }[] = [];
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) pairs.push({ a: members[i], b: members[j], v: getRelation(state.relations, members[i], members[j]) });
    const bad = pairs.filter((p) => p.v <= -8);
    const hasHealer = members.some((m) => JOB[m.job].heal);
    const tired = members.filter((m) => m.fatigue > 40);
    const leader = d.leader ? adv(d.leader) : null;
    const returnDay = state.day + q.days;
    const overdueDays = Math.max(0, returnDay - MAX_DAY);
    const finalWarnings = q.final ? [
      members.length < PARTY_MAX ? div('warn dispatch-warning', `⚠ 最終依頼は${PARTY_MAX}人推奨です（現在${members.length}人）`) : null,
      d.potions < 1 ? div('warn dispatch-warning', '⚠ 最終依頼は回復薬を持たせることを推奨します') : null,
      !hasHealer ? div('warn dispatch-warning', '⚠ 回復役がいません。長期戦の回復手段を確認してください') : null,
      tired.length ? div('warn dispatch-warning', `⚠ 疲労40超: ${tired.map((t) => t.name).join('、')}`) : null,
    ].filter(Boolean) as HTMLElement[] : [];
    preview = div('card dispatch-preview-card',
      h('h2', null, '見込み'),
      div('dispatch-power-note small dim', q.id === 'q_herb' ? '採取の得意な仲間を編成しましょう。'
        : q.type === 'gather' ? '4人編成の目安。集まる量は採取の得意な仲間で決まります。'
          : '4人編成の目安。疲労・回復手段で変わります。'),
      div('pbar', h('div', { class: 'fill', style: `width:${Math.min(100, (pw / Math.max(rec * 1.4, 1)) * 100)}%` }), h('div', { class: 'mark', style: `left:${(1 / 1.4) * 100}%` }), div('label', `戦力${pw} / 戦力の目安${rec}（${verdict}）`)),
      div('small dim', `${AREA[q.area].name}:${AREA[q.area].desc}`),
      div('small', { style: 'margin:4px 0' } as any, `回復役: ${hasHealer ? 'あり' : 'なし'} ・リーダー: ${leader ? `${leader.name}(${PERSONALITY[leader.personality].name}:撤退${PERSONALITY[leader.personality].retreatBias > 0.1 ? 'しやすい' : PERSONALITY[leader.personality].retreatBias < -0.1 ? 'しにくい' : '普通'})` : '-'}`),
      pairs.length ? div('small', ...pairs.map((p) => span(p.v <= -8 ? 'bad' : p.v >= 8 ? 'good' : 'dim', `${p.a.name}×${p.b.name} ${relationMark(p.v)}  `))) : null,
      bad.length ? div('warn', `⚠ 不仲の組み合わせ: ${bad.map((p) => `${p.a.name}と${p.b.name}`).join('、')}(探索中に揉める可能性)`) : null,
      tired.length && !q.final ? div('warn', `⚠ 疲労40超: ${tired.map((t) => t.name).join('、')}(能力が下がります)`) : null,
      ...finalWarnings,
      div('dispatch-return-plan', span('small', `帰還予定: ${returnDay}日目`), overdueDays ? span('warn', `期限超過: 最終期限${MAX_DAY}日目を${overdueDays}日超えます`) : span('small dim', `期限${MAX_DAY}日目まで`)),
      div('small dim', `派遣中の日給(全員): ${members.reduce((t, m) => t + m.salary, 0)}G/日`));
  }


  return preview;
}
export function policyCard(): HTMLElement {
  const d = ui.d;
  if (!featureUnlocked(state, 'policy')) {
    d.policy = 'standard'; d.potions = 0;
    return div('card', h('h3', null, 'まずは基本の派遣'), div('dim small', '標準方針で出発します。行動方針と回復薬は3日目から選べます。'));
  }
  // 討伐数・採取量は方針で大きく変わるのに、方針の説明だけでは読み取れない。
  const questType = d.questId ? QUEST[d.questId].type : null;
  const policyHint = questType === 'hunt' ? '討伐依頼は「強敵優先」だと遭遇が増え、目標数に届きやすくなります(戦闘が増えるぶん負傷も増えます)。'
    : questType === 'gather' ? '採取依頼は「探索優先」だと採取の機会が少し増えます。'
      : null;
  const policyBox = div('card', h('h3', null, '行動方針'),
    div('policy-btns', ...POLICIES.map((p) => h('button', { class: d.policy === p.id ? 'on' : '', title: p.desc, onclick: () => { d.policy = p.id; render(); } }, p.name))),
    div('small dim', { style: 'margin-top:6px' } as any, POLICY[d.policy].desc),
    policyHint ? div('small note dispatch-policy-hint', { style: 'margin-top:6px' } as any, policyHint) : null,
    div('row', { style: 'margin-top:8px' } as any, span(null, `回復薬(${POTION_PRICE}G/本):`),
      h('button', { onclick: () => { d.potions = Math.max(0, d.potions - 1); render(); } }, '−'), span('gold', `${d.potions}本`),
      h('button', { onclick: () => { d.potions = Math.min(6, d.potions + 1); render(); } }, '＋'), span('dim small', d.potions ? `(${d.potions * POTION_PRICE}G)` : '')));


  return policyBox;
}
export function goButton(label = '派遣する'): HTMLElement {
  const d = ui.d;
  const q = d.questId ? QUEST[d.questId] : null;
  const members = d.members;
  const canGo = !!q && members.length > 0;
  const goBtn = h('button', {
    class: 'primary', disabled: !canGo, onclick: () => {
      let r: ReturnType<typeof dispatch>;
      try { r = dispatch(state, { questId: q!.id, memberIds: d.members, leaderId: d.leader ?? d.members[0], policy: d.policy, potions: d.potions }); }
      catch (e) { console.error(e); return toast('派遣処理でエラーが発生しました(コンソール参照)', true); }
      if (!r.ok) return toast(r.error, true);
      toast(`派遣した。${r.value.returnDay}日目に帰還予定`);
      ui.d.members = []; ui.d.leader = null; ui.d.potions = 0;
      commit();
    },
  }, label);


  return goBtn;
}

// ---------- 画面: ログ ----------
export const histKey = (r: ExpeditionResult) => `${r.questId}@${r.startDay}@${r.partyIds.join(',')}`;
function returnDialogue(r: ExpeditionResult): HTMLElement | null {
  if (!r.returnDialogue?.length) return null;
  return h('section', { class: 'return-dialogue', 'aria-label': '帰還のひとこと' },
    h('h3', null, '帰還のひとこと'),
    ...r.returnDialogue.map(line => div('return-dialogue-line',
      h('b', { class: 'return-dialogue-name' }, line.name),
      h('p', null, `「${line.text}」`))));
}

export function viewLog() {
  const items = state.history;
  const sel = items.find((r) => histKey(r) === ui.selLog) ?? items[0];
  return div('cols',
    div(null,
      state.expeditions.length ? div('card', h('h3', null, '帰還待ち'), ...state.expeditions.map((e) => div('small', `${QUEST[e.questId].name}(${e.returnDay}日目に帰還)`))) : null,
      ...(items.length ? items.map((r) => clickable(div(`card click ${sel === r ? 'sel' : ''}`,
        div('row between', h('b', null, QUEST[r.questId].name), span(r.success ? 'good' : r.wiped ? 'bad' : 'dim', r.success ? '成功' : r.wiped ? '全滅' : r.retreated ? '撤退' : '未達成')),
        div('small dim', `${r.startDay}日目出発 ・${r.partyIds.map((i) => nameOf(r, i)).join('・')}`)), () => { ui.selLog = histKey(r); render(); })) : [div('dim', 'まだ冒険の記録がありません。派遣して、日を進めましょう。')])),
    sel ? logDetail(sel) : div('dim', ''));
}

export function logDetail(r: ExpeditionResult) {
  const q = QUEST[r.questId];
  const days = [...new Set(r.log.map((l) => l.day))];
  const total = r.questGold + r.lootGold + r.materialGold;
  return div('card',
    h('h2', null, `${q.name} ${r.success ? '【成功】' : r.wiped ? '【全滅】' : r.retreated ? '【撤退】' : '【未達成】'}`),
    div('small dim', `方針:${POLICY[r.policy].name} ・リーダー:${nameOf(r, r.leaderId)} ・回復薬${r.potions}本(使用${r.potionsUsed})`),
    div('card', h('h3', null, '結果'),
      div(null, `収入 ${total}G(依頼${r.questGold} + 戦利品${r.lootGold} + 素材${r.materialGold}) ・評判 ${r.repGain >= 0 ? '+' : ''}${r.repGain}`),
      Object.keys(r.materials).length ? div('small', `素材: ${Object.entries(r.materials).map(([k, v]) => `${ITEM[k].name}×${v}`).join('、')}`) : null,
      Object.keys(r.injuries).length ? div('small bad', `負傷: ${Object.entries(r.injuries).map(([k, v]) => `${nameOf(r, k)}(${v}日)`).join('、')}`) : div('small good', '負傷者なし'),
      div('small dim', `経験値: ${r.partyIds.map((i) => `${nameOf(r, i)}+${r.expGain[i]}`).join(' ')}`)),
    returnDialogue(r),
    ...days.map((dd) => div(null, div('log-day', `${dd}日目`), ...r.log.filter((l) => l.day === dd).map((l) => div(`log-line ${l.kind}`, l.text)))));
}

// ---------- 画面: 施設 ----------
export function viewFacility() {
  if (!tabUnlocked('facility')) return lockedView('施設は5日目に解放されます。帰還と休養を覚えてから、拠点を整えましょう。');
  return div('grid2', ...FACILITIES.map((f) => {
    const lv = state.facilities[f.id] ?? 0;
    const cost = facilityCost(state, f.id);
    return div('card', div('row between', h('h2', null, f.name), span('gold', `Lv ${lv}/${f.maxLevel}`)), div('dim', f.desc),
      ...f.effectText.map((t, i) => div(`small ${i < lv ? 'good' : 'dim'}`, `Lv${i + 1}: ${t}(${f.costs[i]}G)`)),
      cost === null ? div('good', '最大レベル') : h('button', { class: 'primary', style: 'margin-top:8px', disabled: state.gold < cost, onclick: () => { const r = buildFacility(state, f.id); if (!r.ok) toast(r.error, true); else { toast(`${f.name}を強化した`); commit(); } } }, `強化する(${cost}G)`));
  }));
}

// ---------- 画面: 財務 ----------
export function viewFinance() {
  if (!tabUnlocked('finance')) return lockedView('財務は6日目に解放されます。毎日の支出は帰還報告でも確認できます。');
  return div('grid2',
    div(null, div('card', h('h2', null, '毎日の支出'),
      ...state.adventurers.map((a) => div('row between small', span(null, `${a.name}(Lv${a.level} ${JOB[a.job].name})`), span('gold', `${a.salary}G`))),
      div('row between small', span(null, 'ギルド維持費'), span('gold', `${UPKEEP_PER_DAY}G`)),
      div('row between', h('b', null, '合計/日'), h('b', { class: 'gold' }, `${dailyCost(state)}G`)),
      div('small dim', '日給は派遣中も発生します。能力の高い冒険者ほど日給が高く、強い人だけでは経営が回りません。'))),
    div('card', h('h2', null, '収支履歴'), state.ledger.length === 0 ? div('dim', 'まだ記録がありません。') :
      h('table', null, ...state.ledger.slice(0, 40).map((l) => h('tr', null, h('td', { class: 'dim small' }, `${l.day}日`), h('td', null, l.label), h('td', { class: l.amount >= 0 ? 'good' : 'bad', style: 'text-align:right' }, `${l.amount >= 0 ? '+' : ''}${l.amount}G`))))));
}

// ---------- 全体 ----------
function lockedView(text: string) { return div('card', h('h2', null, '準備中'), div(null, text)); }
export function go(t: Tab) { if (!tabUnlocked(t)) return toast('この機能は、数日間の研修で順に解放されます。'); ui.tab = t; ui.panel = t === 'home' ? null : t; render(); }

export function dayReportModal(rep: DayReport): HTMLElement {
  return div('modal',
    h('h2', null, `${rep.day}日目の朝`),
    ...(rep.returned.length ? [h('h3', null, '帰還した冒険者'), ...rep.returned.map((r) => div('card', div('row between', h('b', null, QUEST[r.questId].name), span(r.success ? 'good' : r.wiped ? 'bad' : 'dim', r.success ? '成功' : r.wiped ? '全滅' : r.retreated ? '撤退' : '未達成')),
      div('small', `収入${r.questGold + r.lootGold + r.materialGold}G ・負傷${Object.keys(r.injuries).length}人 ・${r.partyIds.map((i) => nameOf(r, i)).join('・')}`),
      returnDialogue(r),
      h('button', { onclick: () => { ui.selLog = histKey(r); ui.modals.shift(); ui.tab = 'log'; ui.panel = 'log'; render(); } }, '冒険ログを読む')))] : []),
    ...(rep.charEvents.length ? [h('h3', null, '仲間の話'), ...rep.charEvents.map((ev) => div('scene', h('b', null, ev.title),
      div('row', h('button', { onclick: () => { openDialogue(ev.id, ev.title, ev.lines); render(); } }, '会話を読む'), span('small', '仲間が話したいことがあるようだ。')),
      div('rep', ev.effects.join(' ・'))))] : []),
    ...(rep.scenes.length ? [h('h3', null, '街の噂'), ...rep.scenes.map((s) => sceneEl(s.lines, s.thought, s.rep))] : []),
    h('h3', null, '運営費と支援金'),
    ...rep.expenses.map(e => div('row between small', span(null, e.label), span(e.amount >= 0 ? 'good' : 'dim', `${e.amount >= 0 ? '+' : ''}${e.amount}G`))),
    rep.notices.length ? [h('h3', null, 'お知らせ'), ...rep.notices.map((n) => div('small', `・${n}`))] : null,
    div('row', { style: 'margin-top:12px; justify-content:flex-end' } as any, h('button', { class: 'primary', onclick: () => { ui.modals.shift(); render(); } }, 'OK')));
}

export function endingModal(): HTMLElement {
  const cleared = state.finalCleared;
  return div('modal',
    h('h2', null, cleared ? '灰竜討伐、成功!' : `${MAX_DAY}日が経過した`),
    div(null, cleared
      ? `街じゅうが祝宴に沸いた。「やはりあのギルドマスターは只者ではなかった」という声が聞こえる。${pname()}は報告書を読みながら首をかしげている。「ステータス通りに送り出しただけなんだけど……」`
      : `期限は過ぎたが、ギルドは今日も回っている。灰竜はまだ遺跡にいる。${pname()}は「まあ、安全に暮らせてるしいいか」と思っている。続けて挑戦してもよい。`),
    div('card', div(null, `ギルド評判: ${REP_NAMES[repLevel(state.rep) - 1]}(${state.rep})`), div(null, `所持金: ${state.gold}G ・冒険者: ${state.adventurers.length}人`), div(null, `達成した依頼: ${Object.values(state.clears).reduce((a, b) => a + b, 0)}回 ・勘違い目撃: ${state.scenes.length}件`)),
    div('row', { style: 'justify-content:flex-end' } as any,
      h('button', { onclick: () => { ui.modals.shift(); render(); } }, '続ける'),
      h('button', { class: 'primary', onclick: () => { ask('最初からやり直しますか?', restart); } }, '最初から')));
}

export const pname = () => state.playerName || PROTAGONIST;
const fillName = (t: string) => t.replace(/{name}/g, pname());

/** 最初の名前入力 */
export function nameModal(): HTMLElement {
  const input = h('input', { type: 'text', maxlength: '8', value: state.playerName || PROTAGONIST, class: 'name-input', placeholder: '名前(8文字まで)' }) as HTMLInputElement;
  const submit = () => {
    state.playerName = input.value.trim().slice(0, 8) || PROTAGONIST;
    ui.storyPage = 0;
    ui.modals.shift();
    ui.modals.push(storyModal);
    commit();
  };
  input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') submit(); });
  setTimeout(() => { input.focus(); input.select(); }, 0);
  const sample = ['ユウト', 'ハルカ', 'ソウタ', 'ミナト', 'レン', 'アオイ'];
  return div('modal name-modal',
    h('h2', null, 'ギルドクエスト 〜見えちゃうギルドマスター〜'),
    div('dim small', '異世界に迷い込む主人公の名前を決めてください。'),
    div('row', { style: 'margin:14px 0' }, span(null, '名前:'), input, h('button', { onclick: () => { input.value = sample[Math.floor(Math.random() * sample.length)]; } }, '🎲 おまかせ')),
    div('row', { style: 'justify-content:flex-end' }, h('button', { class: 'primary', onclick: submit }, 'この名前で始める')));
}

let prologuePlayer: ReturnType<typeof createStoryPlayer> | null = null;
/** Reuse the player DOM across host renders so effects and dialogue are not restarted. */
export function storyModal(): HTMLElement {
  if (!prologuePlayer) prologuePlayer = createStoryPlayer({
    id: 'prologue', title: '序章 · 見えちゃうギルドマスター', lines: STORY,
    playerName: pname(), prologue: true,
    onClose: () => {
      prologuePlayer?.dispose(); prologuePlayer = null;
      ui.introSeen = true; if (state.campaign) state.campaign.prologueSeen = true;
      ui.modals.shift(); commit();
    },
  });
  return prologuePlayer.element;
}
/** ブラウザ標準の confirm は埋め込み環境で無効化されることがあるため、アプリ内モーダルで確認する */
export function ask(text: string, onYes: () => void) {
  ui.modals.unshift(() => div('modal', { style: 'max-width:420px' }, h('h2', null, '確認'), div(null, text),
    div('row', { style: 'justify-content:flex-end;margin-top:14px' },
      h('button', { onclick: () => { ui.modals.shift(); render(); } }, 'やめる'),
      h('button', { class: 'primary', onclick: () => { ui.modals.shift(); onYes(); } }, 'はい'))));
  render();
}
export function askRestart() { ask('最初からやり直しますか?(セーブは上書きされます)', restart); }

export function restart() {
  prologuePlayer?.dispose(); prologuePlayer = null;
  state = newGame(Date.now() % 1000000);
  ui.tab = 'home'; ui.selAdv = null; ui.selLog = null; ui.d = { questId: null, members: [], leader: null, policy: 'standard', potions: 0 };
  state.playerName = ''; ui.panel = null; ui.step = 0; ui.introSeen = false; ui.storyPage = 0;
  ui.modals = [nameModal];
  commit();
}

export function nextDay() {
  const block = dayAdvanceBlock(state);
  if (block) return toast(block, true);
  const wasOver = state.finalCleared || state.day > MAX_DAY;
  const rep = advanceDay(state);
  ui.d.members = ui.d.members.filter((id) => adv(id));
  ui.modals.push(() => dayReportModal(rep));
  if (!state.campaign && !wasOver && (state.finalCleared || state.day > MAX_DAY)) ui.modals.push(endingModal);
  commit();
}

let renderHook: () => void = () => {};
export function setRenderHook(fn: () => void) { renderHook = fn; }
export function render() { queueStory(); renderHook(); }
export function bootstrapIntro() {
  if (state.campaign && !state.campaign.prologueSeen) {
    ui.modals.push(state.playerName ? storyModal : nameModal);
  } else if (!state.campaign && !state.playerName && state.day === 1 && state.history.length === 0) ui.modals.push(nameModal);
  else queueStory();
}
(window as any).__gq = { get state() { return state; } };

