import fs from 'node:fs/promises';
import { captureSession, precondition } from './devCapture.mjs';

const out = '.tmp/shots/interior';
const capture = await captureSession(out);
const manifest = { behavioralValidation: [], performance: {}, screenshots: [] };
const { page, url } = capture;

async function start(vehicle) {
  await page.addInitScript(() => {
    localStorage.setItem('rollinghome:settings', JSON.stringify({ quality: 'high' }));
  });
  await page.goto(url.href);
  await precondition(page, () => !!window.__rh && !!document.querySelector('[data-testid=menu-new]'), null, 'new game menu available');
  await page.click('[data-testid=menu-new]');
  await page.click(`[data-testid=pick-${vehicle}]`);
  await page.click('[data-testid=ng-start]');
  await precondition(page, () => window.__rh?.mode() === 'explore' && !!window.__rh.dev, null, `${vehicle} game ready`);
  await page.evaluate(() => {
    const api = window.__rh, g = api.game;
    g.settings.quality = 'high'; g.hudHidden = true;
    api.setTraffic(false); api.setMode('interior');
    // Freeze simulation only for this capture; the preview remains render-only.
    g.timeFrozen = () => true;
    g.vv.doorTarget = 0;
    document.querySelectorAll('#hud, #prompt, #minimap, #crosshair').forEach(e => e.style.display = 'none');
    // A camera override keeps exact review compositions independent of walking collision.
    const update = g.interior.update.bind(g.interior);
    g.interior.update = dt => {
      update(dt);
      if (!window.__shotCamera) return;
      const { eye, target } = window.__shotCamera;
      const local = g.camera.position.clone().set(...eye);
      const aim = local.clone().set(...target);
      g.vv.body.localToWorld(local); g.vv.body.localToWorld(aim);
      g.camera.position.copy(local); g.camera.lookAt(aim); g.focus.copy(local);
    };
  });
}

async function shot(name, eye, target, hour = 10, cutaway = false) {
  await page.evaluate(({ eye, target, hour, cutaway }) => {
    window.__shotCamera = { eye, target };
    window.__rh.dev.previewHour(hour); window.__rh.dev.cutaway(cutaway);
  }, { eye, target, hour, cutaway });
  await precondition(page, ({ hour, cutaway }) => {
    const g = window.__rh.game, st = window.__rh.dev.state();
    const skyHour = st.previewMinutes / 60;
    const done = st.coverings?.every(c => c.settled) ?? false;
    return Math.abs(skyHour - hour) < .001 && st.cutaway === cutaway && g.vv.doorT < .005 && done && Math.abs(st.exposure - st.targetExposure) < .01;
  }, { hour, cutaway }, `settled preview ${name}`);
  // Ensure changes have passed through an actual render, without a timed sleep.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  manifest.screenshots.push(file);
  manifest.behavioralValidation.push({ screenshot: file, observed: false, checked: [], pendingChecks: ['z-fighting', 'gaps', 'floating coverings', 'light leaks', 'texture scale', 'night exposure', 'shadow acne'] });
}

try {
  await start('classc');
  const entry = [[-.35, 2.35, .85], [0, 1.7, -2.8]];
  const bed = [[0, 2.35, -3.25], [0, 1.8, 1.2]];
  const galley = [[.6, 2.2, -.05], [-.85, 1.6, -.7]];
  await shot('01-factory-day-entry-bed', ...entry);
  await shot('02-factory-day-bed-cab', ...bed);
  await shot('03-factory-day-galley', ...galley);
  await shot('04-factory-night-entry-bed', ...entry, 21);
  await shot('05-factory-night-bed-cab', ...bed, 21);
  await shot('06-factory-night-galley', ...galley, 21);
  await page.evaluate(() => {
    const d = window.__rh.dev;
    d.setSurface('floor.living', { mat: 'lvp_natural_oak' });
    d.setSurface('floor.bedroom', { mat: 'hw_herringbone' });
    for (const s of window.__rh.game.vv.def.interior.surfaces) {
      if (s.kind === 'wall') d.setSurface(s.id, { mat: 'shiplap_painted', rot: 90 });
      if (s.kind === 'ceiling') d.setSurface(s.id, { mat: 'paint_matte', color: '#ffffff' });
    }
    d.setSurface('wall.L.living', { mat: 'wallpaper_botanical' });
    d.setSurface('trim', { mat: 'trim_walnut' });
    const treatment = (type, mat, extra = {}) => ({ type, fabric: { mat }, hardware: 'brass', mount: 'outside', length: 'sill', open: 0, ...extra });
    d.setWindow('L1', treatment('blackout_roller', 'win_blackout_linen'));
    d.setWindow('L2', treatment('curtains', 'win_linen', { open: .8 }));
    d.setWindow('R1', treatment('day_night', 'win_solar_screen', { fabric2: { mat: 'win_pleat_blackout' }, layer: 'day', open: .4 }));
    d.setWindow('B1', treatment('curtains', 'win_linen', { open: .75 }));
  });
  await shot('07-renovation-day-entry-bed', ...entry);
  await shot('08-renovation-day-bed-cab', ...bed);
  await shot('09-renovation-night-entry-bed', ...entry, 21);
  await shot('10-renovation-night-bed-cab', ...bed, 21);
  const types = {
    none: '', curtains: 'win_linen', sheer: 'win_sheer', blackout_roller: 'win_blackout', solar_roller: 'win_solar_screen',
    pleated: 'win_pleat_light', day_night: 'win_solar_screen', roman: 'win_linen', insulated: 'win_thermal', privacy_screen: 'win_blackout',
  };
  for (const [type, mat] of Object.entries(types)) {
    for (const open of [0, 1]) {
      await page.evaluate(({ type, mat, open }) => window.__rh.dev.setWindow('L2', {
        type, fabric: { mat: mat || 'win_linen' }, fabric2: { mat: 'win_pleat_blackout' }, hardware: 'brass', mount: 'outside', length: 'sill', layer: 'night', open,
      }), { type, mat, open });
      await shot(`covering-${type}-${open ? 'open' : 'closed'}`, [-.5, 2.15, -.05], [1.14, 1.95, -.1]);
    }
    if (type === 'day_night') {
      await page.evaluate(() => {
        const d = window.__rh.dev, v = window.__rh.game.sim.s.vehicles.find(v => v.id === window.__rh.game.vv.vehicleId);
        d.setWindow('L2', { ...v.custom.windows.L2, open: 0, layer: 'day' });
      });
      await shot('covering-day_night-day-closed', [-.5, 2.15, -.05], [1.14, 1.95, -.1]);
    }
  }
  // Exposure expectation for overhead is outdoors; use a separate semantic wait.
  for (const level of ['up', 'cut', 'down']) {
    await page.evaluate(level => {
      window.__shotCamera = { eye: [-4.8, 7.4, -5.8], target: [0, 1.2, -.9] };
      window.__rh.dev.cutaway(level); window.__rh.dev.previewHour(10);
    }, level);
    await precondition(page, level => window.__rh.dev.state().cutaway === level && Math.abs(window.__rh.dev.state().exposure - 1.05) < .025, level, `overhead ${level}`);
    const file = `${out}/cutaway-${level}.png`;
    await page.screenshot({ path: file }); manifest.screenshots.push(file);
    manifest.behavioralValidation.push({ screenshot: file, observed: false, checked: [], pendingChecks: ['wall clipping height', 'covering clipping', 'ceiling hidden', 'seams'] });
  }
  await shot('performance-interior', ...entry, 21);
  manifest.performance = await page.evaluate(async () => {
    const samples = [];
    let last = performance.now();
    for (let i = 0; i < 180; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now(); samples.push(now - last); last = now;
    }
    samples.sort((a,b) => a-b);
    return { width: 1920, height: 1080, quality: 'high', frameMedianMs: samples[90], frameP95Ms: samples[171], ...window.__rh.dev.state().post, textureGeneration: window.__rh.dev.state().textureGeneration, fps: window.__rh.game.fps, note: 'RAF frame cost includes game and GPU scheduling; cpuSubmitMs is CPU submission, not GPU time. AO disabled pending measured headroom.' };
  });
  await start('van');
  await shot('van-factory-day', [0, 2.1, .35], [0, 1.5, -2]);
} finally {
  await fs.writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  await capture.close();
}
