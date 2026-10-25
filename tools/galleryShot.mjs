import { captureSession, precondition } from './devCapture.mjs';
const out = '.tmp/gallery';
const capture = await captureSession(out);
try {
  const { page, url } = capture;
  await page.goto(new URL('material-gallery.html', url).href);
  await precondition(page, () => window.__gallery?.ready, null, 'material gallery ready');
  const pages = await page.evaluate(() => window.__gallery.pageCount);
  for (let index = 0; index < pages; index++) {
    await page.evaluate(index => window.__gallery.page(index), index);
    await precondition(page, index => window.__gallery.ready && window.__gallery.currentPage === index, index, `gallery page ${index}`);
    await page.screenshot({ path: `${out}/${String(index + 1).padStart(2, '0')}-materials.png` });
  }
} finally { await capture.close(); }
