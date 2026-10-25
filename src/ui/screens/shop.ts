import { SHOPS } from '../../data/content';
import { packedLiters } from '../../data/items';
import { VEHICLES, VEHICLE_IDS } from '../../data/vehicles';
import type { ItemDef } from '../../data/types';
import { money } from '../../sim/core';
import { previewPurchase, sellableItems, sellValue, shopLines, vehicleQuote } from '../../sim/shop';
import { activeVehicle, compartments, defOf, itemName } from '../../sim/vehicle';
import { visitMarket } from '../../sim/services';
import type { Game } from '../../game/game';
import { btn, h, tabs, type Child } from '../dom';
import { dims, kg, liters, modal, pct, thumbEl } from './common';

const CAT_LABEL: Record<string, string> = {
  grocery: 'Food', supply: 'Supplies', tool: 'Tools & gear', part: 'Parts', furniture: 'Furniture', appliance: 'Appliances',
  system: 'Systems', mattress: 'Mattresses', outdoor: 'Outdoor', personal: 'Personal',
};

function features(d: ItemDef): string[] {
  const f = d.features ?? {};
  const out: string[] = [];
  if (d.food) out.push(`${d.food.servings} servings`, d.food.kind === 'cook' ? 'needs a stove' : d.food.kind === 'snack' ? 'snack' : 'ready to eat', ...(d.food.perishable ? ['perishable'] : []));
  if (d.storage) out.push(`${d.storage.liters} L ${d.storage.refrigerated ? 'refrigerated' : 'storage'}`);
  if (f.bed) out.push(f.bed.usesMattress ? `takes a ${f.bed.mattressSize} mattress` : `sleeps at ${Math.round(f.bed.quality * 100)}%`);
  if (f.mattress) out.push(`sleep quality ${Math.round(f.mattress.quality * 100)}%`, `${f.mattress.size} size`);
  if (f.battery) out.push(`${f.battery.wh} Wh usable`);
  if (f.solar) out.push(`${f.solar.watts} W solar`);
  if (f.fridge) out.push(`${f.fridge.mode === '3way' ? 'propane/electric' : `${f.fridge.watts} W average`}`);
  if (f.galley) out.push(`sink${f.galley.stove ? ` + ${f.galley.stove} stove` : ''}`);
  if (f.toilet) out.push(`${f.toilet.kind} toilet`);
  if (f.shower) out.push(`shower ${f.shower.liters} L`);
  if (f.tank) out.push(`+${f.tank.liters} L fresh water`);
  if (f.generator) out.push(`${f.generator.watts} W generator`);
  if (f.inverter) out.push(`${f.inverter.watts} W inverter`);
  if (f.booster) out.push(`+${f.booster.bars} signal bars`);
  if (f.comfort) out.push(`comfort +${f.comfort}`);
  if (f.seat) out.push('seat');
  if (f.table) out.push('work surface');
  if (d.floor?.plumbing) out.push('needs plumbing zone');
  if (d.floor?.needsBlackTank) out.push('needs black tank');
  if (d.slot) out.push(`installs in: ${d.slot.kind}${d.slot.kind === 'roof' ? ` (${d.slot.size} m²)` : ''}`);
  if (d.floor) out.push(`footprint ${d.floor.footprint[0]} × ${d.floor.footprint[1]} m`);
  if (f.part) out.push(`DIY ${f.part.component} +${Math.round(f.part.amount * 100)}% (to ${Math.round(f.part.cap * 100)}%)`);
  return out;
}

interface ShopUi {
  tab: string;
  sel: string | null;
  comp: string | null;
  confirmHeavy: boolean;
}

export function shopScreen(g: Game, shopId: string) {
  const shop = SHOPS[shopId];
  if (shop.requires && !g.sim!.s.discovered[shop.requires]) {
    g.ui.toast({ text: 'Closed.', kind: 'info' });
    return;
  }
  if (shopId === 'market') visitMarket(g.sim!.s);
  const st: ShopUi = { tab: 'all', sel: null, comp: null, confirmHeavy: false };
  const screen = modal(g.ui, 'shop', {
    title: shop.name, sub: () => `${shop.blurb}  ·  Cash ${money(g.sim!.s.cash)}`,
    body: () => body(),
    foot: () => [btn('Leave', () => g.ui.closeId('shop'), 'ghost', 'shop-leave')],
  });
  const body = (): Child => {
    const s = g.sim!.s;
    const lines = shopLines(s, shopId);
    const cats = [...new Set(lines.map((l) => l.def.category))];
    const tabDefs = [{ id: 'all', label: 'All' }, ...cats.map((c) => ({ id: c, label: CAT_LABEL[c] ?? c }))];
    if (shop.buys) tabDefs.push({ id: 'sell', label: 'Sell' });
    if (shop.vehicles) tabDefs.push({ id: 'vehicles', label: 'Vehicles' });
    const head = tabs(tabDefs, st.tab, (id) => { st.tab = id; st.sel = null; st.comp = null; g.ui.invalidate(); }, 'shoptab');
    if (st.tab === 'sell') return [head, sellPanel()];
    if (st.tab === 'vehicles') return [head, vehiclesPanel()];
    const shown = lines.filter((l) => st.tab === 'all' || l.def.category === st.tab);
    const list = h('div', { class: 'list' }, shown.map((l) => h('div', {
      class: `item ${st.sel === l.def.id ? 'selected' : ''} ${l.remaining === 0 ? 'disabled' : ''}`, testid: `shop-item-${l.def.id}`,
      onClick: () => { st.sel = l.def.id; st.comp = null; st.confirmHeavy = false; g.ui.invalidate(); },
    }, thumbEl(l.def), h('div', { class: 'meta' }, h('div', { class: 'name' }, l.def.name),
      h('div', { class: 'desc' }, `${kg(l.def.mass)} · ${liters(packedLiters(l.def))}${l.condition < 1 ? ` · used, ${pct(l.condition)} condition` : ''}${l.remaining != null ? ` · ${l.remaining} left` : ''}`)),
    h('div', { class: 'price' }, money(l.price)))));
    return [head, h('div', { class: 'cols' }, list, detailPanel())];
  };
  const detailPanel = (): Child => {
    const s = g.sim!.s;
    if (!st.sel) return h('div', { class: 'detail' }, h('p', { class: 'muted' }, 'Select an item to see details, where it would be stored and what it does to your weight.'));
    const line = shopLines(s, shopId).find((l) => l.def.id === st.sel)!;
    const d = line.def;
    const pv = previewPurchase(s, shopId, d.id, st.comp ?? undefined);
    const v = activeVehicle(s);
    const heavy = pv.ok && (pv.status === 'over' || pv.status === 'refuse');
    return h('div', { class: 'detail', testid: 'shop-detail' },
      thumbEl(d, true),
      h('div', { style: 'font-weight:900;font-size:17px' }, d.name),
      h('p', { class: 'small' }, d.description),
      h('div', null, features(d).map((f) => h('span', { class: 'pill teal' }, f))),
      h('div', { style: 'margin-top:8px' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Price'), h('span', { class: 'stat-value' }, money(line.price))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Weight / packed size'), h('span', { class: 'stat-value' }, `${kg(d.mass)} · ${dims(d.dims)}`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Condition'), h('span', { class: 'stat-value' }, line.condition < 1 ? `Used: ${pct(line.condition)}` : 'New')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Cash after'), h('span', { class: `stat-value ${pv.cashAfter < 0 ? 'neg' : ''}`, testid: 'cash-after' }, money(pv.cashAfter))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Vehicle weight'), h('span', { class: 'stat-value', testid: 'weight-after' }, `${kg(pv.weightBefore)} → ${kg(pv.weightAfter)}`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Payload left after'), h('span', { class: `stat-value ${pv.payloadAfter < 0 ? 'neg' : ''}` }, kg(pv.payloadAfter))),
        pv.ok ? h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, pv.installBed ? 'Goes on' : 'Stored in'), h('span', { class: 'stat-value' }, pv.installBed ? 'your bed (installed directly: too bulky to store)' : pv.compName ?? '')) : null,
      ),
      pv.oldMattress ? h('p', { class: 'small' }, pv.oldMattress.storedIn ? `Your old ${pv.oldMattress.name.toLowerCase()} goes into storage.` : `No room for your old mattress: the shop takes it as a trade-in (+${money(pv.oldMattress.tradeIn)}).`) : null,
      pv.ok && !pv.installBed ? h('div', { class: 'row wrap small', style: 'margin:6px 0' }, 'Store in:', compartments(s, v.id).map((cp) => btn(cp.name.replace(/ \(.*\)/, ''), () => { st.comp = cp.id; g.ui.invalidate(); }, `small ${pv.comp === cp.id ? 'teal' : 'ghost'}`))) : null,
      pv.warnings.map((w) => h('div', { class: 'callout bad', style: 'margin-top:6px' }, w)),
      !pv.ok ? h('div', { class: 'callout bad', style: 'margin-top:6px', testid: 'buy-reason' }, pv.reason ?? 'Cannot buy.') : null,
      h('div', { class: 'row', style: 'margin-top:10px' },
        heavy ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.confirmHeavy, onChange: (e) => { st.confirmHeavy = (e.target as HTMLInputElement).checked; g.ui.invalidate(); } }), 'Buy anyway (I will remove weight)') : null,
        h('span', { class: 'spacer' }),
        btn(`Buy for ${money(line.price)}`, () => {
          const r = g.sim!.buy(shopId, d.id, { comp: st.comp ?? undefined, confirmOverweight: st.confirmHeavy });
          if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
          else {
            g.audio.cash();
            g.ui.toast({ text: `Bought ${d.name}.`, kind: 'money' });
            g.vv?.sync(g.sim!.s);
          }
        }, 'teal', 'buy-btn', !pv.ok || (heavy && !st.confirmHeavy)),
      ),
      d.floor || d.slot ? h('p', { class: 'small muted' }, 'Place it from inside your RV in Design Mode (press F).') : null,
    );
  };
  const sellPanel = (): Child => {
    const s = g.sim!.s;
    const items = sellableItems(s);
    return h('div', { class: 'list' }, items.length ? items.map((it) => {
      const val = sellValue(s, shopId, it);
      return h('div', { class: 'item' }, thumbEl(defOf(it)), h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(it)), h('div', { class: 'desc' }, `${kg(defOf(it).mass)} · ${pct(it.condition)} condition`)),
        h('div', { class: 'price' }, money(val)), btn('Sell', () => {
          const r = g.sim!.sell(shopId, it.uid);
          if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
          else g.audio.cash();
        }, 'small', `sell-${it.def}`, val <= 0));
    }) : h('p', { class: 'muted' }, 'Nothing to sell. (Take furniture out in Design Mode first, or sell it from the review there.)'));
  };
  const vehiclesPanel = (): Child => {
    const s = g.sim!.s;
    const cur = activeVehicle(s);
    return h('div', { class: 'grid2' }, VEHICLE_IDS.map((id) => {
      const d = VEHICLES[id];
      const q = vehicleQuote(s, id);
      const mine = cur.def === id;
      return h('div', { class: 'detail' },
        h('div', { style: 'font-weight:900;font-size:16px' }, d.name), h('p', { class: 'small' }, d.description),
        h('div', { class: 'small good' }, '+ ', d.pros.join(' · ')), h('div', { class: 'small bad' }, '− ', d.cons.join(' · ')),
        h('div', { style: 'margin-top:8px' },
          h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Price'), h('span', { class: 'stat-value' }, money(q.price))),
          h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, `Trade-in for your ${VEHICLES[cur.def].shortName.toLowerCase()}`), h('span', { class: 'stat-value' }, money(q.tradeIn))),
          h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'You pay'), h('span', { class: 'stat-value' }, money(q.net)))),
        h('p', { class: 'small muted' }, 'Belongings move to the new RV; installed equipment stays with the trade-in. Anything that does not fit goes to your storage locker.'),
        mine ? h('div', { class: 'pill good' }, 'This is your current model') : btn(`Trade in and buy`, () => g.screens.confirm('Buy this vehicle?', `Pay ${money(q.net)} and trade in your current RV?`, () => {
          const r = g.sim!.buyVehicle(id);
          if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
          else {
            g.ui.closeAll();
            g.rebuildVehicle();
            g.explore.teleport(s.player.pos.x, s.player.pos.z, s.player.pos.yaw);
          }
        }), 'teal', `buy-vehicle-${id}`, s.cash < q.net));
    }));
  };
  g.ui.open(screen);
}
