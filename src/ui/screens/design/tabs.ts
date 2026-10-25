import { COVERINGS, materialDef } from '../../../data/materials';
import { VEHICLES } from '../../../data/vehicles';
import type { CoveringType, Finish, SurfaceDef, WindowDef, WindowTreatment } from '../../../data/types';
import { checkBlueprint, factoryBlueprint, makeBlueprint } from '../../../sim/blueprints';
import { money, ok } from '../../../sim/core';
import { closedTransmission, coveringArea, surfaceGeometry } from '../../../sim/finishes';
import * as reno from '../../../sim/renovation';
import { setLight } from '../../../sim/utilities';
import { defOf } from '../../../sim/vehicle';
import { BlueprintStore, downloadBlueprint, newBlueprintId, readBlueprintFile } from '../../../game/blueprintStore';
import { PREVIEW_HOURS, type DesignMode } from '../../../game/design/designMode';
import type { Game } from '../../../game/game';
import { btn, h, type Child } from '../../dom';
import { kg } from '../common';
import { materialPicker } from './materialPicker';

// Design Mode tabs beyond the catalog: surfaces, windows, lighting and the
// blueprint library, plus the inspector editors for a surface or a window.

const store = new BlueprintStore();
let blueprintName = '';
let renaming: { id: string; name: string } | null = null;
let revision = 0;

/** Bumped when the library or the rename field changes, so the panel re-renders. */
export function tabRevision(): number {
  return revision;
}

function refresh(g: Game) {
  revision++;
  g.ui.invalidate();
}

function vehicle(dm: DesignMode) {
  return dm.draft!.s.vehicles.find((v) => v.id === dm.vid)!;
}

function dot(f: Finish): Child {
  return h('span', { class: 'mat-dot', style: `background:${f.color ?? materialDef(f.mat).color}` });
}

const KIND_TITLE: Record<SurfaceDef['kind'], string> = { floor: 'Floors', wall: 'Walls', ceiling: 'Ceilings', trim: 'Trim' };

export function surfacesTab(g: Game, dm: DesignMode): Child {
  const vd = g.phys!.def, v = vehicle(dm);
  const out: Child[] = [h('p', { class: 'small muted' }, 'Click a floor, wall or ceiling in the view, or pick it here. Each zone has its own finish.')];
  for (const kind of ['floor', 'wall', 'ceiling', 'trim'] as const) {
    const list = vd.interior.surfaces.filter((s) => s.kind === kind);
    if (!list.length) continue;
    out.push(h('h3', null, KIND_TITLE[kind]));
    out.push(h('div', { class: 'list' }, list.map((s) => {
      const f = v.custom.surfaces[s.id] ?? s.factory;
      return h('div', { class: `item design-row ${dm.surface === s.id ? 'selected' : ''}`, testid: `d-surface-${s.id}`, onClick: () => dm.selectSurface(s.id) },
        dot(f), h('div', { class: 'meta' }, h('div', { class: 'name' }, s.name), h('div', { class: 'desc' }, materialDef(f.mat).name)));
    })));
  }
  return out;
}

export function surfaceEditor(g: Game, dm: DesignMode, id: string): Child {
  const vd = g.phys!.def, v = vehicle(dm);
  const s = vd.interior.surfaces.find((x) => x.id === id);
  if (!s) return null;
  const f = v.custom.surfaces[id] ?? s.factory;
  const m = materialDef(f.mat), factory = materialDef(s.factory.mat);
  const area = surfaceGeometry(vd, s).area;
  const dkg = (m.kgPerM2 - factory.kgPerM2) * area;
  const same = vd.interior.surfaces.filter((x) => x.kind === s.kind);
  const applyAll = () => dm.apply(reno.edit(dm.draft!, () => {
    for (const x of same) v.custom.surfaces[x.id] = structuredClone(f);
    return ok();
  }));
  return h('div', null,
    h('div', { class: 'design-title' }, h('div', null, h('div', { class: 'name', testid: 'd-surface-name' }, s.name),
      h('div', { class: 'small muted' }, `${area.toFixed(1)} m² · ${m.name}`))),
    h('div', { class: 'small design-details' },
      h('div', null, `${money(m.pricePerM2 * area)} in materials · about ${Math.round(m.laborPerM2 * area)} min to install yourself`),
      h('div', null, `Weight vs. the factory finish: ${dkg >= 0 ? '+' : '−'}${Math.abs(dkg).toFixed(1)} kg`)),
    materialPicker({ kinds: [s.kind], value: f, testid: 'd-surface-picker', apply: (nf) => dm.apply(reno.setFinish(dm.draft!, { surface: id }, nf)) }),
    h('div', { class: 'row wrap', style: 'margin-top:8px' },
      same.length > 1 ? btn(`Use on all ${KIND_TITLE[s.kind].toLowerCase()}`, applyAll, 'small secondary', 'd-surface-all') : null,
      btn('Factory finish', () => dm.apply(reno.setFinish(dm.draft!, { surface: id }, { ...s.factory })), 'small ghost', 'd-surface-factory')),
  );
}

function wallName(vd: { interior: { surfaces: SurfaceDef[] } }, w: WindowDef): string {
  const wall = vd.interior.surfaces.find((s) => s.wall && s.wall.side === w.side && w.a0 >= s.wall.a0 - 1e-6 && w.a1 <= s.wall.a1 + 1e-6);
  return wall?.name ?? w.side;
}

export function windowsTab(g: Game, dm: DesignMode): Child {
  const vd = g.phys!.def, v = vehicle(dm);
  const list = vd.interior.windows.filter((w) => !w.door);
  return [
    h('p', { class: 'small muted' }, 'Pick a window here or click one in the view. Coverings open and close in the game, and blackout shades help you sleep in.'),
    h('div', { class: 'list' }, list.map((w) => {
      const t = v.custom.windows[w.id] ?? w.factory;
      return h('div', { class: `item design-row ${dm.windowId === w.id ? 'selected' : ''}`, testid: `d-window-${w.id}`, onClick: () => dm.selectWindow(w.id) },
        t && t.type !== 'none' ? dot(t.fabric) : h('span', { class: 'mat-dot' }),
        h('div', { class: 'meta' }, h('div', { class: 'name' }, `Window ${w.id}`), h('div', { class: 'desc' }, `${wallName(vd, w)} · ${t ? COVERINGS[t.type].name : 'No covering'}`)));
    })),
  ];
}

const HARDWARE: WindowTreatment['hardware'][] = ['white', 'black', 'brass', 'chrome', 'wood'];

export function windowEditor(g: Game, dm: DesignMode, id: string): Child {
  const vd = g.phys!.def, v = vehicle(dm);
  const w = vd.interior.windows.find((x) => x.id === id);
  if (!w) return null;
  const t: WindowTreatment = v.custom.windows[id] ?? w.factory ?? { type: 'none', fabric: { mat: 'win_linen' }, hardware: 'white', mount: 'inside', open: 1 };
  const set = (patch: Partial<WindowTreatment>) => dm.apply(reno.setWindow(dm.draft!, id, { ...t, ...patch }));
  const allowed = (type: CoveringType, f?: Finish, second = false) => {
    const spec = COVERINGS[type];
    const groups = (second ? spec.fabrics2 : spec.fabrics) ?? [];
    return !!f && (groups.includes(materialDef(f.mat).group) || groups.includes(f.mat));
  };
  const chooseType = (type: CoveringType) => {
    const spec = COVERINGS[type];
    set({
      type,
      fabric: allowed(type, t.fabric) ? t.fabric : { mat: spec.defaultFabric },
      fabric2: type === 'day_night' ? (allowed(type, t.fabric2, true) ? t.fabric2 : { mat: spec.defaultFabric2 ?? 'win_pleat_blackout' }) : undefined,
      layer: type === 'day_night' ? t.layer ?? 'night' : undefined,
      open: 1,
    });
  };
  const fabricGroups = (type: CoveringType, second = false) => {
    const spec = COVERINGS[type];
    return [...((second ? spec.fabrics2 : spec.fabrics) ?? [])];
  };
  const price = (type: CoveringType) => {
    const spec = COVERINGS[type];
    return spec.basePrice + spec.pricePerM2 * coveringArea(w, { ...t, type });
  };
  const types = Object.keys(COVERINGS) as CoveringType[];
  const transmission = Math.round(closedTransmission(t) * 100);
  const out: Child[] = [
    h('div', { class: 'design-title' }, h('div', null, h('div', { class: 'name', testid: 'd-window-name' }, `Window ${w.id}`),
      h('div', { class: 'small muted' }, `${wallName(vd, w)} · ${(w.a1 - w.a0).toFixed(2)} × ${(w.y1 - w.y0).toFixed(2)} m`))),
    h('h3', null, 'Covering'),
    h('div', { class: 'design-covers' }, types.map((type) => h('button', {
      class: `design-cover ${t.type === type ? 'active' : ''}`, testid: `d-cover-${type}`, onClick: () => { if (t.type !== type) chooseType(type); },
    }, h('b', null, COVERINGS[type].name), h('span', { class: 'small' }, type === 'none' ? '—' : money(price(type)))))),
  ];
  if (t.type !== 'none') {
    out.push(h('h3', null, t.type === 'day_night' ? 'Day layer fabric' : 'Fabric'),
      materialPicker({ kinds: ['window'], groups: fabricGroups(t.type), value: t.fabric, testid: 'd-window-fabric', apply: (f) => dm.apply(reno.setFinish(dm.draft!, { window: id, layer: 'fabric' }, f)) }));
    if (t.type === 'day_night' && t.fabric2) {
      out.push(h('h3', null, 'Night layer fabric'),
        materialPicker({ kinds: ['window'], groups: fabricGroups(t.type, true), value: t.fabric2, testid: 'd-window-fabric2', apply: (f) => dm.apply(reno.setFinish(dm.draft!, { window: id, layer: 'fabric2' }, f)) }));
    }
    const sel = (label: string, value: string, options: string[], apply: (v: string) => void, testid: string) => {
      const el = h('select', { class: 'design-select', testid }, options.map((o) => h('option', { value: o, ...(o === value ? { selected: 'selected' } : {}) } as never, o)));
      el.addEventListener('change', () => apply(el.value));
      return h('label', { class: 'design-option' }, h('span', null, label), el);
    };
    out.push(h('h3', null, 'Details'),
      sel('Hardware', t.hardware, HARDWARE, (x) => set({ hardware: x as WindowTreatment['hardware'] }), 'd-window-hardware'),
      sel('Mount', t.mount, ['inside', 'outside'], (x) => set({ mount: x as WindowTreatment['mount'] }), 'd-window-mount'),
      t.type === 'curtains' || t.type === 'sheer' ? sel('Length', t.length ?? 'sill', ['sill', 'long'], (x) => set({ length: x as WindowTreatment['length'] }), 'd-window-length') : null,
      h('div', { class: 'row wrap', style: 'margin-top:6px' },
        t.valance ? btn('Remove valance', () => set({ valance: null }), 'small ghost', 'd-valance-off') : btn('Add a valance', () => set({ valance: { mat: 'win_linen' } }), 'small ghost', 'd-valance-on')),
      t.valance ? materialPicker({ kinds: ['window'], value: t.valance, testid: 'd-window-valance', apply: (f) => dm.apply(reno.setFinish(dm.draft!, { window: id, layer: 'valance' }, f)) }) : null,
      h('h3', null, 'Preview'),
      h('div', { class: 'row wrap' },
        btn('Open', () => set({ open: 1 }), `small ${t.open >= 0.99 ? 'teal' : 'ghost'}`, 'd-window-open'),
        btn('Half', () => set({ open: 0.5 }), `small ${t.open > 0.01 && t.open < 0.99 ? 'teal' : 'ghost'}`, 'd-window-half'),
        btn('Closed', () => set({ open: 0 }), `small ${t.open <= 0.01 ? 'teal' : 'ghost'}`, 'd-window-closed'),
        t.type === 'day_night' ? btn('Day layer', () => set({ layer: 'day' }), `small ${t.layer === 'day' ? 'teal' : 'ghost'}`, 'd-window-day') : null,
        t.type === 'day_night' ? btn('Night layer', () => set({ layer: 'night' }), `small ${t.layer !== 'day' ? 'teal' : 'ghost'}`, 'd-window-night') : null),
      h('p', { class: 'small muted' }, `Closed, it lets through about ${transmission}% of the daylight.`));
  }
  return out;
}

export function lightingTab(g: Game, dm: DesignMode): Child {
  const s = dm.draft!.s;
  const fixtures = Object.values(s.items).filter((it) => it.where.kind === 'floor' && it.where.vehicle === dm.vid && defOf(it).light);
  const all = (mode: 'auto' | 'on' | 'off') => dm.apply(reno.edit(dm.draft!, () => {
    for (const f of fixtures) {
      const r = setLight(s, dm.vid, f.uid, { mode });
      if (!r.ok) return r;
    }
    return ok();
  }));
  const sum = dm.summary();
  return [
    h('h3', null, 'Preview the light'),
    h('div', { class: 'row wrap' }, PREVIEW_HOURS.map((p, i) => btn(p.label, () => dm.cyclePreview(i), `small ${dm.previewIndex === i ? 'teal' : 'ghost'}`, `d-preview-${i}`))),
    h('p', { class: 'small muted' }, `Evening power draw with everything set to auto: ${Math.round(sum.nightLoadAfter)} W.`),
    h('h3', null, 'All lights'),
    h('div', { class: 'row wrap' }, (['auto', 'on', 'off'] as const).map((m) => btn(m === 'auto' ? 'Auto' : m === 'on' ? 'On' : 'Off', () => all(m), 'small ghost', `d-lights-${m}`))),
    h('h3', null, 'Fixtures'),
    fixtures.length ? h('div', { class: 'list' }, fixtures.map((f) => {
      const spec = defOf(f).light!;
      const st = { mode: 'auto' as const, dim: 1, kelvin: spec.kelvin[0], ...f.light };
      const change = (patch: Parameters<typeof reno.setLight>[2]) => dm.apply(reno.setLight(dm.draft!, f.uid, patch));
      const range = (key: 'dim' | 'kelvin', min: number, max: number, step: number, label: (v: number) => string) => {
        const input = h('input', { type: 'range', min, max, step, value: st[key], testid: `d-light-${key}-${f.uid}` }) as HTMLInputElement;
        const out = h('span', { class: 'small' }, label(st[key]));
        input.addEventListener('input', () => (out.textContent = label(Number(input.value))));
        input.addEventListener('change', () => change({ [key]: Number(input.value) }));
        return h('label', { class: 'picker-slider' }, h('span', { class: 'small' }, key === 'dim' ? 'Brightness' : 'Color'), input, out);
      };
      return h('div', { class: `item design-light ${dm.selected.includes(f.uid) ? 'selected' : ''}`, testid: `d-fixture-${f.uid}`, onClick: () => dm.click(f.uid) },
        h('div', { class: 'meta' },
          h('div', { class: 'name' }, defOf(f).name),
          h('div', { class: 'desc' }, `${Math.round(spec.lumens)} lm · ${Math.round(spec.watts * 10) / 10} W`),
          h('div', { class: 'row', style: 'margin-top:4px' }, (['auto', 'on', 'off'] as const).map((m) => btn(m, () => change({ mode: m }), `small ${st.mode === m ? 'teal' : 'ghost'}`, `d-light-mode-${m}-${f.uid}`))),
          spec.dimmable ? range('dim', 0.1, 1, 0.05, (x) => `${Math.round(x * 100)}%`) : null,
          spec.kelvin[1] > spec.kelvin[0] ? range('kelvin', spec.kelvin[0], spec.kelvin[1], 100, (x) => `${x} K`) : null,
          spec.rgb ? (() => {
            const input = h('input', { type: 'color', value: st.color ?? '#ffffff', class: 'picker-custom', testid: `d-light-color-${f.uid}` }) as HTMLInputElement;
            input.addEventListener('change', () => change({ color: input.value }));
            return h('label', { class: 'picker-slider' }, h('span', { class: 'small' }, 'RGB'), input);
          })() : null,
        ));
    })) : h('p', { class: 'small muted' }, 'No light fixtures yet. Find them under Lighting in the catalog.'),
  ];
}

export function blueprintsTab(g: Game, dm: DesignMode): Child {
  const vd = g.phys!.def;
  const list = store.list();
  const save = () => {
    const name = blueprintName.trim() || `${vd.shortName} design`;
    const bp = makeBlueprint(dm.draft!.s, dm.vid, { id: newBlueprintId(), name, createdAt: new Date().toISOString() });
    if (store.put(bp)) {
      blueprintName = '';
      g.ui.toast({ text: `Saved blueprint "${name}".`, kind: 'good' });
    } else g.ui.toast({ text: 'Could not save the blueprint (storage unavailable or full).', kind: 'bad' });
    refresh(g);
  };
  const nameInput = h('input', { class: 'design-search', type: 'text', placeholder: 'Blueprint name', value: blueprintName, maxlength: 40, testid: 'd-bp-name' }) as HTMLInputElement;
  nameInput.addEventListener('input', () => (blueprintName = nameInput.value));
  const file = h('input', { type: 'file', style: 'display:none', testid: 'd-bp-file' }) as HTMLInputElement;
  file.setAttribute('accept', '.json,application/json');
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    const r = await readBlueprintFile(f);
    if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
    else {
      store.put(r.blueprint);
      g.ui.toast({ text: `Imported "${r.blueprint.name}".`, kind: 'good' });
    }
    refresh(g);
  });
  const apply = (bp: Parameters<typeof reno.applyBlueprint>[1]) => {
    const r = reno.applyBlueprint(dm.draft!, bp);
    if (dm.apply(r) && r.ok) g.ui.toast({ text: `Blueprint applied: ${r.reused} pieces reused, ${r.added} to buy, ${r.removed} taken out. Review the cost before confirming.`, kind: 'info' });
  };
  return [
    h('p', { class: 'small muted' }, 'Blueprints save a whole interior: layout, sizes, finishes, coverings and lights. They fit only the same vehicle model.'),
    h('div', { class: 'row' }, nameInput, btn('Save', save, 'small teal', 'd-bp-save')),
    h('div', { class: 'row wrap', style: 'margin-top:6px' },
      btn('Import…', () => file.click(), 'small ghost', 'd-bp-import'), file,
      btn('Restore factory layout', () => apply(factoryBlueprint(vd.id)), 'small ghost', 'd-bp-factory')),
    h('h3', null, 'Saved'),
    list.length ? h('div', { class: 'list' }, list.map((bp) => {
      const fits = checkBlueprint(bp, vd);
      const editing = renaming?.id === bp.id;
      const rename = h('input', { class: 'design-search', type: 'text', value: editing ? renaming!.name : bp.name, maxlength: 40 }) as HTMLInputElement;
      rename.addEventListener('input', () => { if (renaming) renaming.name = rename.value; });
      return h('div', { class: 'item design-bp', testid: `d-bp-${bp.id}` },
        h('div', { class: 'meta' },
          editing ? h('div', { class: 'row' }, rename, btn('OK', () => { store.rename(bp.id, renaming!.name); renaming = null; refresh(g); }, 'small teal')) : h('div', { class: 'name' }, bp.name),
          h('div', { class: 'desc' }, `${VEHICLES[bp.vehicle]?.shortName ?? bp.vehicle} · ${bp.createdAt ? new Date(bp.createdAt).toLocaleDateString() : ''} · ${bp.stats.items} pieces · ${kg(bp.stats.kg)}`),
          fits.ok ? null : h('div', { class: 'desc bad' }, fits.reason),
          h('div', { class: 'row wrap', style: 'margin-top:4px' },
            btn('Load', () => apply(bp), 'small teal', `d-bp-load-${bp.id}`, !fits.ok, fits.ok ? undefined : fits.reason),
            btn('Rename', () => { renaming = { id: bp.id, name: bp.name }; refresh(g); }, 'small ghost'),
            btn('Duplicate', () => { store.duplicate(bp.id); refresh(g); }, 'small ghost'),
            btn('Export', () => downloadBlueprint(bp), 'small ghost', `d-bp-export-${bp.id}`),
            btn('Delete', () => g.screens.confirm('Delete this blueprint?', bp.name, () => { store.remove(bp.id); refresh(g); }, 'Delete'), 'small ghost')),
        ));
    })) : h('p', { class: 'small muted' }, 'No blueprints yet.'),
  ];
}

export { store as blueprintStore, refresh as refreshTabs };
