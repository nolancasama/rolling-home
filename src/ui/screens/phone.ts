import { REMOTE_GIGS, WEEKDAYS } from '../../data/content';
import { CAMPGROUND_BY_ID, NODE_BY_ID, PLACES, type PlaceDef } from '../../data/map';
import { dayOf, fmtClock, fmtDuration, hourOf, money, weekdayOf } from '../../sim/core';
import { dockLabel, jobCargo, oddPoints, remoteQuote } from '../../sim/jobs';
import { OBJECTIVES } from '../../sim/objectives';
import { signalAt } from '../../sim/places';
import { compartmentUse, compartments, activeVehicle, capacities, defOf, itemKg, itemLiters, itemName, itemsInCompartment, appliancesCondition, overallCondition, vdef } from '../../sim/vehicle';
import { computeWeight, WEIGHT_CAT_LABEL, type WeightCat } from '../../sim/weight';
import { powerStatus, fridgeState } from '../../sim/utilities';
import { goalChecks, weekNet } from '../../sim/time';
import { planAssisted, planRoute, fuelForRoute } from '../../sim/travel';
import { lockerItems, lockerUse, LOCKER_LITERS } from '../../sim/storage';
import { EDGES } from '../../world/roads';
import type { Game } from '../../game/game';
import { bar, btn, clear, h, stat, tabs, type Child } from '../dom';
import type { Screen } from '../ui';
import { kg, liters, pct } from './common';
import { DISCOVERIES } from '../../data/map';

type AppId = 'home' | 'map' | 'jobs' | 'finance' | 'rv' | 'inventory' | 'journal';

const APPS: { id: AppId; name: string; ico: string; color: string }[] = [
  { id: 'map', name: 'Map', ico: '🗺', color: '#5aa07a' },
  { id: 'jobs', name: 'Jobs', ico: '📦', color: '#d8873a' },
  { id: 'finance', name: 'Finances', ico: '💳', color: '#3a7aaa' },
  { id: 'rv', name: 'RV Status', ico: '🚐', color: '#cf6a3e' },
  { id: 'inventory', name: 'Inventory', ico: '🧺', color: '#8a6aaa' },
  { id: 'journal', name: 'Journal', ico: '📓', color: '#6a8a4a' },
];

interface PhoneState {
  app: AppId;
  rvTab: 'weight' | 'utilities' | 'condition';
  selPlace: string | null;
  selItem: string | null;
  mapZoom: number;
}

const ps: PhoneState = { app: 'home', rvTab: 'weight', selPlace: null, selItem: null, mapZoom: 1 };

export function phoneScreen(g: Game, app?: AppId): Screen {
  if (app) ps.app = app;
  const driving = g.mode === 'drive';
  if (driving) ps.app = 'map';
  const el = h('div', { class: 'phone-screen', testid: 'phone' });
  const screen: Screen = {
    id: 'phone', el, pauses: !driving, blocks: !driving,
    render: () => {
      clear(el);
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const bars = signalAt(v.pose.x, v.pose.z, capacities(s, v.id).boosterBars);
      const appDef = APPS.find((a) => a.id === ps.app);
      const body = h('div', { class: 'phone-body scroll' }, renderApp(g, ps.app, driving));
      el.append(h('div', { class: 'phone' }, h('div', { class: 'phone-inner' },
        h('div', { class: 'phone-status' }, h('span', null, fmtClock(s.time.minutes)), h('span', null, `${'▮'.repeat(bars)}${'▯'.repeat(4 - bars)}  ${Math.round((v.batteryWh / Math.max(1, capacities(s, v.id).batteryWh)) * 100)}%`)),
        h('div', { class: 'phone-head' },
          ps.app !== 'home' && !driving ? btn('‹', () => { ps.app = 'home'; g.ui.invalidate(); }, 'small ghost', 'phone-back') : null,
          h('h2', null, driving ? 'Navigation' : appDef?.name ?? 'Phone'),
          h('button', { class: 'close-x', onClick: () => g.ui.closeId('phone'), testid: 'phone-close' }, '✕')),
        body,
        h('div', { class: 'phone-nav' }, h('button', { onClick: () => { if (!driving) { ps.app = 'home'; g.ui.invalidate(); } } })),
      )));
    },
  };
  return screen;
}

function renderApp(g: Game, app: AppId, driving: boolean): Child {
  switch (app) {
    case 'home':
      return homeApp(g);
    case 'map':
      return mapApp(g, driving);
    case 'jobs':
      return jobsApp(g);
    case 'finance':
      return financeApp(g);
    case 'rv':
      return rvApp(g);
    case 'inventory':
      return inventoryApp(g);
    case 'journal':
      return journalApp(g);
  }
}

function homeApp(g: Game): Child {
  const s = g.sim!.s;
  return h('div', { class: 'phone-home' },
    h('div', { class: 'detail', style: 'text-align:center' },
      h('div', { style: 'font-size:30px;font-weight:900' }, fmtClock(s.time.minutes)),
      h('div', { class: 'muted' }, `Day ${dayOf(s.time.minutes)} · ${WEEKDAYS[weekdayOf(s.time.minutes)]}`),
      h('div', { style: 'font-size:20px;font-weight:900;margin-top:6px' }, money(s.cash))),
    h('div', { class: 'apps' }, APPS.map((a) => h('button', { class: 'app', testid: `app-${a.id}`, onClick: () => { ps.app = a.id; g.ui.invalidate(); } },
      h('div', { class: 'app-ico', style: `background:${a.color}` }, a.ico), a.name))),
    h('div', { class: 'row', style: 'justify-content:center;gap:8px' },
      btn('Save', () => g.screens.saveMenu(), 'small secondary'), btn('Settings', () => g.screens.settings(), 'small ghost')),
  );
}

// ───────────── Map ─────────────

function placeVisible(g: Game, p: PlaceDef): boolean {
  const s = g.sim!.s;
  return !p.hidden || !!s.revealed[p.id] || s.discovered[p.discovery ?? ''] != null;
}

function mapApp(g: Game, driving: boolean): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 620;
  canvas.setAttribute('data-testid', 'map-canvas');
  const view = { x0: -1550, x1: 1550, z0: -1520, z1: 1250 };
  const sx = canvas.width / (view.x1 - view.x0), sz = canvas.height / (view.z1 - view.z0);
  const sc = Math.min(sx, sz);
  const ox = (canvas.width - (view.x1 - view.x0) * sc) / 2, oz = (canvas.height - (view.z1 - view.z0) * sc) / 2;
  const toC = (x: number, z: number): [number, number] => [ox + (x - view.x0) * sc, oz + (z - view.z0) * sc];
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#e6d3a4';
  c.fillRect(0, 0, canvas.width, canvas.height);
  // plateau / forest tint
  const grad = c.createRadialGradient(...toC(-250, -1150), 30, ...toC(-250, -1150), 1000 * sc);
  grad.addColorStop(0, 'rgba(90,140,80,0.55)');
  grad.addColorStop(0.55, 'rgba(110,150,90,0.35)');
  grad.addColorStop(1, 'rgba(110,150,90,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#6aa8c8';
  c.beginPath();
  c.ellipse(...toC(-150, -1260), 240 * sc, 140 * sc, 0, 0, Math.PI * 2);
  c.fill();
  for (const e of EDGES) {
    if (e.def.hiddenUntil && !s.revealed[e.def.hiddenUntil]) continue;
    c.strokeStyle = e.def.kind === 'highway' ? '#c8553d' : e.def.kind === 'mountain' ? '#d8873a' : e.def.kind === 'street' ? '#8a7a68' : '#a8875e';
    c.lineWidth = e.def.kind === 'highway' ? 3.2 : e.def.kind === 'mountain' ? 2.6 : 1.6;
    if (e.def.kind === 'track' || e.def.kind === 'dirt') c.setLineDash([4, 3]);
    c.beginPath();
    for (let i = 0; i < e.xs.length; i += 2) {
      const [x, y] = toC(e.xs[i], e.zs[i]);
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
    c.setLineDash([]);
  }
  if (g.route) {
    c.strokeStyle = '#1f8fd0';
    c.lineWidth = 5;
    c.globalAlpha = 0.8;
    c.beginPath();
    g.route.points.forEach(([x, z], i) => {
      const [px, py] = toC(x, z);
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    });
    c.stroke();
    c.globalAlpha = 1;
  }
  const icon = (k: string) => (k === 'town' ? '●' : k === 'campground' ? '⛺' : k === 'truckstop' ? '⛽' : k === 'dispersed' ? '△' : k === 'overlook' ? '◆' : k === 'hidden' ? '★' : '◉');
  for (const p of PLACES) {
    if (!placeVisible(g, p)) continue;
    const [x, y] = toC(p.x, p.z);
    c.font = `${p.kind === 'town' ? 'bold 15px' : '12px'} Trebuchet MS, sans-serif`;
    c.fillStyle = ps.selPlace === p.id ? '#1f6f6a' : '#3b2f26';
    c.textAlign = 'center';
    c.fillText(icon(p.kind), x, y + 4);
    c.fillText(p.name, x, y - 9);
  }
  // player
  const [px, py] = toC(g.mode === 'explore' ? g.explore.x : g.phys!.x, g.mode === 'explore' ? g.explore.z : g.phys!.z);
  c.fillStyle = '#cf6a3e';
  c.strokeStyle = '#fff';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(px, py, 7, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  const [vx, vy] = toC(v.pose.x, v.pose.z);
  if (g.mode === 'explore') {
    c.fillStyle = '#2f7f7a';
    c.fillRect(vx - 5, vy - 5, 10, 10);
  }
  canvas.addEventListener('click', (ev) => {
    const r = canvas.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) / r.width) * canvas.width, my = ((ev.clientY - r.top) / r.height) * canvas.height;
    let best: PlaceDef | null = null, bd = 26;
    for (const p of PLACES) {
      if (!placeVisible(g, p)) continue;
      const [x, y] = toC(p.x, p.z);
      const d = Math.hypot(mx - x, my - y);
      if (d < bd) { bd = d; best = p; }
    }
    ps.selPlace = best?.id ?? null;
    g.ui.invalidate();
  });
  const sel = ps.selPlace ? PLACES.find((p) => p.id === ps.selPlace) : null;
  let detail: Child = h('p', { class: 'small muted' }, 'Tap a place on the map for directions.');
  if (sel) {
    const route = planRoute(s, sel.node);
    const metric = g.settings.units === 'metric';
    const d = route ? (metric ? `${route.km.toFixed(0)} km` : `${(route.km / 1.609).toFixed(0)} mi`) : '—';
    const fuel = route ? fuelForRoute(s, route) : 0;
    const plan = planAssisted(s, sel.node);
    const camp = Object.values(CAMPGROUND_BY_ID).find((cg) => cg.place === sel.id);
    detail = h('div', { class: 'detail' },
      h('div', { class: 'name', style: 'font-weight:900;font-size:16px' }, sel.name),
      h('p', { class: 'small' }, sel.description),
      camp ? h('p', { class: 'small' }, `${camp.free ? 'Free' : money(camp.pricePerNight) + '/night'} · ${camp.amenities.join(' · ')}`) : null,
      route ? h('div', { class: 'small' }, `${d} · about ${fmtDuration(route.minutes)} · ~${fuel.toFixed(0)} L fuel`) : h('div', { class: 'small bad' }, 'No road route your vehicle can take.'),
      h('div', { class: 'row wrap', style: 'margin-top:8px' },
        route ? btn('Set GPS route', () => { g.route = route; g.routeDest = sel.node; g.ui.toast({ text: `GPS route set to ${sel.name}.`, kind: 'info' }); g.ui.invalidate(); }, 'small teal', 'map-gps') : null,
        g.route ? btn('Clear route', () => { g.route = null; g.routeDest = null; g.ui.invalidate(); }, 'small ghost') : null,
        g.mode !== 'explore' && !driving ? btn('Assisted travel', () => {
          if (!plan.ok) return;
          g.ui.closeId('phone');
          void g.assistedTravel(sel.node, sel.name);
        }, 'small', 'map-assisted', !plan.ok, plan.reason) : null,
        driving && plan.ok ? btn('Assisted travel', () => { g.ui.closeId('phone'); void g.assistedTravel(sel.node, sel.name); }, 'small', 'map-assisted') : null,
      ),
      !plan.ok && plan.reason ? h('p', { class: 'small muted' }, `Assisted travel: ${plan.reason}`) : h('p', { class: 'small good' }, 'Assisted travel available: skips the drive but charges all its time, fuel and wear.'),
    );
  }
  return h('div', null,
    h('div', { class: 'map-wrap' }, canvas),
    h('div', { class: 'legend' }, h('span', null, '● town'), h('span', null, '⛺ campground'), h('span', null, '⛽ truck stop'), h('span', null, '△ free camping'), h('span', null, '◆ viewpoint')),
    detail,
  );
}

// ───────────── Jobs ─────────────

function jobsApp(g: Game): Child {
  const s = g.sim!.s;
  const sim = g.sim!;
  const metric = g.settings.units === 'metric';
  const active = s.jobs.active.map((j) => {
    const o = j.offer;
    const late = o.kind === 'delivery' && s.time.minutes > o.deadlineMin;
    const left = o.kind === 'delivery' ? o.deadlineMin - s.time.minutes : 0;
    return h('div', { class: 'detail', style: 'margin-bottom:8px', testid: `job-${o.id}` },
      h('div', { style: 'font-weight:900' }, o.title),
      h('div', { class: 'small' }, `${money(o.pay)} · ${o.kind === 'delivery' ? (j.status === 'loaded' ? 'Cargo loaded' : 'Pick up the cargo') : `${j.progress}/${oddPoints(j).length} done`}`),
      o.kind === 'delivery' ? h('div', { class: 'small' },
        j.status === 'loaded' ? `Deliver to ${dockLabel(o.dropoff)}` : `Pick up at ${dockLabel(o.pickup)}`, ' · ',
        late ? h('span', { class: 'bad' }, 'LATE: pay drops each hour') : `due in ${fmtDuration(left)}`,
        ' · ', metric ? `${o.distanceKm.toFixed(0)} km` : `${(o.distanceKm / 1.609).toFixed(0)} mi`) : h('div', { class: 'small' }, o.description),
      o.kind === 'delivery' && j.status === 'loaded' ? h('div', { class: 'small muted' }, `${jobCargo(s, o.id).length} crates aboard, ${o.crates.reduce((a, c) => a + c.mass, 0)} kg`) : null,
      h('div', { class: 'row', style: 'margin-top:6px' },
        o.kind === 'delivery' ? btn('GPS', () => {
          const dock = j.status === 'loaded' ? o.dropoff : o.pickup;
          const place = PLACES.find((p) => p.id === ({ dj_dock: 'dusty', pl_lodge_dock: 'pinelake', mc_dock: 'mesa', ts_dock: 'coyote' } as Record<string, string>)[dock]);
          if (place) {
            const r = planRoute(s, place.node);
            if (r) { g.route = r; g.routeDest = place.node; g.ui.toast({ text: `GPS set to ${place.name}.`, kind: 'info' }); }
          }
        }, 'small teal') : null,
        btn('Abandon', () => g.screens.confirm('Abandon job?', o.kind === 'delivery' && j.status === 'loaded' ? 'The client will collect the cargo and charge a $25 fee.' : 'You will not be paid.', () => sim.abandon(o.id)), 'small ghost')),
    );
  });
  const gigs = REMOTE_GIGS.map((gig) => {
    const q = remoteQuote(s, gig.id, true);
    return h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, gig.title), h('div', { class: 'desc' }, `${gig.description} Needs ${gig.minSignal}+ bars.`)),
      h('div', { class: 'price' }, `${money(q.perHour)}/h`));
  });
  return h('div', null,
    h('h3', null, `Active jobs (${s.jobs.active.length}/3)`),
    active.length ? active : h('p', { class: 'small muted' }, 'No active jobs. Job boards are in Dusty Junction (Post & Freight), Pine Lake (ranger station) and Mesa City (Mesa Logistics).'),
    h('h3', null, 'Remote work'),
    h('p', { class: 'small muted' }, 'Work from a table or seat inside your RV (E at the dinette/table). Pay depends on signal, energy and mood.'),
    h('div', { class: 'list' }, gigs),
    h('h3', null, 'History'),
    s.jobs.history.length ? h('div', null, [...s.jobs.history].reverse().slice(0, 12).map((hh) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, `Day ${hh.day}: ${hh.title}`), h('span', { class: `stat-value ${hh.result === 'failed' ? 'neg' : 'pos'}` }, hh.result === 'failed' ? 'failed' : money(hh.pay))))) : h('p', { class: 'small muted' }, 'Nothing yet.'),
  );
}

// ───────────── Finances ─────────────

function financeApp(g: Game): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const start = s.time.minutes - 7 * 1440;
  const recent = s.tx.filter((t) => t.t > start);
  const byCat: Record<string, number> = {};
  let income = 0, spend = 0;
  for (const t of recent) {
    byCat[t.category] = (byCat[t.category] ?? 0) + t.amount;
    if (t.amount > 0) income += t.amount;
    else spend += -t.amount;
  }
  const weekly = vdef(v).weeklyCost + 12 + (s.locker ? 15 : 0);
  return h('div', null,
    h('div', { class: 'detail' },
      stat('Cash', money(s.cash), s.cash < 0 ? 'neg' : ''),
      stat('Income (last 7 days)', money(income), 'pos'),
      stat('Expenses (last 7 days)', money(spend), 'neg'),
      stat('Net (7 days)', money(weekNet(s)), weekNet(s) >= 0 ? 'pos' : 'neg'),
      stat('Recurring weekly bills', `${money(weekly)} (Mondays)`)),
    h('h3', null, 'Where the money went (7 days)'),
    h('table', { class: 'fin' }, Object.entries(byCat).sort((a, b) => a[1] - b[1]).map(([k, val]) => h('tr', null, h('td', null, k), h('td', { class: `amt ${val >= 0 ? 'pos' : 'neg'}` }, money(val))))),
    h('h3', null, 'Recent transactions'),
    h('table', { class: 'fin', testid: 'transactions' }, [...s.tx].reverse().slice(0, 30).map((t) => h('tr', null,
      h('td', { class: 'small muted' }, `D${dayOf(t.t)} ${fmtClock(t.t)}`), h('td', null, t.label), h('td', { class: `amt ${t.amount >= 0 ? 'pos' : 'neg'}` }, money(t.amount))))),
    h('h3', null, 'Daily summaries'),
    h('table', { class: 'fin' }, [...s.stats.history].reverse().slice(0, 10).map((d) => h('tr', null, h('td', null, `Day ${d.day}`), h('td', { class: 'amt pos' }, money(d.earned)), h('td', { class: 'amt neg' }, money(-d.spent)), h('td', { class: 'amt' }, `${(d.km / 1.609).toFixed(0)} mi`)))),
  );
}

// ───────────── RV status ─────────────

export function weightPanel(g: Game, compact = false): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const def = vdef(v);
  const w = computeWeight(s, v.id);
  const fr = (n: number, d: number) => n / d;
  const cls = (n: number, d: number) => (n > d ? 'over' : n > d * 0.97 ? 'near' : '');
  const svg = axleSvg(w.front, w.rear, def.frontGawr, def.rearGawr, def.id === 'van');
  return h('div', { testid: 'weight-panel' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Gross weight'), h('span', { class: 'stat-value', testid: 'gross-weight' }, `${kg(w.total)} / ${kg(w.gvwr)}`)),
    h('div', { class: `bar tall ${cls(w.total, w.gvwr)}` }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, fr(w.total, w.gvwr) * 100)}%` }), h('span', { class: 'bar-label' }, `${Math.round(fr(w.total, w.gvwr) * 100)}% of GVWR`)),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Payload left'), h('span', { class: `stat-value ${w.payloadLeft < 0 ? 'neg' : ''}`, testid: 'payload-left' }, kg(w.payloadLeft))),
    h('div', { class: 'axles' }, svg),
    h('div', { class: 'grid2' },
      h('div', null, h('div', { class: 'small' }, `Front axle ${kg(w.front)} / ${kg(def.frontGawr)}`), h('div', { class: `bar ${cls(w.front, def.frontGawr)}` }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, fr(w.front, def.frontGawr) * 100)}%` }))),
      h('div', null, h('div', { class: 'small' }, `Rear axle ${kg(w.rear)} / ${kg(def.rearGawr)}`), h('div', { class: `bar ${cls(w.rear, def.rearGawr)}` }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, fr(w.rear, def.rearGawr) * 100)}%` })))),
    w.messages.length ? h('div', { class: 'callout bad', style: 'margin-top:8px' }, w.messages.join('. ') + '.') : null,
    compact ? null : [
      h('h3', null, 'Breakdown'),
      ...(Object.keys(WEIGHT_CAT_LABEL) as WeightCat[]).filter((k) => w.byCat[k] > 0.05).map((k) => stat(WEIGHT_CAT_LABEL[k], kg(w.byCat[k]))),
      h('h3', null, 'Storage'),
      ...compartments(s, v.id).map((cp) => {
        const u = compartmentUse(s, v.id, cp.id);
        return h('div', { style: 'margin-bottom:6px' },
          h('div', { class: 'row small' }, h('b', null, cp.name), h('span', { class: 'spacer' }), `${liters(u.liters)} / ${liters(cp.liters)} · ${kg(u.kg)} / ${kg(cp.maxKg)}`, cp.secure ? '' : h('span', { class: 'pill warn', style: 'margin-left:6px' }, 'loose')),
          h('div', { class: `bar ${cls(u.liters, cp.liters)}` }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, (u.liters / cp.liters) * 100)}%` })));
      }),
    ],
  );
}

function axleSvg(front: number, rear: number, fr: number, rr: number, van: boolean): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 300 110');
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    svg.appendChild(e);
    return e;
  };
  el('rect', { x: 20, y: 22, width: 260, height: van ? 48 : 56, rx: 12, fill: '#efe3cc', stroke: '#b89a6a', 'stroke-width': 2 });
  const fx = van ? 230 : 236, rx = van ? 98 : 120;
  const tag = (x: number, s: string) => {
    const t = el('text', { x, y: 52, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 800, fill: '#9a7a52' });
    t.textContent = s;
  };
  tag(rx, 'REAR AXLE');
  tag(fx, 'FRONT AXLE');
  const arrow = el('text', { x: 268, y: 40, 'text-anchor': 'end', 'font-size': 10, fill: '#9a7a52' });
  arrow.textContent = 'front →';
  for (const [x, load, rating] of [[fx, front, fr], [rx, rear, rr]] as [number, number, number][]) {
    const color = load > rating ? '#b8483a' : load > rating * 0.97 ? '#c88a2a' : '#2f7f7a';
    el('circle', { cx: x, cy: 84, r: 15, fill: '#3a3530' });
    el('circle', { cx: x, cy: 84, r: 6, fill: '#c8ccd0' });
    const t = el('text', { x, y: 15, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: color });
    t.textContent = `${Math.round(load)} kg`;
    const t2 = el('text', { x, y: 108, 'text-anchor': 'middle', 'font-size': 10, fill: '#6b5a4a' });
    t2.textContent = `${Math.round((load / rating) * 100)}% of ${rating}`;
  }
  return svg;
}

function tank(label: string, cur: number, cap: number, unit: string, cls: string, extra?: string): Child {
  return h('div', { style: 'margin-bottom:8px' },
    h('div', { class: 'row small' }, h('b', null, label), h('span', { class: 'spacer' }), `${cur >= 10 ? Math.round(cur) : cur.toFixed(1)} / ${Math.round(cap)} ${unit}`, extra ? h('span', { class: 'muted', style: 'margin-left:6px' }, extra) : null),
    h('div', { class: `bar ${cls}` }, h('div', { class: 'bar-fill', style: `width:${cap > 0 ? Math.min(100, (cur / cap) * 100) : 0}%` })));
}

function rvApp(g: Game): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const def = vdef(v);
  const c = capacities(s, v.id);
  let content: Child;
  if (ps.rvTab === 'weight') {
    content = weightPanel(g);
    if (!s.objectives.done.weight) g.sim!.objective('weight');
  } else if (ps.rvTab === 'utilities') {
    const pw = powerStatus(s, v, { occupied: g.mode !== 'explore' });
    const fm = fridgeState(v, c);
    content = h('div', { testid: 'utilities-panel' },
      tank('Fuel', v.fuel, c.fuel, 'L', 'fuel'),
      tank('Fresh water', v.fresh, c.fresh, 'L', 'fresh', v.hookups.water ? 'city water connected' : ''),
      tank('Gray water', v.gray, c.gray, 'L', 'gray', v.hookups.sewer ? 'draining to sewer' : ''),
      c.black > 0 ? tank(c.toilet === 'cassette' ? 'Toilet cassette' : 'Black water', v.black, c.black, 'L', 'black') : h('p', { class: 'small muted' }, c.toilet === 'composting' ? 'Composting toilet: no black water.' : 'No black tank.'),
      tank('House battery', v.batteryWh, c.batteryWh, 'Wh', 'batt'),
      c.propane > 0 ? tank('Propane', v.propane, c.propane, 'kg', 'prop') : h('p', { class: 'small muted' }, 'No propane system (stove uses butane canisters).'),
      h('h3', null, 'Power right now'),
      stat('Using', `${Math.round(pw.loadW)} W`), stat('Solar', `${Math.round(pw.solarW)} W (${Math.round(c.solarW)} W installed)`),
      stat('Charging', pw.shore ? `Shore power (${Math.round(pw.chargeW)} W charger)` : v.generatorOn ? 'Generator' : v.engineOn ? 'Alternator' : 'Solar only'),
      stat('Fridge', fm === 'none' ? 'none' : fm === 'off' ? 'OFF (no power)' : `running on ${fm}`),
      stat('Hookups', [v.hookups.power ? 'power' : '', v.hookups.water ? 'water' : '', v.hookups.sewer ? 'sewer' : ''].filter(Boolean).join(', ') || 'none'),
      c.generatorW > 0 ? btn(v.generatorOn ? 'Stop generator' : 'Start generator', () => { v.generatorOn = !v.generatorOn; g.sim!.changed(); }, 'small teal') : null,
    );
  } else {
    const comp = [
      ['Engine', v.condition.engine], ['Steering & suspension', v.condition.steering], ['Brakes', v.condition.brakes],
      ['Appliances & equipment', appliancesCondition(s, v.id)],
    ] as [string, number][];
    content = h('div', { testid: 'condition-panel' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Overall mechanical condition'), h('span', { class: 'stat-value' }, pct(overallCondition(s, v.id)))),
      ...comp.map(([n, val]) => h('div', { style: 'margin:6px 0' }, h('div', { class: 'row small' }, h('b', null, n), h('span', { class: 'spacer' }), pct(val)),
        h('div', { class: `bar ${val < 0.35 ? 'over' : val < 0.55 ? 'near' : ''}` }, h('div', { class: 'bar-fill', style: `width:${val * 100}%` })))),
      h('h3', null, 'Body'),
      stat('Paint & body (looks only)', pct(v.body)), stat('Dirt', pct(v.dirt)), stat('Odometer', `${Math.round(v.odometerKm / 1.609).toLocaleString()} mi`),
      h('p', { class: 'small muted' }, 'Worn parts change how the RV drives: weaker acceleration, a pull to one side, longer braking and more fuel. Mechanics in Dusty Junction and Mesa City fix them; parts kits + a tool kit let you do some yourself.'),
    );
  }
  return h('div', null,
    h('div', { class: 'small muted', style: 'margin-bottom:6px' }, `${def.name}`),
    tabs([{ id: 'weight', label: 'Weight' }, { id: 'utilities', label: 'Utilities' }, { id: 'condition', label: 'Condition' }], ps.rvTab, (id) => { ps.rvTab = id as PhoneState['rvTab']; g.ui.invalidate(); }, 'rv'),
    content,
  );
}

// ───────────── Inventory ─────────────

function inventoryApp(g: Game): Child {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const sim = g.sim!;
  const comps = compartments(s, v.id);
  const sel = ps.selItem ? s.items[ps.selItem] : null;
  const list = comps.map((cp) => {
    const items = itemsInCompartment(s, v.id, cp.id);
    const u = compartmentUse(s, v.id, cp.id);
    return h('div', { style: 'margin-bottom:10px' },
      h('div', { class: 'row small' }, h('b', null, cp.name), h('span', { class: 'spacer' }), `${liters(u.liters)}/${liters(cp.liters)} · ${kg(u.kg)}/${kg(cp.maxKg)}`),
      items.length ? h('div', { class: 'list' }, items.map((it) => h('div', {
        class: `item ${ps.selItem === it.uid ? 'selected' : ''}`, style: 'padding:6px 9px', testid: `inv-${it.def}`,
        onClick: () => { ps.selItem = it.uid; g.ui.invalidate(); },
      }, h('div', { class: 'meta' }, h('div', { class: 'name', style: 'font-size:13.5px' }, itemName(it), it.spoiled ? h('span', { class: 'pill bad' }, 'spoiled') : null, !cp.secure && !it.secured ? h('span', { class: 'pill warn' }, 'loose') : null),
        h('div', { class: 'desc' }, `${kg(itemKg(it))} · ${liters(itemLiters(it))}${it.servings != null ? ` · ${it.servings} servings` : ''}${it.condition < 0.99 ? ` · ${pct(it.condition)} condition` : ''}`))))) : h('div', { class: 'small muted' }, 'Empty'),
    );
  });
  let actions: Child = null;
  if (sel && sel.where.kind === 'stored') {
    const d = defOf(sel);
    const here = sel.where.comp;
    actions = h('div', { class: 'detail', style: 'margin-bottom:10px' },
      h('div', { style: 'font-weight:900' }, itemName(sel)), h('p', { class: 'small' }, d.description),
      h('div', { class: 'small' }, 'Move to:'),
      h('div', { class: 'row wrap', style: 'margin:4px 0 6px' }, comps.filter((cp) => cp.id !== here).map((cp) => btn(cp.name.replace(/ \(.*\)/, ''), () => {
        const r = sim.moveItem(sel.uid, cp.id);
        if (!r.ok) g.ui.toast({ text: r.reason, kind: 'bad' });
      }, 'small ghost', `move-to-${cp.id}`))),
      h('div', { class: 'row wrap' },
        d.food && (sel.servings ?? 0) > 0 && !sel.spoiled ? btn('Eat', () => g.screens.timed(() => sim.eat(sel.uid), ''), 'small') : null,
        d.food || sel.spoiled ? btn('Throw away', () => { sim.discard(sel.uid); ps.selItem = null; }, 'small ghost') : null,
        d.features?.waterJug ? btn('Pour into fresh tank', () => g.screens.timed(() => sim.pourJug(sel.uid), ''), 'small') : null,
        d.features?.outdoor && g.mode === 'explore' ? btn('Take it outside', () => { s.player.carrying = { kind: 'item', uid: sel.uid }; sel.where = { kind: 'carried' }; sim.changed(); g.ui.closeId('phone'); }, 'small') : null,
        !comps.find((cp) => cp.id === here)?.secure && !sel.secured ? btn('Strap down', () => {
          if (!itemsInCompartment(s, v.id, here).length) return;
          if (!s.items[sel.uid]) return;
          const hasStraps = Object.values(s.items).some((i) => i.def === 'cargo_straps' && i.where.kind === 'stored' && i.where.vehicle === v.id);
          if (!hasStraps) g.ui.toast({ text: 'You need cargo straps.', kind: 'warn' });
          else { sel.secured = true; sim.changed(); }
        }, 'small teal') : null,
      ));
  }
  const locker = lockerItems(s);
  return h('div', null, actions, list,
    s.locker ? h('div', null, h('h3', null, `Storage locker (Mesa City) · ${liters(lockerUse(s))}/${liters(LOCKER_LITERS)}`),
      locker.length ? locker.map((it) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, itemName(it)), h('span', { class: 'stat-value' }, kg(itemKg(it))))) : h('p', { class: 'small muted' }, 'Empty')) : null,
  );
}

// ───────────── Journal ─────────────

function journalApp(g: Game): Child {
  const s = g.sim!.s;
  const day = dayOf(s.time.minutes);
  return h('div', null,
    h('h3', null, 'Getting started'),
    h('div', null, OBJECTIVES.map((o) => h('div', { class: 'stat', testid: `obj-${o.id}` }, h('span', { class: 'stat-label' }, o.title), h('span', { class: `stat-value ${s.objectives.done[o.id] != null ? 'good' : 'muted'}` }, s.objectives.done[o.id] != null ? '✓' : '·')))),
    h('h3', null, day <= 30 ? `30-day goal (day ${day})` : '30-day goal'),
    s.objectives.goalResult !== 'pending' ? h('div', { class: `callout ${s.objectives.goalResult === 'met' ? 'good' : ''}` }, s.objectives.goalResult === 'met' ? 'Achieved! You built a sustainable life on the road.' : 'Not quite on day 30, but there is no deadline on happiness.') : null,
    h('div', null, goalChecks(s).map((c) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, c.label), h('span', { class: `stat-value ${c.met ? 'good' : 'muted'}` }, c.met ? '✓' : '·')))),
    h('h3', null, `Discoveries (${Object.keys(s.discovered).length}/${DISCOVERIES.length})`),
    h('div', null, DISCOVERIES.map((d) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, s.discovered[d.id] != null ? d.name : '???'), h('span', { class: 'stat-value' }, s.discovered[d.id] != null ? `Day ${dayOf(s.discovered[d.id])}` : '')))),
    h('h3', null, 'Journal'),
    h('div', null, [...s.journal].reverse().slice(0, 40).map((j) => h('p', { class: 'small' }, h('b', null, `Day ${dayOf(j.t)}, ${fmtClock(j.t)} · `), j.text))),
  );
}

void NODE_BY_ID;
void hourOf;
