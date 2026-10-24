import * as THREE from 'three';
import { DIFFICULTIES, type DifficultyId } from '../../data/difficulty';
import { VEHICLES, VEHICLE_IDS } from '../../data/vehicles';
import type { VehicleId } from '../../data/types';
import type { Look } from '../../sim/types';
import { money } from '../../sim/core';
import { CharacterModel } from '../../render/character';
import type { Game } from '../../game/game';
import { deleteSlot, latestSlot, slotInfo, SLOTS, type SlotId } from '../../game/settings';
import { btn, clear, h } from '../dom';
import type { Screen } from '../ui';
import { modal } from './common';

const SKINS = ['#f2d0b4', '#e0b090', '#c89070', '#a87050', '#8a5a3a', '#5e3c26'];
const HAIRS = ['#1e1610', '#3a2a1a', '#6a4a2a', '#b8864a', '#d8c090', '#c8c8c8', '#a83a2a'];
const SHIRTS = ['#3a7a9a', '#c8553d', '#5a8a4a', '#e8b83c', '#8a4a7a', '#2a3a5a', '#e8e4dc', '#d8873a'];
const PANTS = ['#2a2a3a', '#3a4a6a', '#5a4a3a', '#6a6a5a', '#2a3a2a', '#8a7a62'];

export function mainMenu(g: Game) {
  const el = h('div', { class: 'menu-screen', testid: 'main-menu' });
  const s: Screen = {
    id: 'main', el, pauses: true, blocks: true, escClose: false,
    render: () => {
      clear(el);
      const last = latestSlot();
      const info = last ? slotInfo(last) : null;
      el.append(h('div', { class: 'menu-panel' },
        h('div', { class: 'logo' }, 'Rolling', h('br'), 'Home'),
        h('div', { class: 'tag' }, 'Your home goes wherever you go, but you cannot take everything with you.'),
        h('button', { class: 'menu-btn', disabled: !last, testid: 'menu-continue', onClick: () => {
          if (!last) return;
          const err = g.loadSlot(last);
          if (err) g.ui.toast({ text: err, kind: 'bad' });
        } }, 'Continue', info?.summary ? h('span', { class: 'sub' }, `Day ${info.summary.day} · ${info.summary.place} · ${money(info.summary.cash)}`) : h('span', { class: 'sub' }, 'No saved game yet')),
        h('button', { class: 'menu-btn', testid: 'menu-new', onClick: () => newGameScreen(g) }, 'New Game', h('span', { class: 'sub' }, 'Pick your rig and hit the road')),
        h('button', { class: 'menu-btn', testid: 'menu-load', onClick: () => loadScreen(g, false) }, 'Load Game'),
        h('button', { class: 'menu-btn', testid: 'menu-settings', onClick: () => settingsScreen(g) }, 'Settings'),
        h('div', { class: 'menu-foot' }, 'Best with a mouse and keyboard. Click the view to look around.'),
      ));
    },
  };
  g.ui.closeAll();
  g.ui.open(s);
}

export function newGameScreen(g: Game) {
  const st = {
    name: 'Sam',
    look: { skin: SKINS[1], hair: HAIRS[1], hairStyle: 0, shirt: SHIRTS[0], pants: PANTS[0] } as Look,
    vehicle: 'van' as VehicleId,
    difficulty: 'balanced' as DifficultyId,
  };
  // live character preview
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 300;
  let renderer: THREE.WebGLRenderer | null = null;
  let raf = 0;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 360 / 300, 0.1, 20);
  cam.position.set(0, 1.25, 4.2);
  cam.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x8a6a4a, 1.6));
  const sun = new THREE.DirectionalLight(0xffe8c8, 2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const model = new CharacterModel(st.look);
  scene.add(model.root);
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(360, 300, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const tick = () => {
      model.root.rotation.y += 0.01;
      model.animate(1 / 60, 0, 'idle');
      renderer!.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    renderer = null;
  }
  const sw = (list: string[], key: 'skin' | 'hair' | 'shirt' | 'pants') => h('div', { class: 'swatches' }, list.map((c) => h('div', {
    class: `swatch ${st.look[key] === c ? 'selected' : ''}`, style: `background:${c}`, onClick: () => {
      st.look[key] = c;
      model.setLook(st.look);
      g.ui.invalidate();
    },
  })));
  const vehicleCard = (id: VehicleId) => {
    const d = VEHICLES[id];
    const fresh = d.tanks.fresh.liters;
    return h('div', { class: `choice ${st.vehicle === id ? 'selected' : ''}`, testid: `pick-${id}`, onClick: () => { st.vehicle = id; g.ui.invalidate(); } },
      h('h4', null, d.shortName), h('div', { class: 'small muted' }, d.name),
      h('p', { class: 'small' }, d.description),
      h('div', { class: 'small' },
        h('span', { class: 'pill' }, `${d.dims.length} m long`), h('span', { class: 'pill' }, `${d.dims.height} m tall`),
        h('span', { class: 'pill' }, `GVWR ${d.gvwr.toLocaleString()} kg`), h('span', { class: 'pill' }, `${d.fuelLPer100} L/100 km`),
        h('span', { class: 'pill' }, `Fresh ${fresh} L`), h('span', { class: 'pill' }, d.hasShower ? 'Shower' : 'No shower')),
      h('div', { class: 'small good', style: 'margin-top:6px' }, '+ ', d.pros.join(' · ')),
      h('div', { class: 'small bad' }, '− ', d.cons.join(' · ')));
  };
  const screen = modal(g.ui, 'newgame', {
    title: 'New Game', sub: () => 'Who are you, and what are you driving?',
    onClose: () => { cancelAnimationFrame(raf); renderer?.dispose(); },
    body: () => h('div', { class: 'cols' },
      h('div', null,
        h('h3', null, 'Your name'),
        h('input', { type: 'text', value: st.name, maxlength: 18, testid: 'ng-name', onInput: (e) => (st.name = (e.target as HTMLInputElement).value) }),
        h('h3', null, 'Starting vehicle'),
        h('div', { class: 'grid2' }, VEHICLE_IDS.map(vehicleCard)),
        h('h3', null, 'Difficulty'),
        h('div', { class: 'grid3' }, (Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => {
          const d = DIFFICULTIES[id];
          return h('div', { class: `choice ${st.difficulty === id ? 'selected' : ''}`, testid: `diff-${id}`, onClick: () => { st.difficulty = id; g.ui.invalidate(); } },
            h('h4', null, d.name), h('div', { class: 'small' }, d.blurb), h('div', { class: 'small', style: 'margin-top:4px;font-weight:800' }, `Start with ${money(d.startCash)}`));
        })),
      ),
      h('div', null,
        h('div', { class: 'preview-box' }, renderer ? canvas : h('div', { style: 'padding:20px' }, 'Preview unavailable')),
        h('h3', null, 'Skin'), sw(SKINS, 'skin'),
        h('h3', null, 'Hair'),
        h('div', { class: 'row wrap' }, ['Short', 'Curly', 'Bun', 'Cap'].map((n, i) => btn(n, () => { st.look.hairStyle = i; model.setLook(st.look); g.ui.invalidate(); }, `small ${st.look.hairStyle === i ? 'teal' : 'ghost'}`))),
        h('div', { style: 'height:6px' }), sw(HAIRS, 'hair'),
        h('h3', null, 'Shirt'), sw(SHIRTS, 'shirt'),
        h('h3', null, 'Pants'), sw(PANTS, 'pants'),
      ),
    ),
    foot: () => [
      btn('Back', () => g.ui.closeId('newgame'), 'ghost'),
      btn('Hit the road →', () => {
        g.ui.closeId('newgame');
        g.startNew({ name: st.name.trim() || 'Sam', look: { ...st.look }, vehicle: st.vehicle, difficulty: st.difficulty, seed: Math.floor(Math.random() * 2 ** 31) });
      }, 'big', 'ng-start'),
    ],
  });
  g.ui.open(screen);
}

export function loadScreen(g: Game, inGame: boolean) {
  const screen = modal(g.ui, 'load', {
    title: inGame ? 'Save / Load' : 'Load Game', size: 'mid',
    body: () => h('div', { class: 'list' }, SLOTS.map((slot) => {
      const info = slotInfo(slot);
      const name = slot === 'auto' ? 'Autosave' : `Slot ${slot.slice(4)}`;
      return h('div', { class: 'item', testid: `slot-${slot}` },
        h('div', { class: 'thumb' }, slot === 'auto' ? '⟳' : '💾'),
        h('div', { class: 'meta' }, h('div', { class: 'name' }, name),
          h('div', { class: 'desc' }, info?.summary ? `${info.summary.name} · Day ${info.summary.day}, ${info.summary.clock} · ${info.summary.place} · ${info.summary.vehicle} · ${money(info.summary.cash)}` : 'Empty'),
          info?.savedAt ? h('div', { class: 'desc' }, `Saved ${new Date(info.savedAt).toLocaleString()}`) : null),
        inGame && slot !== 'auto' ? btn('Save here', () => { g.save(slot as SlotId); g.ui.invalidate(); }, 'small teal', `save-${slot}`) : null,
        info ? btn('Load', () => {
          const err = g.loadSlot(slot);
          if (err) g.ui.toast({ text: err, kind: 'bad' });
        }, 'small', `load-${slot}`) : null,
        info && slot !== 'auto' ? btn('Delete', () => { deleteSlot(slot); g.ui.invalidate(); }, 'small ghost') : null,
      );
    })),
  });
  g.ui.open(screen);
}

export function settingsScreen(g: Game) {
  const st = g.settings;
  const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'sensitivity', min: number, max: number, step: number) => h('div', null,
    h('div', { class: 'row' }, h('b', null, label), h('span', { class: 'spacer' }), h('span', { class: 'small' }, String(Math.round(st[key] * 100) / 100))),
    h('input', { type: 'range', min, max, step, value: st[key], onInput: (e) => { st[key] = Number((e.target as HTMLInputElement).value); g.applySettings(); } }));
  const check = (label: string, key: 'invertY' | 'parkingGuides' | 'steeringAssist' | 'autoLights' | 'minimap') => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: st[key], onChange: (e) => { st[key] = (e.target as HTMLInputElement).checked; g.applySettings(); g.ui.invalidate(); } }), label);
  const screen = modal(g.ui, 'settings', {
    title: 'Settings', size: 'mid',
    body: () => h('div', { class: 'grid2' },
      h('div', null,
        h('h3', null, 'Graphics'),
        h('div', { class: 'row' }, (['low', 'medium', 'high'] as const).map((q) => btn(q[0].toUpperCase() + q.slice(1), () => { st.quality = q; g.applySettings(); g.ui.invalidate(); }, `small ${st.quality === q ? 'teal' : 'ghost'}`))),
        h('p', { class: 'small muted' }, 'Quality changes (shadows, trees, traffic) apply the next time you start the game.'),
        h('div', null, h('div', { class: 'row' }, h('b', null, 'Field of view'), h('span', { class: 'spacer' }), h('span', { class: 'small' }, `${st.fov}°`)),
          h('input', { type: 'range', min: 55, max: 90, step: 1, value: st.fov, onInput: (e) => { st.fov = Number((e.target as HTMLInputElement).value); g.applySettings(); } })),
        h('h3', null, 'Sound'),
        slider('Master volume', 'master', 0, 1, 0.05), slider('Music', 'music', 0, 1, 0.05), slider('Effects', 'sfx', 0, 1, 0.05),
      ),
      h('div', null,
        h('h3', null, 'Controls & camera'),
        slider('Mouse sensitivity', 'sensitivity', 0.3, 2.5, 0.05),
        check('Invert mouse Y', 'invertY'),
        h('div', { class: 'row', style: 'margin:6px 0' }, h('b', null, 'Default driving camera'), h('span', { class: 'spacer' }),
          (['chase', 'cockpit'] as const).map((c) => btn(c, () => { st.driveCam = c; g.applySettings(); g.ui.invalidate(); }, `small ${st.driveCam === c ? 'teal' : 'ghost'}`))),
        h('h3', null, 'Driving assists'),
        check('Parking sensors & guides', 'parkingGuides'),
        check('Steering assist (cancels worn-steering pull)', 'steeringAssist'),
        check('Automatic headlights', 'autoLights'),
        h('h3', null, 'Interface'),
        h('div', { class: 'row', style: 'margin:6px 0' }, h('b', null, 'Units'), h('span', { class: 'spacer' }),
          (['imperial', 'metric'] as const).map((u) => btn(u, () => { st.units = u; g.applySettings(); g.ui.invalidate(); }, `small ${st.units === u ? 'teal' : 'ghost'}`))),
        h('div', { class: 'row', style: 'margin:6px 0' }, h('b', null, 'Needs display'), h('span', { class: 'spacer' }),
          (['auto', 'always'] as const).map((u) => btn(u, () => { st.needsHud = u; g.applySettings(); g.ui.invalidate(); }, `small ${st.needsHud === u ? 'teal' : 'ghost'}`))),
        check('Show minimap', 'minimap'),
      ),
    ),
    foot: () => [btn('Controls', () => controlsScreen(g), 'ghost'), btn('Done', () => g.ui.closeId('settings'), 'teal')],
  });
  g.ui.open(screen);
}

export function controlsScreen(g: Game) {
  const rows: [string, string][] = [
    ['W A S D', 'Walk / drive'], ['Shift', 'Run'], ['Mouse', 'Look around (click the view first)'], ['E', 'Interact / get out of the driver’s seat'],
    ['Tab', 'Phone (GPS only while driving)'], ['M', 'Map'], ['F', 'Furnishing mode (inside, parked)'], ['C', 'Chase / cockpit camera'],
    ['L', 'Headlights auto / on / off'], ['Space', 'Brake hard'], ['Q', 'Look back (driving) · rotate view (furnishing)'], ['I', 'From the driver’s seat to the living area'],
    ['R', 'Rotate item (furnishing)'], ['Del', 'Store selected item (furnishing)'], ['H', 'Hide / show HUD'], ['Esc', 'Pause / close'],
  ];
  g.ui.open(modal(g.ui, 'controls', {
    title: 'Controls', size: 'narrow',
    body: () => h('div', null, rows.map(([k, v]) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, h('span', { class: 'kbd' }, k)), h('span', { class: 'stat-value' }, v)))),
  }));
}

export function pauseScreen(g: Game) {
  g.ui.open(modal(g.ui, 'pause', {
    title: 'Paused', size: 'narrow',
    body: () => h('div', { class: 'list' },
      btn('Resume', () => g.ui.closeId('pause'), 'big', 'pause-resume'),
      btn('Save / Load', () => loadScreen(g, true), 'big secondary', 'pause-save'),
      btn('Settings', () => settingsScreen(g), 'big secondary'),
      btn('Controls', () => controlsScreen(g), 'big secondary'),
      btn('Main menu', () => {
        g.save('auto');
        g.toMenu();
      }, 'big ghost', 'pause-menu'),
      h('p', { class: 'small muted' }, 'Leaving to the main menu autosaves your game.'),
    ),
  }));
}
