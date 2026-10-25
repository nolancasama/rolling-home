import { storedFurniture } from '../../sim/furnish';
import { activeVehicle, capacities, defOf, itemName, mattressOn, slotItems, slotUse, vdef } from '../../sim/vehicle';
import type { SlotKind } from '../../data/types';
import { powerStatus } from '../../sim/utilities';
import type { Game } from '../../game/game';
import { btn, clear, h, tabs, type Child } from '../dom';
import type { Screen } from '../ui';
import { kg, liters, thumbEl } from './common';
import { weightPanel } from './phone';

// Side panels for furnishing mode (non-modal: the 3D view stays interactive).

export function furnishPanel(g: Game) {
  const el = h('div', { class: 'furnish-ui', testid: 'furnish' });
  const screen: Screen = {
    id: 'furnish', el, pauses: false, blocks: false, escClose: false,
    render: () => {
      clear(el);
      const fm = g.furnish;
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const left = h('div', { class: 'furnish-left' },
        h('div', { class: 'card-head' }, h('h2', null, 'Furnishing')),
        h('div', { class: 'card-body scroll' },
          tabs([{ id: 'floor', label: 'Furniture' }, { id: 'systems', label: 'Systems' }], fm.tab, (id) => { fm.tab = id as 'floor' | 'systems'; g.ui.invalidate(); }, 'ftab'),
          fm.tab === 'floor' ? floorList(g) : systemsList(g),
        ),
      );
      const sel = fm.selected ? s.items[fm.selected] : null;
      const mv = fm.moving;
      let selPanel: Child = h('p', { class: 'small muted' }, 'Click a piece of furniture to select it. Right-drag to orbit, wheel to zoom.');
      if (mv) {
        const it = s.items[mv.uid];
        selPanel = h('div', null,
          h('div', { style: 'font-weight:900' }, `Placing: ${itemName(it)}`),
          h('p', { class: 'small' }, 'Move the mouse to position it. R rotates. Click to place. Right-click cancels.'),
          mv.issues.length ? h('ul', { class: 'issues', testid: 'placement-issues' }, mv.issues.map((i) => h('li', { style: i.severity === 'warn' ? 'color:#b87918' : '' }, `${i.severity === 'warn' ? 'Warning: ' : ''}${i.text}`))) : h('div', { class: 'callout good small', testid: 'placement-ok' }, 'Fits here.'),
          h('div', { class: 'row', style: 'margin-top:6px' }, btn('Rotate (R)', () => fm.rotate(), 'small ghost', 'f-rotate'), btn('Place', () => fm.place(), 'small teal', 'f-place', mv.issues.some((issue) => issue.severity === 'block')), btn('Cancel', () => fm.cancelMove(), 'small ghost')),
        );
      } else if (sel) {
        const d = defOf(sel);
        const bed = d.features?.bed?.usesMattress;
        const mat = bed ? mattressOn(s, sel.uid) : null;
        const mats = bed ? storedFurniture(s, v.id).filter((i) => defOf(i).features?.mattress?.size === d.features!.bed!.mattressSize) : [];
        selPanel = h('div', null,
          thumbEl(d, true), h('div', { style: 'font-weight:900' }, d.name), h('p', { class: 'small' }, d.description),
          h('div', { class: 'small' }, `${kg(d.mass)} · condition ${Math.round(sel.condition * 100)}%${d.storage ? ` · ${liters(d.storage.liters)} storage` : ''}`),
          bed ? h('div', { class: 'small', style: 'margin-top:4px' }, `Mattress: ${mat ? defOf(mat).name : 'none'}`) : null,
          mats.map((m) => btn(`Swap in ${defOf(m).name}`, () => { const r = g.sim!.swapMattress(sel.uid, m.uid); if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' }); else g.vv!.sync(g.sim!.s, true); }, 'small secondary', `swap-${m.def}`)),
          h('div', { class: 'row wrap', style: 'margin-top:8px' }, btn('Move', () => fm.startMove(sel.uid), 'small teal', 'f-move'), btn('Rotate', () => fm.rotate(), 'small ghost'), btn('Put in storage', () => fm.store(sel.uid), 'small ghost', 'f-store')),
        );
      }
      const caps = capacities(s, v.id);
      const pw = powerStatus(s, v, { occupied: true });
      const right = h('div', { class: 'furnish-right' },
        h('div', { class: 'card-head' }, h('h2', null, 'Your RV')),
        h('div', { class: 'card-body scroll' },
          selPanel,
          h('h3', null, 'Weight'), weightPanel(g, true),
          h('h3', null, 'Living'),
          h('div', { class: 'small' }, `Comfort ${caps.comfort.toFixed(0)} · best bed ${Math.round(caps.bestBed.quality * 100)}% · battery ${Math.round(caps.batteryWh)} Wh · solar ${Math.round(caps.solarW)} W · draw ${Math.round(pw.loadW)} W`),
        ),
      );
      const top = h('div', { class: 'furnish-top' },
        btn('Cancel changes', () => fm.cancel(), 'ghost', 'f-cancel'), btn('Done', () => fm.done(), 'teal', 'f-done'));
      const hint = h('div', { class: 'furnish-hint' }, mv ? 'Mouse: position · R: rotate · Click: place · Right-click: cancel' : 'Click furniture to select · Right-drag: orbit · Wheel: zoom · R: rotate · Del: store');
      el.append(left, right, top, hint);
      void vdef;
    },
  };
  g.ui.open(screen);
}

function floorList(g: Game): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const stored = storedFurniture(s, v.id).filter((i) => defOf(i).floor);
  return h('div', null,
    h('p', { class: 'small muted' }, 'Furniture in your storage. Blue zones have plumbing, orange keeps the door clear.'),
    stored.length ? h('div', { class: 'list' }, stored.map((it) => h('div', { class: 'item', testid: `fstore-${it.def}` }, thumbEl(defOf(it)),
      h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(it)), h('div', { class: 'desc' }, `${defOf(it).floor!.footprint.join(' × ')} m`)),
      btn('Place', () => g.furnish.startMove(it.uid), 'small teal', `fplace-${it.def}`)))) : h('p', { class: 'small' }, 'Nothing to place. Buy furniture at RV supply shops and outfitters.'),
  );
}

function systemsList(g: Game): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const def = vdef(v);
  const slots = Object.keys(def.slots) as SlotKind[];
  const stored = storedFurniture(s, v.id).filter((i) => defOf(i).slot);
  return h('div', null, slots.map((k) => {
    const u = slotUse(s, v.id, k);
    const inst = slotItems(s, v.id, k);
    return h('div', { style: 'margin-bottom:10px' },
      h('div', { class: 'row small' }, h('b', null, k === 'tank' ? 'Tank slot' : k === 'generator' ? 'Generator bay' : k === 'roof' ? 'Roof (m²)' : k === 'electronics' ? 'Electronics' : k === 'battery' ? 'Battery bay' : 'Awning mount'), h('span', { class: 'spacer' }), `${u.used.toFixed(k === 'roof' ? 1 : 0)} / ${u.capacity}`),
      inst.map((it) => h('div', { class: 'item', style: 'padding:5px 8px' }, h('div', { class: 'meta' }, h('div', { class: 'name', style: 'font-size:13px' }, itemName(it))),
        btn('Remove', () => { const r = g.sim!.uninstallSlot(it.uid); if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' }); else g.vv!.sync(g.sim!.s, true); }, 'small ghost'))),
      stored.filter((it) => defOf(it).slot!.kind === k).map((it) => h('div', { class: 'item', style: 'padding:5px 8px' }, h('div', { class: 'meta' }, h('div', { class: 'name', style: 'font-size:13px' }, itemName(it)), h('div', { class: 'desc' }, 'in storage')),
        btn('Install', () => { const r = g.sim!.installSlot(it.uid); if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' }); else g.vv!.sync(g.sim!.s, true); }, 'small teal', `finstall-${it.def}`))),
    );
  }), !stored.length ? h('p', { class: 'small muted' }, 'Batteries, solar panels, tanks and the like install here once bought.') : null);
}
