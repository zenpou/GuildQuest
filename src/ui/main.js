import './style.css';
import './variants.css';
import './campaign.css';
import { div, h } from './dom';
import { bootstrapIntro, setRenderHook, ui, state, go } from './shared';
import { tutorialObjective } from '../core/campaign';
import { desk } from './variants/desk';
import { hall } from './variants/hall';
import { pocket } from './variants/pocket';
import { initPwa, syncPwaUpdateControls } from './pwa';
const VARIANTS = [desk, hall, pocket];
const UI_KEY = 'guildquest_ui';
function pickVariant() {
    let id = new URLSearchParams(location.search).get('ui');
    if (!id) {
        try {
            id = localStorage.getItem(UI_KEY);
        }
        catch { /* ignore */ }
    }
    return VARIANTS.find((v) => v.id === id) ?? (window.matchMedia('(max-width: 700px)').matches ? pocket : desk);
}
let current = pickVariant();
function choose(v) {
    current = v;
    ui.panel = null;
    try {
        localStorage.setItem(UI_KEY, v.id);
    }
    catch { /* ignore */ }
    render();
}
function render() {
    const app = document.getElementById('app');
    const scroll = window.scrollY;
    app.className = `v-${current.id}`;
    const nodes = [...current.render()];
    if (state.campaign && state.day <= 5 && ui.tab !== 'home') {
        const task = tutorialObjective(state);
        nodes.push(div('tutorial-strip', h('b', null, task.title), h('span', null, task.text), h('button', { onclick: () => go(task.tab) }, '案内を開く')));
    }
    if (ui.modals.length)
        nodes.push(div('overlay', ui.modals[0]()));
    if (ui.toast)
        nodes.push(div(`toast ${ui.toast.err ? 'err' : ''}`, ui.toast.text));
    nodes.push(div('v-switch', ...VARIANTS.map((v) => h('button', { class: v.id === current.id ? 'on' : '', title: v.desc, onclick: () => choose(v) }, v.name))));
    app.replaceChildren(...nodes);
    const overlay = app.querySelector('.overlay');
    if (overlay) {
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        for (const node of Array.from(app.children))
            if (node !== overlay && node instanceof HTMLElement)
                node.inert = true;
        document.getElementById('pwa').inert = true;
        if (!overlay.querySelector('[data-pwa-update]')) {
            const updateHost = div('', { 'data-pwa-update': '', hidden: true });
            (overlay.querySelector('.vn-player-toolbar') ?? overlay.firstElementChild)?.append(updateHost);
        }
        syncPwaUpdateControls();
        const focus = overlay.querySelector('[data-story-next], [data-prologue-next]') ?? overlay.querySelector('input') ?? overlay.querySelector('button');
        focus?.focus({ preventScroll: true });
    }
    else
        document.getElementById('pwa').inert = false;
    window.scrollTo(0, scroll);
}
setRenderHook(render);
bootstrapIntro();
render();
initPwa();
document.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
        const overlay = document.querySelector('.overlay');
        const elements = overlay ? Array.from(overlay.querySelectorAll('button:not(:disabled), input, [tabindex="0"]')).filter(el => el.getClientRects().length > 0) : [];
        if (elements.length) {
            const index = elements.indexOf(document.activeElement);
            if ((e.shiftKey && index <= 0) || (!e.shiftKey && index === elements.length - 1)) {
                e.preventDefault();
                elements[e.shiftKey ? elements.length - 1 : 0].focus();
            }
        }
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)
        return;
    if (e.key === 'Enter' || e.key === ' ') {
        const next = document.querySelector('[data-story-next], [data-prologue-next]');
        if (next && next.getClientRects().length) {
            e.preventDefault();
            next.click();
        }
    }
});
