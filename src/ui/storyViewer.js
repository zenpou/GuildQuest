/**
 * 開発用ストーリービューワー(/story.html)。
 * story.json / charevents.json / misunderstandings.json / dialogue.json を一覧で読み返す。
 * ゲームの状態・セーブには一切触れない。
 */
import STORY_JSON from '../data/story-prologue.json';
import { createStoryPlayer } from './storyPlayer';
import CHAR_EVENTS from '../data/charevents.json';
import MIS from '../data/misunderstandings.json';
import DIALOGUE from '../data/dialogue.json';
import PERSONALITIES from '../data/personalities.json';
import { div, h, span } from './dom';
const STORY = STORY_JSON;
const EVENTS = CHAR_EVENTS;
const SCENES = MIS;
const DLG = DIALOGUE;
const PERS = PERSONALITIES;
const TABS = [
    { id: 'story', name: `プロローグ(${STORY.length})` },
    { id: 'events', name: `個人エピソード(${EVENTS.length})` },
    { id: 'scenes', name: `街の噂(${SCENES.length})` },
    { id: 'dialogue', name: '探索セリフ' },
];
const BG_NAME = { office: '地球', night: '夜', town: '街', tavern: '酒場', guild: 'ギルド' };
const BG_CLASS = { night: 'vn-night', town: 'vn-town', guild: 'vn-guild', office: 'vn-office', tavern: 'vn-tavern' };
const CHAR_NAME = { aldo: 'アルド', mina: 'ミナ', lina: 'リナ', bruno: 'ブルーノ' };
const COND_LABEL = { minDay: '日目以降', minExpeditions: '回以上の遠征', minLevel: 'Lv以上', job: 'の職業', allyInjured: '仲間が負傷中' };
const KEY = 'guildquest_storyviewer';
const st = { tab: 'story', name: 'ユウト', q: '', play: null };
try {
    Object.assign(st, JSON.parse(localStorage.getItem(KEY) ?? '{}'), { play: null });
}
catch { /* ignore */ }
const save = () => { try {
    localStorage.setItem(KEY, JSON.stringify({ tab: st.tab, name: st.name, q: st.q }));
}
catch { /* ignore */ } };
const fill = (t) => t.replace(/{name}/g, st.name || 'ユウト');
const hit = (t) => !st.q || t.includes(st.q);
function mark(text) {
    if (!st.q)
        return [text];
    return text.split(st.q).flatMap((part, i, arr) => (i < arr.length - 1 ? [part, h('mark', null, st.q)] : [part]));
}
// ---------- プロローグ ----------
function storyTab() {
    const chars = STORY.reduce((t, p) => t + fill(p.text).length, 0);
    const speakers = [...new Set(STORY.filter((p) => p.speaker).map((p) => fill(p.speaker)))];
    const summary = div('card', div('row', span(null, `${STORY.length}ページ ・ 約${chars.toLocaleString()}文字 ・ 読了目安 約${Math.ceil(chars / 500)}分`), span('dim small', `話者: ${speakers.join('・')}`), h('button', { onclick: () => { st.play = 0; render(); } }, '▶ 最初から紙芝居で再生'), h('button', { onclick: () => copy(storyAsText()) }, 'テキストでコピー')));
    const out = [summary];
    let lastBg = '';
    STORY.forEach((p, i) => {
        if (!hit(fill(p.text)) && !hit(fill(p.speaker ?? '')))
            return;
        if (p.bg !== lastBg) {
            lastBg = p.bg ?? '';
            out.push(div('sv-chapter', span(`sv-bg ${BG_CLASS[lastBg] ?? ''}`), span(null, `場面: ${BG_NAME[lastBg] ?? lastBg}`), span('dim small', `(p.${i + 1}〜)`)));
        }
        out.push(pageRow(p, i));
    });
    return out;
}
function pageRow(p, i) {
    const text = fill(p.text);
    const body = text.split('\n').map((l) => div(null, ...mark(l)));
    const isThought = p.kind === 'say' && text.startsWith('(');
    return div(`sv-line sv-${p.kind} ${isThought ? 'sv-thought' : ''}`, { onclick: () => { st.play = i; render(); }, title: 'クリックでこのページから紙芝居再生' }, span('sv-num dim small', String(i + 1)), span('sv-speaker', p.speaker ? fill(p.speaker) : p.kind === 'narr' ? '地の文' : p.kind === 'status' ? 'ステータス' : p.kind === 'howto' ? '遊び方' : p.kind), div('sv-text', ...body));
}
function storyAsText() {
    return STORY.map((p, i) => {
        const t = fill(p.text);
        if (p.speaker)
            return `${i + 1}. ${fill(p.speaker)}「${t}」`;
        return `${i + 1}. [${p.kind}] ${t}`;
    }).join('\n');
}
// ---------- ゲーム本体と共通の演出プレイヤー。進行セーブは変更しない ----------
let activePlayer = null;
function closePlayer() { activePlayer?.dispose(); activePlayer = null; st.play = null; render(); }
function player() {
    if (!activePlayer)
        activePlayer = createStoryPlayer({ id: 'preview', title: '序章プレビュー', lines: STORY.slice(st.play), playerName: st.name, prologue: true, onClose: closePlayer });
    return div('overlay', activePlayer.element);
}
// ---------- 個人エピソード ----------
function eventsTab() {
    return EVENTS.filter((e) => hit(e.title) || e.lines.some((l) => hit(fill(l.text)))).map((e) => {
        const cond = Object.entries(e.cond).map(([k, v]) => (k === 'allyInjured' ? COND_LABEL[k] : k === 'job' ? `${v}${COND_LABEL[k]}` : `${v}${COND_LABEL[k] ?? k}`)).join(' / ');
        const eff = Object.entries(e.effects).map(([k, v]) => (typeof v === 'object' && v ? `関係値(${CHAR_NAME[v.with] ?? v.with}) ${v.delta > 0 ? '+' : ''}${v.delta}` : k === 'revealTrait' ? `特性判明: ${v}` : `${k === 'loyalty' ? '忠誠' : k === 'rep' ? '評判' : k} +${v}`)).join(' ・ ');
        return div('card', div('row between', h('h2', null, e.title), span('dim small', `${CHAR_NAME[e.char] ?? e.char} ・ ${e.id}`)), div('small dim', `発生条件: ${cond}`), div('scene', ...e.lines.map((l) => {
            const t = fill(l.text);
            const thought = t.startsWith('(');
            return div(`npc ${thought ? 'sv-thought' : ''}`, h('b', null, fill(l.speaker)), thought ? ' ' : '「', ...mark(t), thought ? '' : '」');
        }), div('rep', eff)));
    });
}
// ---------- 街の噂 ----------
function scenesTab() {
    const groups = new Map();
    for (const m of SCENES)
        if (hit(m.scene.join('')) || hit(m.thought) || hit(m.tag))
            groups.set(m.tag, [...(groups.get(m.tag) ?? []), m]);
    return [...groups.entries()].map(([tag, ms]) => div('card', h('h3', null, `きっかけ: ${tag}`), ...ms.map((m) => div('scene', div('row between', span('dim small', m.id), span('small good', `評判 +${Math.max(1, Math.round(m.rep * 0.4))}(元値 ${m.rep})`)), ...m.scene.map((l) => div('npc', ...mark(l))), div('thought', `${st.name}: `, ...mark(m.thought))))));
}
// ---------- 探索セリフ ----------
function dialogueTab() {
    const out = [];
    for (const p of PERS) {
        const d = DLG[p.id];
        if (!d)
            continue;
        const rows = Object.entries(d).flatMap(([k, arr]) => arr.filter(hit).map((t) => div('row small', span('dim', k), span(null, ...mark(t)))));
        if (rows.length)
            out.push(div('card', h('h2', null, `${p.name}(${p.id})`), ...rows));
    }
    for (const k of ['_chat', '_quarrel', '_coop']) {
        const arr = DLG[k].filter(hit);
        if (arr.length)
            out.push(div('card', h('h2', null, k === '_chat' ? '雑談' : k === '_quarrel' ? '喧嘩' : '協力'), ...arr.map((t) => div('small', ...mark(t)))));
    }
    return out;
}
// ---------- 共通 ----------
function copy(text) {
    navigator.clipboard?.writeText(text).then(() => flash('コピーしました'), () => flash('コピーできませんでした'));
}
let toast = '';
function flash(t) { toast = t; render(); setTimeout(() => { toast = ''; render(); }, 1500); }
function render() {
    const app = document.getElementById('app');
    const scroll = window.scrollY;
    if (st.play !== null) {
        app.replaceChildren(player());
        return;
    }
    const header = div('sv-head', div('row between', h('h2', null, 'ストーリービューワー'), div('row', span('dim small', '主人公名'), h('input', { type: 'text', value: st.name, maxlength: '8', class: 'name-input', style: 'width:90px', oninput: (e) => { st.name = e.target.value; save(); render(); } }), h('input', { type: 'search', value: st.q, placeholder: '検索…', style: 'width:180px', oninput: (e) => { st.q = e.target.value; save(); render(); } }), h('a', { href: './index.html', class: 'dim small' }, 'ゲームへ →'))), div('tabs', ...TABS.map((t) => h('button', { class: `tab ${t.id === st.tab ? 'active' : ''}`, onclick: () => { st.tab = t.id; save(); render(); } }, t.name))));
    const body = st.tab === 'story' ? storyTab() : st.tab === 'events' ? eventsTab() : st.tab === 'scenes' ? scenesTab() : dialogueTab();
    app.replaceChildren(header, div('sv-body', ...(body.length ? body : [div('dim', '該当なし')])), toast ? div('toast', toast) : '');
    window.scrollTo(0, scroll);
}
document.addEventListener('keydown', (e) => {
    if (st.play === null)
        return;
    if (e.key === 'Escape') {
        closePlayer();
        return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)
        return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        document.querySelector('[data-prologue-next]')?.click();
    }
    else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        document.querySelector('[data-story-back]')?.click();
    }
});
const style = document.createElement('style');
style.textContent = `
.sv-head { position: sticky; top: 0; background: var(--panel); border-bottom: 1px solid var(--line); padding: 10px 16px 0; z-index: 5; }
.sv-head .tabs { padding: 8px 0 0; background: transparent; border: 0; }
.sv-body { max-width: 980px; margin: 0 auto; padding: 14px 16px 60px; }
.sv-chapter { display: flex; align-items: center; gap: 8px; margin: 18px 0 6px; color: var(--accent); font-weight: 700; }
.sv-bg { display: inline-block; width: 34px; height: 18px; border-radius: 4px; border: 1px solid var(--line); }
.sv-line { display: grid; grid-template-columns: 34px 110px 1fr; gap: 10px; padding: 5px 8px; border-radius: 6px; cursor: pointer; align-items: start; }
.sv-line:hover { background: var(--panel2); }
.sv-num { text-align: right; padding-top: 2px; }
.sv-speaker { font-weight: 700; color: var(--accent); }
.sv-narr .sv-speaker, .sv-howto .sv-speaker, .sv-status .sv-speaker { color: var(--dim); font-weight: 400; }
.sv-narr .sv-text { color: var(--dim); }
.sv-status .sv-text { font-family: monospace; color: #bff0ff; }
.sv-howto .sv-text { white-space: pre-wrap; font-size: 12px; color: var(--dim); }
.sv-thought .sv-text, .npc.sv-thought { color: var(--blue); font-style: italic; }
mark { background: #e0a73c; color: #2a1d05; padding: 0 2px; border-radius: 2px; }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--panel2); border: 1px solid var(--accent); padding: 8px 16px; border-radius: 8px; }
`;
document.head.append(style);
render();
