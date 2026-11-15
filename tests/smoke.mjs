// Headless smoke test: boots dist/index.html, starts a solo race, fails on any page error.
// usage: npm run build && npm test     (first time: npx playwright install chromium)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'dist/index.html')).href + '#hq';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'title', null, { timeout: 120000 });
await page.evaluate(() => startSolo('race'));
await page.waitForTimeout(4000);
const st = await page.evaluate(() => ({ gameState, host: P.c && P.c.key, creatures: creatures.length }));
await page.screenshot({ path: join(root, 'tests/smoke.png') });
await browser.close();
console.log(st);
if (errors.length || st.gameState !== 'play') { console.error('FAIL', errors); process.exit(1); }
console.log('OK (screenshot: tests/smoke.png)');
