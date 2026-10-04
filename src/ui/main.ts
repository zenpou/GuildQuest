import './style.css';
import './variants.css';
import './campaign.css';
import { div, h } from './dom';
import { bootstrapIntro, setRenderHook, ui, state, go } from './shared';
import { tutorialObjective } from '../core/campaign';
import { desk } from './variants/desk';
import { hall } from './variants/hall';
import { pocket } from './variants/pocket';
import type { Variant } from './variants/types';
import { initPwa, syncPwaUpdateControls } from './pwa';

const VARIANTS: Variant[] = [desk, hall, pocket];
const previewVariant = new URLSearchParams(location.search).get('ui');

function pickVariant(): Variant {
  // The management desk is the standard UI on every device. Alternative
  // prototypes remain available through an explicit preview URL.
  return VARIANTS.find((v) => v.id === previewVariant) ?? desk;
}
let current = pickVariant();

function choose(v: Variant) {
  current = v;
  ui.panel = null;
  render();
}

function render() {
  const app = document.getElementById('app')!;
  const scrollRoot = document.scrollingElement ?? document.documentElement;
  const scrollLeft = scrollRoot.scrollLeft || document.body.scrollLeft || window.scrollX;
  const scrollTop = scrollRoot.scrollTop || document.body.scrollTop || window.scrollY;
  const active = document.activeElement instanceof HTMLElement && app.contains(document.activeElement)
    ? document.activeElement
    : null;
  const focusKey = active?.dataset.focusKey;
  app.className = `v-${current.id}`;
  const nodes: HTMLElement[] = [...current.render()];
  if (state.campaign && state.day <= 5 && ui.tab !== 'home') {
    const task = tutorialObjective(state);
    nodes.push(div('tutorial-strip', h('b', null, task.title), h('span', null, task.text), h('button', { onclick: () => go(task.tab) }, '案内を開く')));
  }
  if (ui.modals.length) nodes.push(div('overlay', ui.modals[0]()));
  if (ui.toast) nodes.push(div(`toast ${ui.toast.err ? 'err' : ''}`, ui.toast.text));
  if (VARIANTS.some(v => v.id === previewVariant)) {
    nodes.push(div('v-switch', ...VARIANTS.map((v) => h('button', { class: v.id === current.id ? 'on' : '', title: v.desc, onclick: () => choose(v) }, v.name))));
  }
  app.replaceChildren(...nodes);
  const overlay = app.querySelector<HTMLElement>('.overlay');
  if (overlay) {
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    for (const node of Array.from(app.children)) if (node !== overlay && node instanceof HTMLElement) node.inert = true;
    document.getElementById('pwa')!.inert = true;
    if (!overlay.querySelector('[data-pwa-update]')) {
      const updateHost = div('', { 'data-pwa-update': '', hidden: true });
      (overlay.querySelector('.vn-player-toolbar') ?? overlay.firstElementChild)?.append(updateHost);
    }
    syncPwaUpdateControls();
    const focus = overlay.querySelector<HTMLElement>('[data-story-next], [data-prologue-next]') ?? overlay.querySelector<HTMLElement>('input') ?? overlay.querySelector<HTMLElement>('button');
    focus?.focus({ preventScroll: true });
  } else document.getElementById('pwa')!.inert = false;
  // Selection cards are rebuilt after every action. Restore their stable
  // identity so keyboard users remain at the same decision point.
  if (!overlay && focusKey) {
    const target = [...app.querySelectorAll<HTMLElement>('[data-focus-key]')]
      .find((candidate) => candidate.dataset.focusKey === focusKey);
    target?.focus({ preventScroll: true });
  }
  // The game scrolls on body in the embedded shell, while normal browsers
  // expose document.scrollingElement/window. Keep both paths aligned.
  try {
    scrollRoot.scrollTo(scrollLeft, scrollTop);
    document.body.scrollTo(scrollLeft, scrollTop);
    window.scrollTo(scrollLeft, scrollTop);
  } catch {
    document.body.scrollLeft = scrollLeft;
    document.body.scrollTop = scrollTop;
  }
}

setRenderHook(render);
bootstrapIntro();
render();
initPwa();

document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    const overlay = document.querySelector('.overlay');
    const elements = overlay ? Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')).filter(el => el.getClientRects().length > 0) : [];
    if (elements.length) {
      const index = elements.indexOf(document.activeElement as HTMLElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && index === elements.length - 1)) {
        e.preventDefault(); elements[e.shiftKey ? elements.length - 1 : 0].focus();
      }
    }
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  if (e.key === 'Enter' || e.key === ' ') {
    const next = document.querySelector<HTMLButtonElement>('[data-story-next], [data-prologue-next]');
    if (next && next.getClientRects().length) { e.preventDefault(); next.click(); }
  }
});
