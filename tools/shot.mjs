// Dev helper: open the game in Chromium, run an optional scripted sequence and
// save screenshots + console errors.  node tools/shot.mjs <outDir> [scenario]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? '.tmp/shots';
const scenario = process.argv[3] ?? 'basic';
fs.mkdirSync(out, { recursive: true });
const url = process.env.RH_URL ?? 'http://localhost:5190/';
const W = Number(process.env.RH_W ?? 1920), H = Number(process.env.RH_H ?? 1080);

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(url);
await page.waitForSelector('[data-testid=main-menu]', { timeout: 90000 });
console.log(`menu after ${Date.now() - t0} ms`);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, '01-menu.png') });
const snap = async (name) => {
  await page.screenshot({ path: path.join(out, name) });
  const s = await page.evaluate(() => window.__rh?.snapshot());
  console.log(name, JSON.stringify(s).slice(0, 600));
};
if (scenario !== 'menu') {
  await page.click('[data-testid=menu-new]');
  await page.waitForTimeout(800);
  await snap('02-newgame.png');
  if (process.env.RH_VEHICLE) await page.click(`[data-testid=pick-${process.env.RH_VEHICLE}]`);
  await page.click('[data-testid=ng-start]');
  await page.waitForFunction(() => window.__rh?.mode() === 'explore', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await snap('03-explore.png');
  if (scenario === 'tour') {
    const evals = JSON.parse(process.env.RH_STEPS ?? '[]');
    let i = 4;
    for (const st of evals) {
      await page.evaluate(st.js);
      await page.waitForTimeout(st.wait ?? 1500);
      await snap(`${String(i++).padStart(2, '0')}-${st.name}.png`);
    }
  }
}
fs.writeFileSync(path.join(out, 'console.txt'), logs.join('\n'));
console.log(`console messages: ${logs.length}`);
for (const l of logs.slice(0, 25)) console.log(l.slice(0, 400));
await browser.close();
