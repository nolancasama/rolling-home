import { BOARDS, REMOTE_GIGS } from '../../data/content';
import { ANCHOR_BY_ID } from '../../data/map';
import { fmtDuration, money } from '../../sim/core';
import { boardOffers, deliverCheck, dockLabel, loadCheck, offerRequirements, previewLoad, remoteQuote } from '../../sim/jobs';
import { vehicleAtAnchor } from '../../sim/places';
import { rankCompartments, canStoreIn } from '../../sim/storage';
import type { DeliveryOffer } from '../../sim/types';
import { activeVehicle, compartments, compartmentUse } from '../../sim/vehicle';
import { newItem } from '../../sim/core';
import type { Game } from '../../game/game';
import { btn, h, type Child } from '../dom';
import { kg, liters, modal } from './common';
import { weightPanel } from './phone';

export function jobBoardScreen(g: Game, boardId: string) {
  const board = BOARDS[boardId];
  const metric = () => g.settings.units === 'metric';
  g.ui.open(modal(g.ui, 'jobboard', {
    title: board.name, sub: () => `Active jobs: ${g.sim!.s.jobs.active.length}/3 · New postings every morning`,
    body: () => {
      const s = g.sim!.s;
      const offers = boardOffers(s, boardId);
      if (!offers.length) return h('p', { class: 'muted' }, 'Nothing posted right now. Check back tomorrow.');
      return h('div', { class: 'list' }, offers.map((o) => {
        const req = offerRequirements(s, o);
        const kgTot = o.kind === 'delivery' ? o.crates.reduce((a, c) => a + c.mass, 0) : 0;
        const lit = o.kind === 'delivery' ? o.crates.reduce((a, c) => a + c.dims[0] * c.dims[1] * c.dims[2] * 1000, 0) : 0;
        return h('div', { class: 'detail', testid: `offer-${o.id}` },
          h('div', { class: 'row' }, h('div', { style: 'font-weight:900;font-size:15.5px;flex:1' }, o.title), h('div', { class: 'price', style: 'font-weight:900;font-size:17px' }, money(o.pay))),
          h('p', { class: 'small' }, o.description),
          o.kind === 'delivery' ? h('div', { class: 'small' },
            h('span', { class: 'pill' }, `${o.crates.length} crate${o.crates.length > 1 ? 's' : ''}`), h('span', { class: 'pill' }, kg(kgTot)), h('span', { class: 'pill' }, liters(lit)),
            h('span', { class: 'pill' }, metric() ? `${o.distanceKm.toFixed(0)} km` : `${(o.distanceKm / 1.609).toFixed(0)} mi`),
            h('span', { class: 'pill' }, `due in ${fmtDuration(o.deadlineMin - s.time.minutes)}`),
            h('span', { class: 'pill' }, `${dockLabel(o.pickup)} → ${dockLabel(o.dropoff)}`)) : h('div', { class: 'small' }, h('span', { class: 'pill teal' }, 'Odd job'), h('span', { class: 'pill' }, 'On foot, nearby')),
          h('div', { class: 'small', style: 'margin-top:4px' }, req.map((r) => h('div', { class: r.met ? 'good' : 'bad' }, r.met ? '✓ ' : '✗ ', r.label))),
          h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'spacer' }), btn('Accept', () => {
            const r = g.sim!.accept(o.id, boardId);
            if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
            else g.ui.toast({ text: o.kind === 'delivery' ? `Accepted. Park at the ${dockLabel(o.pickup)} loading dock and press E at the dock.` : 'Accepted. Look for the glowing markers nearby.', kind: 'good' });
          }, 'teal', `accept-${o.id}`)),
        );
      }));
    },
  }));
}

export function dockScreen(g: Game, anchorId: string) {
  const dockId = ({ dj_dock: 'dj_dock', pl_lodge_dock: 'pl_lodge_dock', mc_dock: 'mc_dock', ts_dock: 'ts_dock' } as Record<string, string>)[anchorId];
  g.ui.open(modal(g.ui, 'dock', {
    title: ANCHOR_BY_ID[anchorId].name, size: 'mid',
    sub: () => (vehicleAtAnchor(activeVehicle(g.sim!.s), anchorId) ? 'Your RV is at the dock.' : 'Your RV is not close enough. Park it next to the dock first.'),
    body: () => {
      const s = g.sim!.s;
      const pick = s.jobs.active.filter((j) => j.offer.kind === 'delivery' && j.offer.pickup === dockId && j.status === 'accepted');
      const drop = s.jobs.active.filter((j) => j.offer.kind === 'delivery' && j.offer.dropoff === dockId && j.status === 'loaded');
      const out: Child[] = [];
      if (pick.length) {
        out.push(h('h3', null, 'Cargo waiting for you'));
        for (const j of pick) {
          const chk = loadCheck(s, j.offer.id);
          out.push(h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, j.offer.title), h('div', { class: 'desc' }, chk.ok ? 'Ready to load' : chk.reason)),
            btn('Load cargo…', () => cargoScreen(g, j.offer.id), 'teal', `load-${j.offer.id}`, !chk.ok)));
        }
      }
      if (drop.length) {
        out.push(h('h3', null, 'Deliveries for this dock'));
        for (const j of drop) {
          const chk = deliverCheck(s, j.offer.id);
          out.push(h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, j.offer.title), h('div', { class: 'desc' }, chk.ok ? `Unload and collect ${money(j.offer.pay)}` : chk.reason)),
            btn('Unload & get paid', () => {
              const r = g.sim!.deliver(j.offer.id);
              if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
              else {
                g.audio.cash();
                g.vv?.sync(g.sim!.s);
                g.save('auto');
              }
            }, 'teal', `deliver-${j.offer.id}`, !chk.ok)));
        }
      }
      if (!out.length) out.push(h('p', { class: 'muted' }, 'Nothing here for you right now. Accept a delivery on the job board first.'));
      return out;
    },
  }));
}

export function cargoScreen(g: Game, jobId: string) {
  const s0 = g.sim!.s;
  const job = s0.jobs.active.find((j) => j.offer.id === jobId)!;
  const offer = job.offer as DeliveryOffer;
  const v = activeVehicle(s0);
  // default: every crate to the top-ranked compartment (shows limits clearly)
  const probe = newItem(s0, 'cargo', { kind: 'carried' }, { cargo: { ...offer.crates[0], jobId, damage: 0 } });
  const first = rankCompartments(s0, v.id, probe)[0]?.id ?? 'floor';
  delete s0.items[probe.uid];
  s0.uidCounter--;
  const assign: string[] = offer.crates.map(() => first);
  const screen = modal(g.ui, 'cargo', {
    title: `Load: ${offer.title}`, sub: () => `${offer.crates.length} crates · ${kg(offer.crates.reduce((a, c) => a + c.mass, 0))} · choose where each crate rides`,
    body: () => {
      const s = g.sim!.s;
      const pv = previewLoad(s, jobId, assign);
      const comps = compartments(s, v.id);
      return h('div', { class: 'cols' },
        h('div', null,
          h('h3', null, 'Crates'),
          h('div', { class: 'list' }, offer.crates.map((c, i) => h('div', { class: 'detail', testid: `crate-${i}` },
            h('div', { class: 'row' }, h('b', null, `${i + 1}. ${c.name}`), h('span', { class: 'spacer' }), h('span', { class: 'small' }, `${kg(c.mass)} · ${c.dims.join(' × ')} m`)),
            c.fragile ? h('span', { class: 'pill warn' }, 'fragile') : null, c.refrigerated ? h('span', { class: 'pill teal' }, 'keep cold') : null,
            h('div', { class: 'row wrap', style: 'margin-top:5px' }, comps.map((cp) => btn(cp.name.replace(/ \(.*\)/, ''), () => { assign[i] = cp.id; g.ui.invalidate(); }, `small ${assign[i] === cp.id ? 'teal' : 'ghost'}`, `crate-${i}-${cp.id}`))),
            pv.crateErrors[i] ? h('div', { class: 'callout bad small', style: 'margin-top:5px', testid: `crate-${i}-error` }, pv.crateErrors[i]) : null,
            !pv.crateErrors[i] && !comps.find((cp) => cp.id === assign[i])?.secure ? h('div', { class: 'small warn' }, 'Loose floor space: strap it down before driving (cargo straps).') : null,
          ))),
          h('div', { class: 'row', style: 'margin-top:8px' },
            btn('Auto-arrange', () => {
              // greedy: try each crate in ranked compartments, accounting for crates already placed
              const st = g.sim!.s;
              const counter = st.uidCounter;
              const placed: string[] = [];
              for (let i = 0; i < offer.crates.length; i++) {
                const inst = newItem(st, 'cargo', { kind: 'carried' }, { cargo: { ...offer.crates[i], jobId, damage: 0 } });
                const ranked = rankCompartments(st, v.id, inst);
                const ok = ranked.find((cp) => canStoreIn(st, v.id, cp, inst).ok);
                assign[i] = ok?.id ?? ranked[0].id;
                if (ok) inst.where = { kind: 'stored', vehicle: v.id, comp: ok.id };
                placed.push(inst.uid);
              }
              for (const u of placed) delete st.items[u];
              st.uidCounter = counter;
              g.ui.invalidate();
            }, 'small secondary', 'cargo-auto'),
            btn('Rearrange my belongings', () => g.screens.openPhone('inventory'), 'small ghost'),
          ),
        ),
        h('div', null,
          h('h3', null, 'With this cargo'),
          weightPreview(g, pv.weight),
          h('h3', null, 'Storage after loading'),
          comps.map((cp) => {
            const u = compartmentUse(s, v.id, cp.id);
            const add = offer.crates.reduce((a, c, i) => (assign[i] === cp.id ? a + c.dims[0] * c.dims[1] * c.dims[2] * 1000 : a), 0);
            const addKg = offer.crates.reduce((a, c, i) => (assign[i] === cp.id ? a + c.mass : a), 0);
            const over = u.liters + add > cp.liters || u.kg + addKg > cp.maxKg;
            return h('div', { class: 'small', style: 'margin-bottom:5px' }, h('div', { class: 'row' }, h('b', null, cp.name), h('span', { class: 'spacer' }), `${liters(u.liters + add)}/${liters(cp.liters)} · ${kg(u.kg + addKg)}/${kg(cp.maxKg)}`),
              h('div', { class: `bar ${over ? 'over' : ''}` }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, ((u.liters + add) / cp.liters) * 100)}%` })));
          }),
          pv.ok ? h('div', { class: 'callout good', testid: 'cargo-ok' }, 'Everything fits within the ratings.') : h('div', { class: 'callout bad', testid: 'cargo-warning' },
            pv.crateErrors.some((e) => e) ? 'Some crates do not fit where you put them. ' : '', pv.messages.join('. '), pv.weight.worstFraction > 0 ? ' Remove weight (water, belongings) or move cargo between the axles.' : ''),
        ),
      );
    },
    foot: () => {
      const pv = previewLoad(g.sim!.s, jobId, assign);
      return [btn('Cancel', () => g.ui.closeId('cargo'), 'ghost'), btn('Load cargo', () => {
        const r = g.sim!.loadCargo(jobId, assign);
        if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
        else {
          g.ui.closeId('cargo');
          g.vv?.sync(g.sim!.s);
        }
      }, 'teal big', 'cargo-load', !pv.ok)];
    },
  });
  g.ui.open(screen);
}

function weightPreview(g: Game, w: ReturnType<typeof previewLoad>['weight']): Child {
  const cls = (n: number, d: number) => (n > d ? 'over' : n > d * 0.97 ? 'near' : '');
  return h('div', { testid: 'cargo-weight' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Gross weight'), h('span', { class: 'stat-value' }, `${kg(w.total)} / ${kg(w.gvwr)}`)),
    h('div', { class: `bar ${cls(w.total, w.gvwr)}` }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, (w.total / w.gvwr) * 100)}%` })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Front axle'), h('span', { class: `stat-value ${w.front > w.frontGawr ? 'neg' : ''}` }, `${kg(w.front)} / ${kg(w.frontGawr)}`)),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Rear axle'), h('span', { class: `stat-value ${w.rear > w.rearGawr ? 'neg' : ''}` }, `${kg(w.rear)} / ${kg(w.rearGawr)}`)),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Payload left'), h('span', { class: `stat-value ${w.payloadLeft < 0 ? 'neg' : ''}` }, kg(w.payloadLeft))),
  );
  void g;
  void weightPanel;
}

export function remoteWorkScreen(g: Game, atTable: boolean) {
  const st = { gig: REMOTE_GIGS[0].id, hours: 2 };
  g.ui.open(modal(g.ui, 'remote', {
    title: 'Remote work', size: 'narrow',
    sub: () => (atTable ? 'At a proper table: full efficiency.' : 'Laptop on your knees: 85% efficiency.'),
    body: () => {
      const s = g.sim!.s;
      return h('div', null,
        h('div', { class: 'list' }, REMOTE_GIGS.map((gig) => {
          const q = remoteQuote(s, gig.id, atTable);
          return h('div', { class: `item ${st.gig === gig.id ? 'selected' : ''} ${q.ok ? '' : 'disabled'}`, onClick: () => { st.gig = gig.id; g.ui.invalidate(); }, testid: `gig-${gig.id}` },
            h('div', { class: 'meta' }, h('div', { class: 'name' }, gig.title), h('div', { class: 'desc' }, q.ok ? `${q.bars} bars of signal · up to ${q.maxHours} h left today` : q.reason)), h('div', { class: 'price' }, `${money(q.perHour)}/h`));
        })),
        h('h3', null, 'Hours'),
        h('div', { class: 'row' }, [1, 2, 3, 4].map((n) => btn(`${n} h`, () => { st.hours = n; g.ui.invalidate(); }, `small ${st.hours === n ? 'teal' : 'ghost'}`, `hours-${n}`))),
        h('p', { class: 'small muted' }, 'The laptop draws about 60 W from the house battery unless you are on shore power. Working drains energy.'),
      );
    },
    foot: () => {
      const q = remoteQuote(g.sim!.s, st.gig, atTable);
      return [btn('Cancel', () => g.ui.closeId('remote'), 'ghost'), btn(q.ok ? `Work ${st.hours} h (~${money(q.perHour * Math.min(st.hours, q.maxHours))})` : 'Unavailable', () => {
        g.ui.closeId('remote');
        g.screens.timed(() => {
          const r = g.sim!.remoteWork(st.gig, st.hours, atTable);
          return r.ok ? { ok: true as const, minutes: 0 } : r;
        }, 'Heads down, headphones on...');
      }, 'teal', 'remote-go', !q.ok)];
    },
  }));
}
