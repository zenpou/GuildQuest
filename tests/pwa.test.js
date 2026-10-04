import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { renderServiceWorker } from '../scripts/pwa-plugin';
class FakeRequest {
    url;
    method;
    mode;
    cache;
    constructor(input, init = {}) {
        this.url = input instanceof FakeRequest ? input.url : input;
        this.method = init.method ?? 'GET';
        this.mode = init.mode ?? 'cors';
        this.cache = init.cache;
    }
}
function createWorkerHarness() {
    const scope = 'https://example.test/guildquest/';
    const handlers = new Map();
    const stores = new Map();
    const deleted = [];
    const fetched = [];
    const precacheRequests = [];
    let claimed = false;
    let skipped = false;
    const cache = (name) => {
        let entries = stores.get(name);
        if (!entries) {
            entries = new Map();
            stores.set(name, entries);
        }
        return {
            addAll(requests) {
                precacheRequests.push(...requests);
                for (const request of requests)
                    entries.set(request.url, { from: 'cache', url: request.url });
                return Promise.resolve();
            },
            match(input) {
                const url = input instanceof FakeRequest ? input.url : input;
                return Promise.resolve(entries.get(url) ?? null);
            },
        };
    };
    const cachesApi = {
        open(name) { return Promise.resolve(cache(name)); },
        keys() { return Promise.resolve([...stores.keys()]); },
        delete(name) { deleted.push(name); stores.delete(name); return Promise.resolve(true); },
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
        fetch: (request) => {
            fetched.push(request.url);
            return Promise.resolve({ from: 'network', url: request.url });
        },
        self: {
            registration: { scope },
            clients: { claim: () => { claimed = true; return Promise.resolve(); } },
            skipWaiting: () => { skipped = true; },
            addEventListener: (name, handler) => handlers.set(name, handler),
        },
    });
    const cacheName = `guildquest-${encodeURIComponent(scope)}-test-release`;
    return { scope, handlers, stores, deleted, fetched, precacheRequests, cacheName, get claimed() { return claimed; }, get skipped() { return skipped; } };
}
async function dispatchFetch(harness, path, init = {}) {
    const request = new FakeRequest(new URL(path, harness.scope).href, { mode: 'navigate', ...init });
    let response;
    harness.handlers.get('fetch')({ request, respondWith(value) { response = value; } });
    return response ? await response : undefined;
}
describe('PWA service worker release rules', () => {
    it('precaches every release file with HTTP cache revalidation', async () => {
        const harness = createWorkerHarness();
        let install;
        harness.handlers.get('install')({ waitUntil(value) { install = value; } });
        await install;
        expect(harness.precacheRequests).toHaveLength(4);
        expect(harness.precacheRequests.every(request => request.cache === 'reload')).toBe(true);
        const entries = harness.stores.get(harness.cacheName);
        expect([...entries.keys()]).toEqual([
            `${harness.scope}index.html`,
            `${harness.scope}story.html`,
            `${harness.scope}story-manuscript.html`,
            `${harness.scope}assets/main-new.js`,
        ]);
    });
    it('keeps exact navigation pages distinct and does not turn unknown pages into index', async () => {
        const harness = createWorkerHarness();
        let install;
        harness.handlers.get('install')({ waitUntil(value) { install = value; } });
        await install;
        const result = await Promise.all([
            dispatchFetch(harness, '/guildquest/'),
            dispatchFetch(harness, '/guildquest/story.html'),
            dispatchFetch(harness, '/guildquest/story-manuscript.html'),
            dispatchFetch(harness, '/guildquest/missing.html'),
        ]);
        expect(result[0].url).toBe(`${harness.scope}index.html`);
        expect(result[1].url).toBe(`${harness.scope}story.html`);
        expect(result[2].url).toBe(`${harness.scope}story-manuscript.html`);
        expect(result[3].from).toBe('network');
        expect(harness.fetched).toEqual([`${harness.scope}missing.html`]);
    });
    it('never serves sw.js from a release cache and activates updates explicitly', async () => {
        const harness = createWorkerHarness();
        let install;
        harness.handlers.get('install')({ waitUntil(value) { install = value; } });
        await install;
        expect(await dispatchFetch(harness, '/guildquest/sw.js')).toBeUndefined();
        harness.stores.set(`guildquest-${encodeURIComponent(harness.scope)}-old-release`, new Map());
        let activate;
        harness.handlers.get('activate')({ waitUntil(value) { activate = value; } });
        await activate;
        expect(harness.deleted).toContain(`guildquest-${encodeURIComponent(harness.scope)}-old-release`);
        expect(harness.claimed).toBe(true);
        harness.handlers.get('message')({ data: 'ACTIVATE_UPDATE' });
        expect(harness.skipped).toBe(true);
    });
});
class FakeEventTarget {
    listeners = new Map();
    addEventListener(type, listener) {
        const list = this.listeners.get(type) ?? [];
        list.push(listener);
        this.listeners.set(type, list);
    }
    dispatchEvent(type, event = {}) {
        for (const listener of this.listeners.get(type) ?? [])
            listener(event);
    }
}
function createPwaClientHarness(controller) {
    const window = new FakeEventTarget();
    window.isSecureContext = true;
    const document = new FakeEventTarget();
    document.visibilityState = 'visible';
    const pwa = {
        children: [],
        className: '',
        replaceChildren(...children) { this.children = children; },
        append(...children) { this.children.push(...children); },
    };
    document.getElementById = () => pwa;
    document.querySelectorAll = () => [];
    document.createElement = () => ({ textContent: '', className: '', disabled: false, onclick: null });
    const serviceWorker = new FakeEventTarget();
    serviceWorker.controller = controller;
    const registration = new FakeEventTarget();
    registration.waiting = null;
    registration.installing = null;
    registration.update = vi.fn(() => Promise.resolve());
    serviceWorker.register = vi.fn(() => Promise.resolve(registration));
    serviceWorker.ready = Promise.resolve(registration);
    const location = { reload: vi.fn() };
    const matchMedia = () => ({ matches: false });
    return { window, document, pwa, serviceWorker, registration, location, matchMedia };
}
async function importPwaClient(harness) {
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
        const modalHost = { hidden: true, children: [], replaceChildren(...children) { this.children = children; } };
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
        const updateButton = harness.pwa.children.find((child) => child.textContent === '更新して再起動');
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
