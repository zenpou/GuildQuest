import { runInNewContext } from 'node:vm';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import {
  pwaPlugin,
  renderServiceWorker,
  selectPrecacheFiles,
// @ts-expect-error Vitest resolves the source TypeScript module directly.
} from '../scripts/pwa-plugin.ts';

type FakeRequestInit = { method?: string; mode?: string; cache?: string };

class FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  readonly cache: string | undefined;
  constructor(input: string | FakeRequest, init: FakeRequestInit = {}) {
    this.url = input instanceof FakeRequest ? input.url : input;
    this.method = init.method ?? 'GET';
    this.mode = init.mode ?? 'cors';
    this.cache = init.cache;
  }
}

function createWorkerHarness() {
  const scope = 'https://example.test/guildquest/';
  const handlers = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, unknown>>();
  const deleted: string[] = [];
  const fetched: string[] = [];
  const precacheRequests: FakeRequest[] = [];
  let claimed = false;
  let skipped = false;
  const cache = (name: string) => {
    let entries = stores.get(name);
    if (!entries) { entries = new Map(); stores.set(name, entries); }
    return {
      addAll(requests: FakeRequest[]) {
        precacheRequests.push(...requests);
        for (const request of requests) entries!.set(request.url, { from: 'cache', url: request.url });
        return Promise.resolve();
      },
      match(input: string | FakeRequest) {
        const url = input instanceof FakeRequest ? input.url : input;
        return Promise.resolve(entries!.get(url) ?? null);
      },
    };
  };
  const cachesApi = {
    open(name: string) { return Promise.resolve(cache(name)); },
    keys() { return Promise.resolve([...stores.keys()]); },
    delete(name: string) { deleted.push(name); stores.delete(name); return Promise.resolve(true); },
  };
  const source = renderServiceWorker({
    version: 'test-release',
    files: ['index.html', 'story.html', 'story-manuscript.html', 'assets/main-new.js'],
  });
  runInNewContext(source, {
    URL,
    Map,
    Promise,
    JSON,
    Request: FakeRequest,
    caches: cachesApi,
    fetch: (request: FakeRequest) => {
      fetched.push(request.url);
      return Promise.resolve({ from: 'network', url: request.url });
    },
    self: {
      registration: { scope },
      clients: { claim: () => { claimed = true; return Promise.resolve(); } },
      skipWaiting: () => { skipped = true; },
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    },
  });
  const cacheName = `guildquest-${encodeURIComponent(scope)}-test-release`;
  return { scope, handlers, stores, deleted, fetched, precacheRequests, cacheName, get claimed() { return claimed; }, get skipped() { return skipped; } };
}

async function dispatchFetch(harness: ReturnType<typeof createWorkerHarness>, path: string, init: FakeRequestInit = {}) {
  const request = new FakeRequest(new URL(path, harness.scope).href, { mode: 'navigate', ...init });
  let response: Promise<unknown> | undefined;
  harness.handlers.get('fetch')!({ request, respondWith(value: Promise<unknown>) { response = value; } });
  return response ? await response : undefined;
}

describe('PWA service worker release rules', () => {
  it('keeps old hashed files through an actual Vite build while limiting the new precache', async () => {
    const root = await mkdtemp(join(process.env.TEMP ?? process.cwd(), 'guildquest-pwa-'));
    const output = join(root, 'dist');
    try {
      await mkdir(join(output, 'assets'), { recursive: true });
      await writeFile(join(output, 'assets', 'main-old.js'), 'old release');
      await writeFile(join(root, 'index.html'), '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'main.js'), 'document.body.dataset.release = "current";');

      await build({
        root,
        base: './',
        plugins: [pwaPlugin()],
        build: {
          outDir: 'dist',
          emptyOutDir: true,
          write: true,
          rollupOptions: { input: resolve(root, 'index.html') },
        },
      });

      const currentAsset = (await readdir(join(output, 'assets'))).find(file => file !== 'main-old.js');
      expect(currentAsset).toBeDefined();
      expect(await readFile(join(output, 'assets', 'main-old.js'), 'utf8')).toBe('old release');
      const worker = await readFile(join(output, 'sw.js'), 'utf8');
      const precache = JSON.parse(worker.match(/const FILES = (\[[^\n]*\])\.map/)![1]) as string[];
      expect(precache).toContain(`assets/${currentAsset}`);
      expect(precache).toContain('index.html');
      expect(precache).not.toContain('assets/main-old.js');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters stale output files even when paths use Windows separators', () => {
    expect(selectPrecacheFiles(
      ['assets\\main-old.js', 'assets\\main-new.js', 'sw.js'],
      ['assets/main-new.js'],
      [],
    )).toEqual(['assets/main-new.js']);
  });

  it('precaches every release file with HTTP cache revalidation', async () => {
    const harness = createWorkerHarness();
    let install: Promise<void> | undefined;
    harness.handlers.get('install')!({ waitUntil(value: Promise<void>) { install = value; } });
    await install;
    expect(harness.precacheRequests).toHaveLength(4);
    expect(harness.precacheRequests.every(request => request.cache === 'reload')).toBe(true);
    const entries = harness.stores.get(harness.cacheName)!;
    expect([...entries.keys()]).toEqual([
      `${harness.scope}index.html`,
      `${harness.scope}story.html`,
      `${harness.scope}story-manuscript.html`,
      `${harness.scope}assets/main-new.js`,
    ]);
  });

  it('keeps exact navigation pages distinct and does not turn unknown pages into index', async () => {
    const harness = createWorkerHarness();
    let install: Promise<void> | undefined;
    harness.handlers.get('install')!({ waitUntil(value: Promise<void>) { install = value; } });
    await install;
    const result = await Promise.all([
      dispatchFetch(harness, '/guildquest/'),
      dispatchFetch(harness, '/guildquest/story.html'),
      dispatchFetch(harness, '/guildquest/story-manuscript.html'),
      dispatchFetch(harness, '/guildquest/missing.html'),
    ]);
    expect((result[0] as any).url).toBe(`${harness.scope}index.html`);
    expect((result[1] as any).url).toBe(`${harness.scope}story.html`);
    expect((result[2] as any).url).toBe(`${harness.scope}story-manuscript.html`);
    expect((result[3] as any).from).toBe('network');
    expect(harness.fetched).toEqual([`${harness.scope}missing.html`]);
  });

  it('never serves sw.js from a release cache and activates updates explicitly', async () => {
    const harness = createWorkerHarness();
    let install: Promise<void> | undefined;
    harness.handlers.get('install')!({ waitUntil(value: Promise<void>) { install = value; } });
    await install;
    expect(await dispatchFetch(harness, '/guildquest/sw.js')).toBeUndefined();
    harness.stores.set(`guildquest-${encodeURIComponent(harness.scope)}-old-release`, new Map());
    let activate: Promise<void> | undefined;
    harness.handlers.get('activate')!({ waitUntil(value: Promise<void>) { activate = value; } });
    await activate;
    expect(harness.deleted).toContain(`guildquest-${encodeURIComponent(harness.scope)}-old-release`);
    expect(harness.claimed).toBe(true);
    harness.handlers.get('message')!({ data: 'ACTIVATE_UPDATE' });
    expect(harness.skipped).toBe(true);
  });
});

class FakeEventTarget {
  readonly listeners = new Map<string, Array<(...args: any[]) => void>>();
  addEventListener(type: string, listener: (...args: any[]) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener); this.listeners.set(type, list);
  }
  dispatchEvent(type: string, event: any = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function createPwaClientHarness(controller: object | null) {
  const window = new FakeEventTarget() as FakeEventTarget & { isSecureContext: boolean };
  window.isSecureContext = true;
  const document = new FakeEventTarget() as FakeEventTarget & {
    visibilityState: string;
    getElementById(id: string): any;
    createElement(tag: string): any;
    querySelectorAll(selector: string): any[];
  };
  document.visibilityState = 'visible';
  const pwa = {
    children: [] as any[],
    className: '',
    replaceChildren(...children: any[]) { this.children = children; },
    append(...children: any[]) { this.children.push(...children); },
  };
  document.getElementById = () => pwa;
  document.querySelectorAll = () => [];
  document.createElement = () => ({ textContent: '', className: '', disabled: false, onclick: null as (() => void) | null });
  const serviceWorker = new FakeEventTarget() as FakeEventTarget & {
    controller: object | null;
    ready: Promise<any>;
    register: ReturnType<typeof vi.fn>;
  };
  serviceWorker.controller = controller;
  const registration = new FakeEventTarget() as FakeEventTarget & {
    waiting: any;
    installing: any;
    update: ReturnType<typeof vi.fn>;
  };
  registration.waiting = null;
  registration.installing = null;
  registration.update = vi.fn(() => Promise.resolve());
  serviceWorker.register = vi.fn(() => Promise.resolve(registration));
  serviceWorker.ready = Promise.resolve(registration);
  const location = { reload: vi.fn() };
  const matchMedia = () => ({ matches: false });
  return { window, document, pwa, serviceWorker, registration, location, matchMedia };
}

async function importPwaClient(harness: ReturnType<typeof createPwaClientHarness>) {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubGlobal('window', harness.window);
  vi.stubGlobal('document', harness.document);
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: harness.serviceWorker });
  vi.stubGlobal('location', harness.location);
  vi.stubGlobal('matchMedia', harness.matchMedia);
  const module = await import('../src/ui/pwa');
  module.initPwa();
  await Promise.resolve();
  await Promise.resolve();
  return module;
}

describe('PWA client update lifecycle', () => {
  it('offers an update within the story modal when the background PWA bar is inert', async () => {
    const harness = createPwaClientHarness({});
    const modalHost = { hidden: true, children: [] as any[], replaceChildren(...children: any[]) { this.children = children; } };
    harness.document.querySelectorAll = () => [modalHost];
    const worker = { postMessage: vi.fn() };
    harness.registration.waiting = worker;
    await importPwaClient(harness);
    expect(modalHost.hidden).toBe(false);
    expect(modalHost.children[0].textContent).toBe('更新して再起動');
    modalHost.children[0].onclick();
    expect(worker.postMessage).toHaveBeenCalledWith('ACTIVATE_UPDATE');
    expect(modalHost.children[0].disabled).toBe(true);
    modalHost.children[0].onclick();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });
  it('does not reload on the initial claim, then reloads once on the next release', async () => {
    const harness = createPwaClientHarness(null);
    await importPwaClient(harness);
    harness.serviceWorker.dispatchEvent('controllerchange');
    expect(harness.location.reload).not.toHaveBeenCalled();
    harness.serviceWorker.controller = {};
    harness.serviceWorker.dispatchEvent('controllerchange');
    harness.serviceWorker.dispatchEvent('controllerchange');
    expect(harness.location.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads when another tab activates the update and keeps the latch after waiting disappears', async () => {
    const oldController = {};
    const harness = createPwaClientHarness(oldController);
    const worker = { postMessage: vi.fn(() => { harness.registration.waiting = null; }) };
    harness.registration.waiting = worker;
    await importPwaClient(harness);
    const updateButton = harness.pwa.children.find((child: any) => child.textContent === '更新して再起動');
    expect(updateButton).toBeDefined();
    updateButton.onclick();
    expect(worker.postMessage).toHaveBeenCalledWith('ACTIVATE_UPDATE');
    harness.serviceWorker.controller = {};
    // This event represents activation started from another tab; this tab
    // still reloads even though its registration.waiting is already null.
    harness.serviceWorker.dispatchEvent('controllerchange');
    harness.serviceWorker.dispatchEvent('controllerchange');
    expect(harness.location.reload).toHaveBeenCalledTimes(1);
  });
});
