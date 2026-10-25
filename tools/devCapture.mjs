import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';

/** Isolated Vite server: never attach to another worker's port 5190. */
export async function captureSession(out) {
  await fs.mkdir(out, { recursive: true });
  const arg = process.argv.indexOf('--url');
  let server;
  let url = arg >= 0 ? process.argv[arg + 1] : process.env.RH_URL;
  if (!url) {
    server = await createServer({ server: { port: 0, strictPort: false, host: '127.0.0.1', open: false } });
    await server.listen();
    url = server.resolvedUrls.local[0];
  }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return {
    page, url: new URL(url),
    async close() {
      await fs.writeFile(`${out}/console.json`, JSON.stringify(errors, null, 2));
      await browser.close();
      await server?.close();
    },
  };
}

export async function precondition(page, fn, arg, label) {
  try { await page.waitForFunction(fn, arg, { timeout: 60000 }); }
  catch (cause) { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`, { cause }); }
}
