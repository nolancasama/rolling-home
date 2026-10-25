import { itemDef } from '../../../data/items';
import { materialDef } from '../../../data/materials';
import type { FamilySpec, ItemConfig, ItemDef } from '../../../data/types';
import { money } from '../../../sim/core';
import { normalizeConfig } from '../../../sim/families';
import * as reno from '../../../sim/renovation';
import { defOf, mattressOn } from '../../../sim/vehicle';
import type { Game } from '../../../game/game';
import { CATALOG_CATEGORIES, formatLength, PREVIEW_HOURS, type DesignMode, type DesignTab } from '../../../game/design/designMode';
import { append, btn, clear, h, type Child } from '../../dom';
import type { Screen } from '../../ui';
import { kg, liters, thumbEl } from '../common';
import { materialPicker } from './materialPicker';
import { blueprintsTab, lightingTab, surfaceEditor, surfacesTab, tabRevision, windowEditor, windowsTab } from './tabs';

// Design Mode panels (non-modal: the 3D view stays interactive). Each region
// re-renders only when what it shows changed, so placing stays smooth and the
// search field keeps its focus.

const TABS: { id: DesignTab; label: string; title: string }[] = [
  { id: 'build', label: 'Build', title: 'Furniture, cabinets, appliances and systems' },
  { id: 'surfaces', label: 'Surfaces', title: 'Floors, walls, ceilings and trim' },
  { id: 'windows', label: 'Windows', title: 'Curtains, shades and blinds' },
  { id: 'lighting', label: 'Lights', title: 'Fixture settings and the time-of-day preview' },
  { id: 'blueprints', label: 'Blueprints', title: 'Save, load and share whole interiors' },
];

export function designPanel(g: Game) {
  const dm = g.design;
  const el = h('div', { class: 'design-ui', testid: 'design' });
  const top = h('div', { class: 'design-top' });
  const search = h('input', { class: 'design-search', type: 'search', placeholder: 'Search the catalog', testid: 'design-search', value: dm.query }) as HTMLInputElement;
  search.addEventListener('input', () => {
    dm.query = search.value;
    renderCatalog(true);
  });
  const chips = h('div', { class: 'design-chips' });
  const list = h('div', { class: 'design-catalog scroll', testid: 'design-catalog' });
  const tabs = h('div', { class: 'design-tabs', testid: 'design-tabs' });
  const buildBody = h('div', { class: 'design-left-body' }, search, chips, list);
  const tabBody = h('div', { class: 'design-left-body design-tab-body', testid: 'design-tab-body' });
  const left = h('div', { class: 'design-left' },
    h('div', { class: 'card-head' }, h('h2', null, 'Design')),
    tabs, buildBody, tabBody,
  );
  const inspector = h('div', { class: 'design-inspector', testid: 'design-inspector' });
  const summaryEl = h('div', { class: 'design-summary', testid: 'design-summary' });
  const right = h('div', { class: 'design-right' },
    h('div', { class: 'card-head' }, h('h2', null, 'Your RV')),
    h('div', { class: 'card-body design-right-body' }, inspector, summaryEl),
  );
  const hint = h('div', { class: 'design-hint' });
  const labels = h('div', { class: 'design-labels' });
  el.append(left, right, top, hint, labels);
  dm.labelLayer = labels;

  const sig: Record<string, string> = {};
  const changed = (key: string, value: string) => {
    if (sig[key] === value) return false;
    sig[key] = value;
    return true;
  };

  const renderTop = () => {
    const sum = dm.summary();
    const creative = g.sim!.s.gameType === 'creative';
    if (!changed('top', [dm.version, dm.walls, dm.tool, dm.showGrid, dm.previewIndex, dm.walking, dm.draft?.undo.length, dm.draft?.redo.length, sum.total, creative && g.sim!.s.creativeRelaxed].join('|'))) return;
    clear(top);
    const tool = (label: string, on: boolean, fn: () => void, testid: string, title: string) => btn(label, fn, `small ${on ? 'teal' : 'ghost'}`, testid, false, title);
    append(top, [
      h('div', { class: 'design-group' },
        tool('Select', dm.tool === 'select', () => dm.setTool('select'), 'd-tool-select', 'Select and move pieces'),
        tool('Measure', dm.tool === 'measure', () => dm.setTool(dm.tool === 'measure' ? 'select' : 'measure'), 'd-tool-measure', 'Measure distances and free wall space (M)'),
      ),
      h('div', { class: 'design-group' },
        h('span', { class: 'design-group-label' }, 'Walls'),
        tool('Up', dm.walls === 'up', () => dm.setWalls('up'), 'd-walls-up', 'Walls up (1)'),
        tool('Cut', dm.walls === 'cut', () => dm.setWalls('cut'), 'd-walls-cut', 'Cutaway (2)'),
        tool('Down', dm.walls === 'down', () => dm.setWalls('down'), 'd-walls-down', 'Walls down (3)'),
      ),
      h('div', { class: 'design-group' },
        tool('Grid', dm.showGrid, () => dm.toggleGrid(), 'd-grid', 'Grid (G)'),
        tool('Top', false, () => dm.cam?.top(), 'd-top', 'Top view (T)'),
        tool('Walk', dm.walking, () => dm.toggleWalk(), 'd-walk', 'Walk through the design (V)'),
        tool(`Light: ${PREVIEW_HOURS[dm.previewIndex].label}`, dm.previewIndex !== 0, () => dm.cyclePreview(), 'd-preview', 'Preview the time of day (N)'),
      ),
      creative ? h('div', { class: 'design-group' },
        tool('Relaxed rules', !!g.sim!.s.creativeRelaxed, () => dm.setRelaxed(!g.sim!.s.creativeRelaxed), 'd-relaxed', 'Creative: hookups, gas and the door size only warn instead of blocking'),
      ) : null,
      h('div', { class: 'design-group' },
        btn('↶ Undo', () => dm.undo(), 'small ghost', 'd-undo', !dm.draft?.undo.length, 'Undo (Ctrl+Z)'),
        btn('↷ Redo', () => dm.redo(), 'small ghost', 'd-redo', !dm.draft?.redo.length, 'Redo (Ctrl+Y)'),
      ),
      h('div', { class: 'design-group' },
        btn('Discard', () => g.screens.confirm('Discard all changes?', 'Nothing will be bought or changed.', () => dm.discard(), 'Discard'), 'small ghost', 'd-discard'),
        btn(sum.changed ? `Review & confirm · ${money(sum.total)}` : 'Done', () => dm.done(), 'small', 'd-done'),
      ),
    ]);
  };

  const renderTabs = () => {
    if (!changed('tabs', dm.tab)) return;
    clear(tabs);
    for (const t of TABS) tabs.append(h('button', { class: `design-tab ${dm.tab === t.id ? 'active' : ''}`, testid: `d-tab-${t.id}`, title: t.title, onClick: () => dm.setTab(t.id) }, t.label));
    buildBody.style.display = dm.tab === 'build' ? '' : 'none';
    tabBody.style.display = dm.tab === 'build' ? 'none' : '';
  };

  const renderChips = () => {
    if (!changed('chips', dm.category)) return;
    clear(chips);
    for (const c of CATALOG_CATEGORIES) {
      chips.append(h('button', { class: `chip ${dm.category === c.id ? 'active' : ''}`, testid: `d-cat-${c.id}`, onClick: () => { dm.category = c.id; renderChips(); renderCatalog(true); } }, c.label));
    }
  };

  const renderCatalog = (force = false) => {
    if (dm.tab !== 'build') return;
    if (!changed('catalog', [dm.version, dm.category, dm.query].join('|')) && !force) return;
    clear(list);
    const q = dm.query.trim().toLowerCase();
    const entries = dm.catalog().filter((e) => {
      if (dm.category === 'owned' && !e.owned.length) return false;
      if (dm.category !== 'all' && dm.category !== 'owned' && e.category !== dm.category) return false;
      return !q || e.def.name.toLowerCase().includes(q) || e.def.description.toLowerCase().includes(q);
    });
    if (!entries.length) list.append(h('p', { class: 'small muted' }, dm.category === 'owned' ? 'Nothing in storage to place. Pieces you buy or take out wait here.' : 'Nothing matches.'));
    for (const e of entries) {
      const d = e.def;
      const fp = d.floor?.footprint;
      const size = fp ? `${fp[0].toFixed(2)} × ${fp[1].toFixed(2)} × ${(d.floor!.height).toFixed(2)} m` : d.slot ? `${d.slot.kind} bay` : '';
      const badges: Child[] = [];
      if (e.owned.length) badges.push(h('span', { class: 'badge good' }, `owned ×${e.owned.length}`));
      if (d.floor?.ac) badges.push(h('span', { class: 'badge warn' }, '120 V'));
      if (d.floor?.plumbing) badges.push(h('span', { class: 'badge' }, 'plumbing'));
      if (d.floor?.propane) badges.push(h('span', { class: 'badge' }, 'gas'));
      if (d.light) badges.push(h('span', { class: 'badge' }, `${Math.round(d.light.watts * 10) / 10} W`));
      if (d.family) badges.push(h('span', { class: 'badge' }, 'sizes'));
      const pick = () => (e.owned.length && dm.category === 'owned' ? dm.startOwned(e.owned[0].uid) : dm.startNew(d.id));
      list.append(h('div', { class: 'item design-card', testid: `d-item-${d.id}`, onClick: pick, title: d.description },
        thumbEl(itemDef(d.id)),
        h('div', { class: 'meta' },
          h('div', { class: 'name' }, d.name),
          h('div', { class: 'desc' }, [size, kg(d.mass)].filter(Boolean).join(' · ')),
          badges.length ? h('div', { class: 'badges' }, badges) : null,
        ),
        h('div', { class: 'price' }, e.owned.length && dm.category === 'owned' ? 'Place' : money(d.price)),
      ));
    }
  };

  const renderTabBody = () => {
    if (dm.tab === 'build') return;
    if (!changed('tabBody', [dm.tab, dm.version, dm.surface, dm.windowId, dm.selected.join(','), dm.previewIndex, tabRevision()].join('|'))) return;
    const scroll = tabBody.scrollTop;
    clear(tabBody);
    const body = dm.tab === 'surfaces' ? surfacesTab(g, dm) : dm.tab === 'windows' ? windowsTab(g, dm) : dm.tab === 'lighting' ? lightingTab(g, dm) : blueprintsTab(g, dm);
    append(tabBody, [body]);
    tabBody.scrollTop = scroll;
  };

  const renderInspector = () => {
    const sess = dm.session;
    const key = [dm.tab, dm.surface, dm.windowId, dm.slot, dm.version, dm.selected.join(','), sess ? `${sess.kind}:${JSON.stringify(sess.cand)}:${sess.issues.map((i) => i.text).join('/')}:${sess.kind === 'new' ? JSON.stringify(sess.config) : ''}` : '', dm.tool, dm.measure.text, dm.measure.band].join('|');
    if (!changed('inspector', key)) return;
    const body = inspector.parentElement!;
    const scroll = body.scrollTop;
    clear(inspector);
    const content = dm.tab === 'surfaces' && dm.surface ? surfaceEditor(g, dm, dm.surface)
      : dm.tab === 'windows' && dm.windowId ? windowEditor(g, dm, dm.windowId)
        : dm.tab === 'surfaces' ? h('p', { class: 'small muted' }, 'Click a floor, wall, ceiling or trim run to change its finish. With the walls cut away, click the lower part of a wall.')
          : dm.tab === 'windows' ? h('p', { class: 'small muted' }, 'Click a window (or pick one on the left) to choose its covering, fabric and hardware.')
            : inspectorBody(g, dm);
    append(inspector, [content]);
    body.scrollTop = scroll;
  };

  const renderSummary = () => {
    if (!changed('summary', `${dm.version}:${dm.pro}`)) return;
    clear(summaryEl);
    append(summaryEl, [summaryBody(g, dm)]);
  };

  const renderHint = () => {
    const text = dm.walking ? 'WASD walk · mouse look · V or Esc: back to the editor'
      : dm.session ? 'Move the mouse to position · click to place · R rotate · arrows nudge · Alt: no snapping · Esc cancel'
        : dm.tool === 'measure' ? 'Click two points to measure · hover a wall for free space · B: floor / upper band · Esc: done'
          : dm.tab === 'surfaces' ? 'Click a surface to select it · right-drag orbit · middle-drag pan · wheel zoom'
            : dm.tab === 'windows' ? 'Click a window to select it · right-drag orbit · wheel zoom'
              : 'Click to select (Shift adds) · drag to move · Del remove · Ctrl+D duplicate · Ctrl+Z undo · right-drag orbit · middle-drag pan · wheel zoom';
    if (!changed('hint', text)) return;
    hint.textContent = text;
  };

  const screen: Screen = {
    id: 'design', el, pauses: false, blocks: false, escClose: false,
    render: () => {
      renderTop();
      renderTabs();
      renderChips();
      renderCatalog();
      renderTabBody();
      renderInspector();
      renderSummary();
      renderHint();
      el.classList.toggle('walking', dm.walking);
    },
  };
  g.ui.open(screen);
}

function issueList(issues: { text: string; severity: 'block' | 'warn' }[], testid: string): Child {
  if (!issues.length) return null;
  return h('ul', { class: 'issues design-issues', testid }, issues.map((i) => h('li', { class: i.severity }, i.text)));
}

function detailRows(d: ItemDef): Child {
  const fp = d.floor?.footprint;
  const rows: Child[] = [];
  if (fp) rows.push(h('div', null, `${fp[0].toFixed(2)} wide × ${fp[1].toFixed(2)} deep × ${d.floor!.height.toFixed(2)} m high`));
  rows.push(h('div', null, `${kg(d.mass)}${d.storage ? ` · ${liters(d.storage.liters)} storage (up to ${kg(d.storage.maxKg)})` : ''}`));
  if (d.light) rows.push(h('div', null, `${Math.round(d.light.lumens)} lm · ${Math.round(d.light.watts * 10) / 10} W when lit`));
  if (d.floor?.ac) rows.push(h('div', null, `Needs 120 V AC (${d.floor.ac.watts} W)`));
  return h('div', { class: 'small design-details' }, rows);
}

/** Size and option controls for a parametric family. */
function configEditor(g: Game, def: ItemDef, config: ItemConfig, apply: (patch: ItemConfig) => void): Child {
  const fam = def.family as FamilySpec | undefined;
  if (!fam) return null;
  const clearance = g.phys!.def.interior.ceilingY - g.phys!.def.interior.floorY;
  const c = normalizeConfig(def, config, clearance);
  const rows: Child[] = [];
  const stepper = (label: string, key: 'w' | 'h' | 'd', range?: [number, number | 'clearance', number]) => {
    if (!range) return;
    const [min, maxRaw, step] = range;
    const max = maxRaw === 'clearance' ? clearance : maxRaw;
    const v = c[key] ?? min;
    rows.push(h('div', { class: 'design-stepper' }, h('span', null, label),
      btn('−', () => apply({ [key]: Math.max(min, Number((v - step).toFixed(4))) }), 'small ghost', `d-cfg-${key}-minus`, v <= min + 1e-6),
      h('b', null, `${v.toFixed(2)} m`),
      btn('+', () => apply({ [key]: Math.min(max, Number((v + step).toFixed(4))) }), 'small ghost', `d-cfg-${key}-plus`, v >= max - 1e-6),
    ));
  };
  stepper('Width', 'w', fam.w);
  stepper('Height', 'h', fam.h);
  stepper('Depth', 'd', fam.d);
  const LABELS: Record<string, string> = {
    front: 'Fronts', style: 'Door style', handle: 'Handles', arms: 'Arms', legs: 'Legs', size: 'Size', drawers: 'Drawers', shelves: 'Shelves',
    length: 'Length (m)',
  };
  for (const [key, options] of Object.entries(fam.options ?? {})) {
    const k = key as keyof ItemConfig;
    if (k === 'drawers' && !(c.front === 'drawers' || c.front === 'mixed')) continue;
    const sel = h('select', { class: 'design-select', testid: `d-cfg-${k}` }, (options ?? []).map((o) => h('option', { value: String(o), ...(String(c[k]) === String(o) ? { selected: 'selected' } : {}) } as never, String(o))));
    sel.addEventListener('change', () => apply({ [k]: typeof options![0] === 'number' ? Number(sel.value) : sel.value } as ItemConfig));
    rows.push(h('label', { class: 'design-option' }, h('span', null, LABELS[k] ?? k), sel));
  }
  return h('div', { class: 'design-config' }, h('h3', null, 'Size & options'), rows);
}

function inspectorBody(g: Game, dm: DesignMode): Child {
  const s = dm.draft!.s;
  const units = g.settings.units;
  const sess = dm.session;
  if (dm.tool === 'measure' && !sess) {
    return h('div', null, h('h3', null, 'Measure'),
      h('p', { class: 'small' }, 'Click two points on the floor plan. Hover a wall to see the free space along it.'),
      h('div', { class: 'row' }, btn(dm.measure.band === 'floor' ? 'Band: floor (0–0.9 m)' : 'Band: upper (1.35 m up)', () => { dm.measure.band = dm.measure.band === 'floor' ? 'upper' : 'floor'; g.ui.invalidate(); }, 'small ghost', 'd-measure-band')),
      dm.measure.text ? h('div', { class: 'callout small', testid: 'd-measure-text' }, dm.measure.text) : null,
      dm.measure.a && dm.measure.b ? h('div', { class: 'small' }, `Distance: ${formatLength(dm.measure.a.distanceTo(dm.measure.b), units)}`) : null);
  }
  if (sess) {
    const def = dm.sessionDef();
    const name = def.name;
    const status = sess.issues.some((i) => i.severity === 'block') ? 'bad' : sess.issues.length ? '' : 'good';
    return h('div', null,
      h('div', { class: 'design-title' }, thumbEl(itemDef(def.id)), h('div', null, h('div', { class: 'name' }, sess.kind === 'move' ? `Moving: ${name}${sess.uids.length > 1 ? ` + ${sess.uids.length - 1}` : ''}` : `Placing: ${name}`),
        h('div', { class: 'small muted' }, sess.kind === 'new' ? money(def.price) : 'Owned'))),
      detailRows(def),
      sess.kind === 'new' ? configEditor(g, itemDef(sess.defId), sess.config ?? {}, (patch) => {
        sess.config = normalizeConfig(itemDef(sess.defId), { ...sess.config, ...patch }, g.phys!.def.interior.ceilingY - g.phys!.def.interior.floorY);
        dm.refreshSession();
      }) : null,
      sess.issues.length ? issueList(sess.issues, 'placement-issues') : h('div', { class: `callout ${status} small`, testid: 'placement-ok' }, 'Fits here.'),
      h('div', { class: 'row wrap', style: 'margin-top:8px' },
        btn('Rotate (R)', () => dm.rotateSelected(1), 'small ghost', 'd-rotate'),
        btn('Place', () => dm.place(), 'small teal', 'd-place', sess.issues.some((i) => i.severity === 'block')),
        btn('Cancel', () => dm.endSession(), 'small ghost', 'd-cancel'),
      ),
    );
  }
  if (dm.selected.length > 1) {
    return h('div', null, h('h3', null, `${dm.selected.length} pieces selected`),
      h('p', { class: 'small muted' }, 'Drag any of them to move the group.'),
      h('div', { class: 'row wrap' }, btn('Remove all', () => dm.removeSelected(), 'small ghost', 'd-remove'), btn('Deselect', () => { dm.selected = []; g.ui.invalidate(); }, 'small ghost')));
  }
  const uid = dm.selected[0];
  const it = uid ? s.items[uid] : null;
  if (!it) {
    const systems = Object.values(s.items).filter((i) => i.where.kind === 'slot' && i.where.vehicle === dm.vid);
    return h('div', null,
      h('p', { class: 'small muted' }, 'Pick something from the catalog to place it, or click a piece in your RV to select, move, resize, recolor or remove it.'),
      h('h3', null, 'Installed systems'),
      systems.length ? h('div', { class: 'list' }, systems.map((sys) => h('div', { class: 'item design-row' },
        h('div', { class: 'meta' }, h('div', { class: 'name' }, defOf(sys).name), h('div', { class: 'desc' }, `${(sys.where as { slot: string }).slot} · ${kg(defOf(sys).mass)}`)),
        btn('Remove', () => dm.apply(reno_remove(dm, sys.uid)), 'small ghost', `d-sys-remove-${sys.def}`)))) : h('p', { class: 'small muted' }, 'None.'),
    );
  }
  const d = defOf(it);
  const isNew = !dm.draft!.base.items[it.uid];
  const states = d.floor?.states ?? [];
  const state = it.state ?? states[0]?.id;
  const sum = dm.summary();
  const issues = sum.issues.filter((i) => i.uid === it.uid);
  const gap = d.family?.id === 'cabinet' && isNew ? dm.wallGap(it.uid) : null;
  const mattress = d.features?.bed?.usesMattress ? mattressOn(s, it.uid) : null;
  const mattressOptions = d.features?.bed?.usesMattress ? dm.catalog().filter((e) => e.def.features?.mattress?.size === d.features!.bed!.mattressSize) : [];
  return h('div', null,
    h('div', { class: 'design-title' }, thumbEl(itemDef(d.id)), h('div', null, h('div', { class: 'name', testid: 'd-selected-name' }, d.name),
      h('div', { class: 'small muted' }, isNew ? `New · ${money(d.price)}` : `Owned · condition ${Math.round(it.condition * 100)}%`))),
    detailRows(d),
    states.length > 1 ? h('div', { class: 'design-states' }, h('span', { class: 'small' }, 'Preview:'), states.map((st) => btn(st.label, () => dm.apply(reno_state(dm, it.uid, st.id)), `small ${st.id === state ? 'teal' : 'ghost'}`, `d-state-${st.id}`))) : null,
    isNew && d.family ? configEditor(g, itemDef(it.def), it.config ?? {}, (patch) => dm.setConfig(it.uid, patch)) : null,
    gap ? h('div', { class: 'row small', style: 'margin:6px 0' }, `Free wall here: ${formatLength(gap.length, units)}`, btn('Fit to gap', () => dm.fitToGap(it.uid), 'small secondary', 'd-fit-gap')) : null,
    mattress || mattressOptions.length ? h('div', { class: 'design-config' }, h('h3', null, 'Mattress'),
      h('div', { class: 'small' }, mattress ? defOf(mattress).name : 'none'),
      h('div', { class: 'row wrap' }, mattressOptions.filter((e) => e.def.id !== mattress?.def).map((e) => btn(`${e.owned.length ? 'Use' : 'Buy'} ${e.def.name.replace(/ \(.*\)$/, '')}${e.owned.length ? '' : ` ${money(e.def.price)}`}`,
        () => dm.apply(reno_mattress(dm, it.uid, e.owned[0]?.uid ?? e.def.id)), 'small ghost', `d-mattress-${e.def.id}`)))) : null,
    d.slots?.length ? h('div', { class: 'design-config' }, h('h3', null, 'Materials'), d.slots.map((slot) => {
      const f = it.finish?.[slot.id] ?? slot.default;
      const open = dm.slot === slot.id;
      return h('div', { class: 'design-slot-wrap' },
        h('button', { class: `design-slot ${open ? 'active' : ''}`, testid: `d-slot-${slot.id}`, onClick: () => { dm.slot = open ? null : slot.id; g.ui.invalidate(); } },
          h('span', { class: 'mat-dot', style: `background:${f.color ?? materialDef(f.mat).color}` }),
          h('span', { class: 'design-slot-name' }, h('b', null, slot.label), ` ${materialDef(f.mat).name}`),
          h('span', { class: 'small muted' }, open ? 'Close' : 'Change')),
        open ? materialPicker({ kinds: slot.surfaces, value: f, testid: `d-slot-picker-${slot.id}`, apply: (nf) => dm.apply(reno.setFinish(dm.draft!, { uid: it.uid, slot: slot.id }, nf)) }) : null,
      );
    })) : null,
    issueList(issues, 'd-item-issues'),
    h('div', { class: 'row wrap', style: 'margin-top:8px' },
      btn('Move', () => dm.startMove([it.uid]), 'small teal', 'd-move'),
      btn('Rotate (R)', () => dm.rotateSelected(1), 'small ghost', 'd-rotate'),
      btn('Duplicate', () => dm.duplicateSelected(), 'small ghost', 'd-duplicate'),
      btn(isNew ? 'Remove' : 'Take out', () => dm.removeSelected(), 'small ghost', 'd-remove'),
    ),
  );
}

// Thin wrappers keep the inspector free of draft plumbing.
function reno_remove(dm: DesignMode, uid: string) { return reno.remove(dm.draft!, uid); }
function reno_state(dm: DesignMode, uid: string, state: string) { return reno.setState(dm.draft!, uid, state); }
function reno_mattress(dm: DesignMode, bed: string, mattress: string) { return reno.swapMattress(dm.draft!, bed, mattress); }

function delta(before: number, after: number, unit: string, digits = 0): string {
  const d = after - before;
  if (Math.abs(d) < 0.5 * Math.pow(10, -digits)) return '';
  return ` (${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)} ${unit})`;
}

function summaryBody(g: Game, dm: DesignMode): Child {
  const sum = dm.summary();
  const wb = sum.weightBefore, wa = sum.weightAfter;
  const rows: Child[] = [];
  const line = (label: string, value: Child, cls = '') => h('div', { class: `design-line ${cls}` }, h('span', null, label), h('b', null, value));
  rows.push(h('h3', null, 'Weight'));
  rows.push(line('Gross', `${kg(wa.total)} / ${kg(wa.gvwr)}${delta(wb.total, wa.total, 'kg')}`, wa.overGvwr > 0 ? 'bad' : ''));
  rows.push(line('Payload left', kg(wa.payloadLeft), wa.payloadLeft < 0 ? 'bad' : ''));
  rows.push(line('Front axle', `${kg(wa.front)} / ${kg(wa.frontGawr)}${delta(wb.front, wa.front, 'kg')}`, wa.overFront > 0 ? 'bad' : ''));
  rows.push(line('Rear axle', `${kg(wa.rear)} / ${kg(wa.rearGawr)}${delta(wb.rear, wa.rear, 'kg')}`, wa.overRear > 0 ? 'bad' : ''));
  rows.push(h('h3', null, 'Living'));
  const sb = sum.storageBefore, sa = sum.storageAfter;
  rows.push(line('Storage', `${liters(sa.used)} used of ${liters(sa.liters)}${delta(sb.liters, sa.liters, 'L')}`));
  rows.push(line('Night power draw', `${Math.round(sum.nightLoadAfter)} W${delta(sum.nightLoadBefore, sum.nightLoadAfter, 'W')}`));
  if (sum.removed.length) {
    rows.push(h('h3', null, 'Taking out'));
    for (const r of sum.removed) rows.push(line(r.name, r.disposition === 'sell' ? `sell · +${money(r.value)}` : r.disposition));
  }
  rows.push(h('h3', null, 'Cost so far'));
  rows.push(line('Total', money(sum.total), sum.total > g.sim!.s.cash && g.sim!.s.gameType !== 'creative' ? 'bad' : ''));
  if (sum.diyMinutes > 0) rows.push(line('Your time (DIY)', `${Math.floor(sum.diyMinutes / 60)} h ${Math.round(sum.diyMinutes % 60)} min`));
  const blocks = sum.issues.filter((i) => i.severity === 'block'), warns = sum.issues.filter((i) => i.severity === 'warn');
  if (blocks.length || warns.length) {
    rows.push(h('h3', null, 'Needs attention'));
    const owner = (uid?: string) => {
      const it = uid ? dm.draft!.s.items[uid] : undefined;
      return it ? `${defOf(it).name}: ` : '';
    };
    rows.push(h('ul', { class: 'issues design-issues', testid: 'd-issues' }, [...blocks, ...warns].slice(0, 8).map((i) => h('li', {
      class: i.severity, onClick: () => { if (i.uid) dm.click(i.uid); },
    }, `${owner(i.uid)}${i.text}`))));
  }
  return h('div', null, rows);
}
