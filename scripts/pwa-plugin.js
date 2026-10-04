import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
/**
 * Keep the generated worker in a pure function so its cache and navigation
 * rules can be regression-tested without starting a browser.
 */
export function renderServiceWorker({ files, version }) {
    return `
const ROOT = self.registration.scope;
const ROOT_URL = new URL(ROOT);
const PREFIX = 'guildquest-' + encodeURIComponent(ROOT) + '-';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files)}.map(f => new URL(f, ROOT).href);
const PRECACHE_REQUESTS = FILES.map(url => new Request(url, { cache: 'reload' }));
const INDEX_URL = new URL('index.html', ROOT).href;
const STORY_URL = new URL('story.html', ROOT).href;
const MANUSCRIPT_URL = new URL('story-manuscript.html', ROOT).href;
const SW_PATH = new URL('sw.js', ROOT).pathname;
const NAVIGATION_PAGES = new Map([
  [ROOT_URL.pathname, INDEX_URL],
  [new URL('index.html', ROOT).pathname, INDEX_URL],
  [new URL('story.html', ROOT).pathname, STORY_URL],
  [new URL('story-manuscript.html', ROOT).pathname, MANUSCRIPT_URL],
]);
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE_REQUESTS))));
self.addEventListener('message', e => { if (e.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== ROOT_URL.origin || !url.pathname.startsWith(ROOT_URL.pathname)) return;
  // Never answer a service-worker update request from an old precache.
  if (url.pathname === SW_PATH) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (e.request.mode === 'navigate') {
      const page = NAVIGATION_PAGES.get(url.pathname);
      if (!page) return fetch(e.request);
      return await cache.match(page) || fetch(e.request);
    }
    return await cache.match(e.request, {ignoreSearch: true}) || fetch(e.request);
  })());
});
`;
}
/** Precache the exact production output, including story art, with release-specific hashes. */
export function pwaPlugin() {
    let output = '';
    return {
        name: 'guildquest-offline', apply: 'build',
        configResolved(config) { output = resolve(config.root, config.build.outDir); },
        async closeBundle() {
            const files = [];
            async function walk(dir) {
                for (const file of await readdir(dir, { withFileTypes: true })) {
                    const path = resolve(dir, file.name);
                    if (file.isDirectory())
                        await walk(path);
                    else if (file.name !== 'sw.js')
                        files.push(relative(output, path).replaceAll('\\', '/'));
                }
            }
            await walk(output);
            files.sort();
            const hash = createHash('sha256');
            for (const file of files) {
                hash.update(file);
                hash.update(await readFile(resolve(output, file)));
            }
            const version = hash.digest('hex').slice(0, 16);
            await writeFile(resolve(output, 'sw.js'), renderServiceWorker({ files, version }), 'utf8');
        },
    };
}
