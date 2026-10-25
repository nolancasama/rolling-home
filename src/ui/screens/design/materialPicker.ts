import { MATERIAL_LIST, PALETTE } from '../../../data/materials';
import type { Finish, MaterialDef, SurfaceKind } from '../../../data/types';
import { swatch } from '../../../render/materials';
import { btn, h, type Child } from '../../dom';

// Material picker shared by surfaces, item slots and window fabrics: grouped
// swatches, a curated palette plus any custom color, pattern scale and
// direction, plank sizes and gloss. Every change is one undoable edit.

export interface PickerOpts {
  kinds: SurfaceKind[];
  /** Limit to these material groups (window coverings take specific fabrics). */
  groups?: string[];
  value: Finish;
  apply: (finish: Finish) => void;
  testid: string;
}

const swatchUrls = new Map<string, string>();

function swatchUrl(f: Finish, kind: SurfaceKind): string {
  const key = JSON.stringify([f.mat, f.color, f.color2, f.plankW, f.plankL, f.rot, kind]);
  let url = swatchUrls.get(key);
  if (!url) {
    try {
      url = swatch(f, kind, 56).toDataURL();
    } catch {
      url = '';
    }
    swatchUrls.set(key, url);
  }
  return url;
}

const DIRECTIONAL = new Set(['plank', 'wallpaper', 'tile', 'sheet', 'fabric', 'wood', 'textured']);

export function materialPicker(o: PickerOpts): Child {
  const kind = o.kinds[0];
  const materials = MATERIAL_LIST.filter((m) => m.surfaces.some((s) => o.kinds.includes(s)) && (!o.groups || o.groups.includes(m.group)));
  const groups = new Map<string, MaterialDef[]>();
  for (const m of materials) {
    const list = groups.get(m.group) ?? [];
    list.push(m);
    groups.set(m.group, list);
  }
  const current = materials.find((m) => m.id === o.value.mat) ?? materials[0];
  const value: Finish = current && current.id === o.value.mat ? o.value : { mat: current?.id ?? o.value.mat };
  const set = (patch: Partial<Finish>) => o.apply({ ...value, ...patch });
  const tiles: Child[] = [];
  for (const [group, list] of groups) {
    tiles.push(h('div', { class: 'picker-group' }, group));
    tiles.push(h('div', { class: 'picker-grid' }, list.map((m) => {
      // keep the chosen color when switching between recolorable materials
      const candidate: Finish = { mat: m.id, ...(m.tintable && value.color ? { color: value.color } : {}) };
      const url = swatchUrl(m.id === value.mat ? value : candidate, kind);
      return h('button', {
        class: `picker-tile ${m.id === value.mat ? 'active' : ''}`, title: `${m.name} · ${m.kgPerM2 ? `${m.kgPerM2} kg/m² · ` : ''}$${m.pricePerM2}/m²`,
        testid: `${o.testid}-mat-${m.id}`, onClick: () => { if (m.id !== value.mat) o.apply(candidate); },
        style: url ? `background-image:url(${url})` : `background:${m.color}`,
      });
    })));
  }
  if (!current) return h('p', { class: 'small muted' }, 'No materials fit here.');
  const controls: Child[] = [h('div', { class: 'picker-name' }, current.name, h('span', { class: 'small muted' }, ` · ${current.group}`))];
  const colorRow = (label: string, key: 'color' | 'color2', fallback: string) => h('div', { class: 'picker-colors' },
    h('span', { class: 'small' }, label),
    h('div', { class: 'picker-palette' }, PALETTE.map((c) => h('button', {
      class: `picker-dot ${(value[key] ?? fallback).toLowerCase() === c.toLowerCase() ? 'active' : ''}`, style: `background:${c}`, title: c,
      testid: `${o.testid}-${key}-${c.slice(1)}`, onClick: () => set({ [key]: c }),
    }))),
    (() => {
      const input = h('input', { type: 'color', value: value[key] ?? fallback, class: 'picker-custom', title: 'Any color', testid: `${o.testid}-${key}-custom` }) as HTMLInputElement;
      input.addEventListener('change', () => set({ [key]: input.value }));
      return input;
    })(),
    value[key] ? btn('Reset', () => set({ [key]: undefined }), 'small ghost') : null,
  );
  if (current.tintable) controls.push(colorRow('Color', 'color', current.color));
  if (current.tintable && current.color2) controls.push(colorRow('Second color', 'color2', current.color2));
  if (current.plank) {
    const chips = (label: string, key: 'plankW' | 'plankL', options: number[]) => h('div', { class: 'picker-chips' }, h('span', { class: 'small' }, label),
      options.map((v, i) => btn(`${Math.round(v * 100)} cm`, () => set({ [key]: i === 0 ? undefined : v }), `small ${(value[key] ?? options[0]) === v ? 'teal' : 'ghost'}`, `${o.testid}-${key}-${Math.round(v * 100)}`)));
    if (current.plank.widths.length > 1) controls.push(chips('Plank width', 'plankW', current.plank.widths));
    if (current.plank.lengths.length > 1) controls.push(chips('Plank length', 'plankL', current.plank.lengths));
  }
  if (DIRECTIONAL.has(current.pattern)) {
    controls.push(h('div', { class: 'picker-chips' }, h('span', { class: 'small' }, 'Direction'),
      btn('Along', () => set({ rot: undefined }), `small ${(value.rot ?? 0) === 0 ? 'teal' : 'ghost'}`, `${o.testid}-rot-0`),
      btn('Across', () => set({ rot: 90 }), `small ${value.rot === 90 ? 'teal' : 'ghost'}`, `${o.testid}-rot-90`)));
  }
  const slider = (label: string, key: 'scale' | 'roughness', min: number, max: number, step: number, fallback: number, show: (v: number) => string) => {
    const input = h('input', { type: 'range', min, max, step, value: value[key] ?? fallback, testid: `${o.testid}-${key}` }) as HTMLInputElement;
    const out = h('span', { class: 'small' }, show(value[key] ?? fallback));
    input.addEventListener('input', () => (out.textContent = show(Number(input.value))));
    input.addEventListener('change', () => set({ [key]: Math.abs(Number(input.value) - fallback) < 1e-6 ? undefined : Number(input.value) }));
    return h('label', { class: 'picker-slider' }, h('span', { class: 'small' }, label), input, out);
  };
  if (current.pattern !== 'paint' && current.pattern !== 'plastic') controls.push(slider('Pattern scale', 'scale', 0.5, 2, 0.05, 1, (v) => `${Math.round(v * 100)}%`));
  controls.push(slider('Finish', 'roughness', 0.05, 1, 0.05, current.roughness, (v) => (v < 0.3 ? 'gloss' : v < 0.6 ? 'satin' : 'matte')));
  return h('div', { class: 'picker', testid: o.testid }, h('div', { class: 'picker-tiles' }, tiles), h('div', { class: 'picker-controls' }, controls));
}
