import { strict as assert } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { newGame } from '../src/core/game';
import { simulateExpedition } from '../src/core/expedition';
import { Rng } from '../src/core/rng';
import type { ExpeditionResult } from '../src/core/types';

// Find real simulation outcomes, then present each on its actual return day.
const outcomes = new Map<string, ExpeditionResult>();
for (let seed = 1; seed <= 500 && outcomes.size < 4; seed++) {
  for (const questId of ['q_herb', 'q_goblin', 'q_patrol', 'q_drake']) {
    const members = newGame(42).adventurers;
    const result = simulateExpedition({ rng: new Rng(seed), questId, members,
      leaderId: members[0].id, policy: 'standard', potions: 0, relations: {}, startDay: 1, expMult: 1, clinicLevel: 0 });
    const outcome = result.success ? 'success' : result.wiped ? 'wiped' : result.retreated ? 'retreat' : 'failure';
    if (!outcomes.has(outcome)) outcomes.set(outcome, result);
  }
}
assert.equal(outcomes.size, 4, 'All four real outcomes must be covered');
await mkdir('artifacts/return-dialogue', { recursive: true });
const root = resolve('dist');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url!, 'http://localhost').pathname;
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address() as { port: number };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
const records: object[] = [];
try {
  for (const [variant, width, height] of [['desk', 1440, 1000], ['pocket', 390, 844], ['hall', 1280, 900]] as const) {
    for (const [outcome, result] of outcomes) {
      const saved = newGame(42);
      delete saved.campaign;
      saved.playerName = '検証'; saved.day = result.returnDay - 1;
      saved.expeditions = [structuredClone(result)];
      saved.adventurers.forEach(a => { a.status = 'away'; });
      assert.equal(result.returnDialogue?.length, 4);
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(data => {
        if (!localStorage.getItem('guildquest_save_v1')) localStorage.setItem('guildquest_save_v1', JSON.stringify(data));
      }, saved);
      await page.goto(`http://127.0.0.1:${address.port}/?ui=${variant}`);
      await page.getByRole('button', { name: /次の日へ/ }).click();
      const dialogue = page.locator('.overlay .return-dialogue');
      await dialogue.waitFor();
      assert.equal(await dialogue.locator('.return-dialogue-line').count(), 4);
      for (const line of result.returnDialogue!) assert.ok((await dialogue.innerText()).includes(line.text));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `artifacts/return-dialogue/${variant}-${outcome}.png` });
      await page.getByRole('button', { name: '冒険ログを読む', exact: true }).click();
      assert.equal(await page.locator('.return-dialogue-line').count(), 4);
      const snapshot = await page.locator('.return-dialogue').innerText();
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('guildquest_save_v1')!));
      assert.deepEqual(stored.history[0].returnDialogue, result.returnDialogue);
      await page.reload();
      if (variant === 'hall') await page.locator('.hs-shelf').click();
      else await page.getByRole('button', { name: 'ログを読む', exact: true }).click();
      assert.equal(await page.locator('.return-dialogue').innerText(), snapshot);
      // Old histories without dialogue remain readable.
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('guildquest_save_v1')!);
        delete state.history[0].returnDialogue;
        localStorage.setItem('guildquest_save_v1', JSON.stringify(state));
      });
      await page.reload();
      if (variant === 'hall') await page.locator('.hs-shelf').click();
      else await page.getByRole('button', { name: 'ログを読む', exact: true }).click();
      assert.equal(await page.locator('.return-dialogue').count(), 0);
      records.push({ variant, outcome, members: 4, report: true, log: true, reload: true, legacy: true, overflow: false });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  await writeFile('artifacts/return-dialogue/check.json', JSON.stringify({ records, errors }, null, 2));
  console.log(`Verified ${records.length} return reports, logs, reloads and legacy histories; no browser errors.`);
} finally {
  await browser.close();
  await new Promise<void>(r => server.close(() => r()));
}
