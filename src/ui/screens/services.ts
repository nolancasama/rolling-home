import { MECHANICS } from '../../data/content';
import { ANCHOR_BY_ID, CAMPGROUND_BY_ID } from '../../data/map';
import { PROCEDURES } from '../../data/procedures';
import { canConnect, inReservedSite, siteOptions, type HookupKind } from '../../sim/camping';
import { fmtDuration, money } from '../../sim/core';
import { repairQuote, type RepairTarget } from '../../sim/maintenance';
import { vehicleAtAnchor } from '../../sim/places';
import { dumpCheck, dumpQuote, fuelQuote, procedureLearned, propaneQuote, showerQuote, waterQuote } from '../../sim/services';
import { lockerItems, lockerUse, LOCKER_LITERS } from '../../sim/storage';
import { activeVehicle, capacities, itemName, itemsInVehicle, defOf, vdef } from '../../sim/vehicle';
import { shuffle, rngFor } from '../../sim/rng';
import type { Game } from '../../game/game';
import { btn, h, type Child } from '../dom';
import { kg, liters, modal, pct } from './common';

function needVehicle(g: Game, anchorId: string): Child {
  const ok = vehicleAtAnchor(activeVehicle(g.sim!.s), anchorId);
  return ok ? null : h('div', { class: 'callout bad', style: 'margin-bottom:8px' }, 'Your RV is not parked close enough. Drive it up to this spot first.');
}

export function fuelScreen(g: Game, anchorId: string) {
  g.ui.open(modal(g.ui, 'fuel', {
    title: 'Fuel pump', size: 'narrow',
    body: () => {
      const q = fuelQuote(g.sim!.s, anchorId);
      return h('div', null, needVehicle(g, anchorId),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Price'), h('span', { class: 'stat-value' }, `${money(q.perLiter)} / L (${money(q.perLiter * 3.785)} / gal)`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'In the tank'), h('span', { class: 'stat-value' }, `${q.current.toFixed(0)} / ${q.capacity} L`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Fill up'), h('span', { class: 'stat-value' }, `${q.maxLiters.toFixed(1)} L = ${money(q.fullCost)}`)),
        h('p', { class: 'small muted' }, 'Gasoline weighs about 0.75 kg per liter.'),
      );
    },
    foot: () => {
      const q = fuelQuote(g.sim!.s, anchorId);
      const go = (l: number) => {
        const r = g.sim!.refuel(anchorId, l);
        if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
        else {
          g.audio.pump();
          g.ui.toast({ text: `Fueled ${l.toFixed(0)} L for ${money(r.cost)}.`, kind: 'money' });
        }
      };
      return [btn('20 L', () => go(Math.min(20, q.maxLiters)), 'secondary', 'fuel-20', q.maxLiters < 1), btn(`Fill up (${money(q.fullCost)})`, () => go(q.maxLiters), 'teal', 'fuel-fill', q.maxLiters < 1)];
    },
  }));
}

export function waterScreen(g: Game, anchorId: string) {
  const q0 = waterQuote(g.sim!.s, anchorId);
  const st = { target: q0.capacity };
  g.ui.open(modal(g.ui, 'water', {
    title: ANCHOR_BY_ID[anchorId].name, size: 'narrow',
    body: () => {
      const q = waterQuote(g.sim!.s, anchorId);
      return h('div', null, needVehicle(g, anchorId),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Fresh tank'), h('span', { class: 'stat-value' }, `${q.current.toFixed(0)} / ${q.capacity} L`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Fee'), h('span', { class: 'stat-value' }, q.fee ? money(q.fee) : 'Free')),
        h('h3', null, `Fill to ${Math.round(st.target)} L`),
        h('input', { type: 'range', min: 0, max: q.capacity, step: 5, value: st.target, testid: 'water-target', onInput: (e) => { st.target = Number((e.target as HTMLInputElement).value); g.ui.invalidate(); } }),
        h('p', { class: 'small' }, `That is ${st.target - q.current >= 0 ? '+' : ''}${Math.round(st.target - q.current)} kg on your RV. Water weighs 1 kg per liter: carry only what you need.`),
        !q.hose ? h('div', { class: 'callout bad' }, 'You need a drinking-water hose.') : null,
      );
    },
    foot: () => [btn('Cancel', () => g.ui.closeId('water'), 'ghost'), btn('Fill', () => {
      const q = waterQuote(g.sim!.s, anchorId);
      if (!q.hose) return;
      g.ui.closeId('water');
      procedureScreen(g, 'fill_water', () => {
        const r = g.sim!.fillWater(anchorId, st.target);
        if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
        else g.audio.water();
      });
    }, 'teal', 'water-fill')],
  }));
}

export function dumpScreen(g: Game, anchorId: string) {
  g.ui.open(modal(g.ui, 'dump', {
    title: 'Dump station', size: 'narrow',
    body: () => {
      const q = dumpQuote(g.sim!.s, anchorId);
      const chk = dumpCheck(g.sim!.s, anchorId);
      return h('div', null, needVehicle(g, anchorId),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Gray water'), h('span', { class: 'stat-value' }, `${q.gray.toFixed(0)} / ${q.grayCap} L (${kg(q.gray)})`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, q.cassetteOnly ? 'Toilet cassette' : 'Black water'), h('span', { class: 'stat-value' }, `${q.black.toFixed(0)} / ${q.blackCap} L (${kg(q.black)})`)),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Fee'), h('span', { class: 'stat-value' }, q.fee ? money(q.fee) : 'Free')),
        !chk.ok ? h('div', { class: 'callout bad' }, chk.reason) : null,
      );
    },
    foot: () => [btn('Cancel', () => g.ui.closeId('dump'), 'ghost'), btn('Empty the tanks', () => {
      const chk = dumpCheck(g.sim!.s, anchorId);
      if (!chk.ok) return;
      g.ui.closeId('dump');
      procedureScreen(g, 'dump_tanks', () => {
        const r = g.sim!.dump(anchorId);
        if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
        else {
          g.audio.water();
          g.ui.toast({ text: `Emptied ${Math.round(r.gray)} L gray and ${Math.round(r.black)} L black water.`, kind: 'good' });
        }
      });
    }, 'teal', 'dump-go', !dumpCheck(g.sim!.s, anchorId).ok)],
  }));
}

export function propaneScreen(g: Game, anchorId: string) {
  g.ui.open(modal(g.ui, 'propane', {
    title: 'Propane refill', size: 'narrow',
    body: () => {
      const q = propaneQuote(g.sim!.s, anchorId);
      return h('div', null, needVehicle(g, anchorId),
        q.capacity > 0 ? [
          h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Tank'), h('span', { class: 'stat-value' }, `${q.current.toFixed(1)} / ${q.capacity} kg`)),
          h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Refill'), h('span', { class: 'stat-value' }, `${q.kg.toFixed(1)} kg = ${money(Math.max(5, q.cost))}`)),
        ] : h('p', null, 'Your RV has no propane system. Its stove runs on butane canisters from the shops.'));
    },
    foot: () => [btn('Refill', () => g.screens.timed(() => g.sim!.refillPropane(anchorId), 'The attendant fills your tank.'), 'teal', 'propane-go', propaneQuote(g.sim!.s, anchorId).capacity <= 0)],
  }));
}

export function serviceScreen(g: Game, mechanicId: string) {
  const m = MECHANICS[mechanicId];
  const sel = new Set<RepairTarget>();
  const comps: RepairTarget[] = ['engine', 'steering', 'brakes', 'appliances', 'body'];
  const names: Record<RepairTarget, string> = { engine: 'Engine tune-up', steering: 'Steering & suspension', brakes: 'Brakes', appliances: 'Appliance service', body: 'Body & paint' };
  g.ui.open(modal(g.ui, 'service', {
    title: m.name, sub: () => m.blurb,
    body: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const atShop = Object.values(ANCHOR_BY_ID).some((a) => a.kind === 'mechanic' && a.ref === mechanicId && vehicleAtAnchor(v, a.id));
      return h('div', { class: 'cols' },
        h('div', null,
          !atShop ? h('div', { class: 'callout bad', style: 'margin-bottom:8px' }, 'Bring your RV to the shop to get it repaired.') : null,
          h('h3', null, 'Repair estimates'),
          h('div', { class: 'list' }, comps.map((c) => {
            const q = repairQuote(s, v.id, mechanicId, c);
            if (m.repairs[c] == null) return h('div', { class: 'item disabled' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, names[c]), h('div', { class: 'desc' }, 'Not offered here.')));
            return h('div', { class: `item ${sel.has(c) ? 'selected' : ''} ${q.available ? '' : 'disabled'}`, testid: `repair-${c}`, onClick: () => { if (!q.available) return; if (sel.has(c)) sel.delete(c); else sel.add(c); g.ui.invalidate(); } },
              h('div', { class: 'meta' }, h('div', { class: 'name' }, names[c]), h('div', { class: 'desc' }, q.available ? `${pct(q.from)} → ${pct(q.to)} · about ${fmtDuration(q.minutes)}` : `Already at ${pct(q.from)}`)),
              h('div', { class: 'price' }, q.available ? money(q.cost) : '—'));
          })),
        ),
        h('div', null,
          h('h3', null, 'Your RV'),
          h('div', { class: 'detail' },
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Engine'), h('span', { class: 'stat-value' }, pct(v.condition.engine))),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Steering & suspension'), h('span', { class: 'stat-value' }, pct(v.condition.steering))),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Brakes'), h('span', { class: 'stat-value' }, pct(v.condition.brakes))),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Body (looks)'), h('span', { class: 'stat-value' }, pct(v.body)))),
          h('p', { class: 'small muted' }, 'You wait while they work: time passes and your needs keep ticking.'),
          h('h3', null, 'Parts for DIY'),
          h('p', { class: 'small muted' }, 'Parts kits are sold at RV supply and outfitter shops. With a tool kit you can install them yourself next to your RV.'),
        ),
      );
    },
    foot: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const total = [...sel].reduce((a, c) => a + repairQuote(s, v.id, mechanicId, c).cost, 0);
      const atShop = Object.values(ANCHOR_BY_ID).some((a) => a.kind === 'mechanic' && a.ref === mechanicId && vehicleAtAnchor(v, a.id));
      return [btn('Close', () => g.ui.closeId('service'), 'ghost'), btn(sel.size ? `Repair for ${money(total)}` : 'Select repairs', () => {
        const list = [...sel];
        g.ui.closeId('service');
        g.screens.timed(() => g.sim!.repair(mechanicId, list), 'The mechanic gets to work...');
        g.phys && (g.phys.perf = null);
      }, 'teal', 'repair-go', !sel.size || !atShop || s.cash < total)];
    },
  }));
}

export function hookupsScreen(g: Game) {
  g.ui.open(modal(g.ui, 'hookups', {
    title: 'Hookup pedestal', size: 'narrow',
    body: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const here = inReservedSite(s);
      const row = (kind: HookupKind, label: string, proc: string) => {
        const chk = canConnect(s, kind);
        const on = v.hookups[kind];
        return h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, label), h('div', { class: 'desc' }, on ? 'Connected' : chk.ok ? 'Available' : chk.reason)),
          on ? btn('Disconnect', () => g.sim!.disconnect(kind), 'small ghost', `disconnect-${kind}`) : btn('Connect', () => {
            g.ui.closeId('hookups');
            procedureScreen(g, proc, () => {
              const r = g.sim!.connect(kind);
              if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
              else g.ui.toast({ text: `${label} connected.`, kind: 'good' });
            });
          }, 'small teal', `connect-${kind}`, !chk.ok));
      };
      return h('div', null,
        here ? h('p', { class: 'small' }, `${here.camp.name}, site ${here.site.id}: ${here.site.power ? `${here.site.power} A power` : 'no power'}${here.site.water ? ', water' : ''}${here.site.sewer ? ', sewer' : ''}.`) : h('div', { class: 'callout bad' }, 'Park on your reserved site to use its hookups.'),
        h('div', { class: 'list' }, row('power', 'Shore power', 'connect_power'), row('water', 'City water', 'connect_water'), row('sewer', 'Sewer', 'connect_sewer')),
        h('p', { class: 'small muted' }, 'Shore power runs everything and charges your battery. City water feeds your faucets without using the tank. A sewer hookup drains gray water as you go.'),
      );
    },
  }));
}

export function campgroundScreen(g: Game, campId: string) {
  const camp = CAMPGROUND_BY_ID[campId];
  const st = { site: null as string | null, nights: 1 };
  g.ui.open(modal(g.ui, 'campground', {
    title: camp.name, sub: () => camp.description,
    body: () => {
      const s = g.sim!.s;
      const opts = siteOptions(s, campId);
      const v = activeVehicle(s);
      const res = s.reservation?.camp === campId ? s.reservation : null;
      return h('div', { class: 'cols' },
        h('div', null,
          h('div', null, camp.amenities.map((a) => h('span', { class: 'pill teal' }, a))),
          res ? h('div', { class: 'callout good', style: 'margin:8px 0' }, `You have site ${res.site} until check-out at 11 AM on day ${Math.floor(res.checkoutMin / 1440) + 1}.`) : null,
          h('h3', null, 'Sites'),
          h('div', { class: 'list' }, opts.map((o) => h('div', {
            class: `item ${st.site === o.site.id ? 'selected' : ''} ${o.available ? '' : 'disabled'}`, testid: `site-${o.site.id}`,
            onClick: () => { if (o.available) { st.site = o.site.id; g.ui.invalidate(); } },
          }, h('div', { class: 'thumb' }, o.site.id), h('div', { class: 'meta' }, h('div', { class: 'name' }, o.site.name),
            h('div', { class: 'desc' }, `${o.site.power ? `${o.site.power} A` : 'no power'}${o.site.water ? ' · water' : ''}${o.site.sewer ? ' · sewer' : ''} · max ${o.site.maxLength} m · scenery ${'★'.repeat(Math.max(1, o.site.scenery))}`),
            o.reason ? h('div', { class: 'desc bad' }, o.reason) : null), h('div', { class: 'price' }, `${money(o.price)}/night`)))),
        ),
        h('div', null,
          h('h3', null, 'Your stay'),
          h('div', { class: 'detail' },
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Your vehicle'), h('span', { class: 'stat-value' }, `${vdef(v).shortName}, ${vdef(v).dims.length} m`)),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Showers'), h('span', { class: 'stat-value' }, camp.showers === 'free' ? 'Free for guests' : camp.showers === 'paid' ? `${money(camp.showerPrice)}` : 'None')),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Dump station'), h('span', { class: 'stat-value' }, camp.dump ? 'Free for guests' : 'None')),
            h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Check-out'), h('span', { class: 'stat-value' }, '11 AM (staying later costs another night)')),
            h('h3', null, 'Nights'),
            h('div', { class: 'row' }, [1, 2, 3, 5, 7].map((n) => btn(`${n}`, () => { st.nights = n; g.ui.invalidate(); }, `small ${st.nights === n ? 'teal' : 'ghost'}`, `nights-${n}`))),
            st.site ? h('p', null, `Site ${st.site}: ${money((opts.find((o) => o.site.id === st.site)?.price ?? 0) * st.nights)} for ${st.nights} night(s).`) : h('p', { class: 'small muted' }, 'Pick an available site.'),
          ),
        ),
      );
    },
    foot: () => [btn('Close', () => g.ui.closeId('campground'), 'ghost'), btn('Reserve & pay', () => {
      if (!st.site) return;
      const r = g.sim!.reserve(campId, st.site, st.nights);
      if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
      else {
        g.audio.cash();
        g.ui.closeId('campground');
        const site = camp.sites.find((x) => x.id === st.site)!;
        g.markSite(site.x, site.z);
      }
    }, 'teal', 'reserve-go', !st.site)],
  }));
}

export function lockerScreen(g: Game) {
  g.ui.open(modal(g.ui, 'locker', {
    title: 'U-Store Lockers', size: 'mid',
    sub: () => 'Leave belongings in Mesa City instead of hauling them around.',
    body: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const atLocker = vehicleAtAnchor(v, 'mc_locker_door');
      if (!s.locker || s.locker.paidUntilMin < s.time.minutes) {
        return h('div', null, h('p', null, `A 3,000 L locker costs ${money(15)} per week, charged automatically every 7 days.`), btn('Rent a locker', () => g.sim!.rentLocker(), 'teal', 'locker-rent'));
      }
      const stored = itemsInVehicle(s, v.id).filter((i) => i.where.kind === 'stored' && !i.cargo);
      return h('div', { class: 'grid2' },
        h('div', null, h('h3', null, 'In your RV'), !atLocker ? h('div', { class: 'callout bad' }, 'Park your RV by the lockers to move things.') : null,
          h('div', { class: 'list' }, stored.map((it) => h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(it)), h('div', { class: 'desc' }, `${kg(defOf(it).mass)}`)),
            btn('→ Locker', () => { const r = g.sim!.toLocker(it.uid); if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' }); }, 'small', `to-locker-${it.def}`, !atLocker))))),
        h('div', null, h('h3', null, `Locker (${liters(lockerUse(s))}/${liters(LOCKER_LITERS)})`),
          h('div', { class: 'list' }, lockerItems(s).map((it) => h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(it))),
            btn('→ RV', () => { const r = g.sim!.fromLocker(it.uid); if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' }); }, 'small', undefined, !atLocker))))),
      );
    },
  }));
}

export function paidShowerScreen(g: Game, anchorId: string) {
  const q = showerQuote(g.sim!.s, anchorId);
  g.screens.confirm('Shower', q.price ? `A hot shower costs ${money(q.price)}.` : 'Free for guests. Enjoy!', () => {
    g.screens.timed(() => g.sim!.paidShower(anchorId), 'Steam, soap and endless hot water.');
  }, q.price ? `Pay ${money(q.price)}` : 'Shower');
}

/** Interactive service procedure; onDone performs the actual service. */
export function procedureScreen(g: Game, procId: string, onDone: () => void) {
  const p = PROCEDURES[procId];
  const learned = procedureLearned(g.sim!.s, procId);
  const order = shuffle(rngFor(g.sim!.s.seed, procId, g.sim!.s.procedures[procId] ?? 0), [...p.steps]);
  const done = new Set<string>();
  let message = p.intro;
  const finish = (quick: boolean) => {
    g.ui.closeId('procedure');
    g.sim!.completeProcedure(procId, quick);
    onDone();
  };
  g.ui.open(modal(g.ui, 'procedure', {
    title: p.title, size: 'mid',
    sub: () => (learned ? 'You know the drill.' : 'First time? The next step glows.'),
    body: () => {
      const next = p.steps.find((st) => !done.has(st.id));
      return h('div', null,
        h('div', { class: 'callout', style: 'margin-bottom:10px', testid: 'proc-message' }, message),
        h('div', { class: 'steps' }, order.map((st) => h('button', {
          class: `step ${done.has(st.id) ? 'done' : ''} ${!learned && next?.id === st.id ? 'hint' : ''}`, testid: `step-${st.id}`,
          onClick: () => {
            if (done.has(st.id)) return;
            if (next && st.id === next.id) {
              done.add(st.id);
              message = st.hint;
              g.audio.click();
              if (done.size === p.steps.length) finish(false);
              else g.ui.invalidate();
              return;
            }
            const mistake = p.mistakes.find((mm) => mm.step === st.id && mm.before.some((b) => !done.has(b)));
            if (mistake) {
              g.sim!.procedureMistake(mistake);
              message = mistake.text;
              g.audio.error();
            } else message = `Not yet: ${next?.hint ?? ''}`;
            g.ui.invalidate();
          },
        }, done.has(st.id) ? '✓ ' : '', st.label))),
      );
    },
    foot: () => [btn('Cancel', () => g.ui.closeId('procedure'), 'ghost'), learned ? btn(`Do it quickly (${p.quickMinutes} min)`, () => finish(true), 'teal', 'proc-quick') : null],
  }));
}

void capacities;
