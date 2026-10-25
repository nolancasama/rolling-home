import { NEEDS } from '../data/config';
import { WEEKDAYS } from '../data/content';
import { PLACES } from '../data/map';
import { dayOf, fmtClock, money, weekdayOf } from '../sim/core';
import { currentObjective } from '../sim/objectives';
import { placeName } from '../sim/places';
import { looseUnsecured } from '../sim/storage';
import { activeVehicle, capacities } from '../sim/vehicle';
import { computeWeight } from '../sim/weight';
import { EDGES } from '../world/roads';
import type { Game } from '../game/game';
import { clear, h } from './dom';

// Adaptive HUD: only what matters for the current situation.

export class Hud {
  private el: HTMLElement;
  private time = h('div', { class: 'hud-chip hud-time', testid: 'hud-time' }, h('span', { class: 't-main' }), h('span', { class: 't-sub' }));
  private cash = h('div', { class: 'hud-chip hud-cash', testid: 'hud-cash' });
  private place = h('div', { class: 'hud-chip hud-place' });
  private warn = h('div', { class: 'hud-warn' });
  private needs = h('div', { class: 'hud-chip hud-needs', testid: 'hud-needs' });
  private obj = h('div', { class: 'hud-chip hud-obj', testid: 'hud-objective' });
  private hint = h('div', { class: 'hud-hint' });
  private cross = h('div', { class: 'crosshair' });
  private drive = h('div', { class: 'drive-gauge' });
  private speed = h('div', { class: 'speedo', testid: 'hud-speed' }, h('div', { class: 'spd' }, '0'), h('div', { class: 'unit' }, 'mph'), h('div', { class: 'gear' }, 'D'));
  private fuel = h('div', { class: 'fuelg', testid: 'hud-fuel' });
  private gps = h('div', { class: 'gps hidden', testid: 'hud-gps' });
  private park = h('div', { class: 'park-guide hidden' });
  private mini = h('div', { class: 'minimap' });
  private miniCanvas = document.createElement('canvas');
  private t = 0;
  private miniT = 0;
  private lastPlace = '';
  private placeT = 0;

  constructor(private g: Game) {
    this.el = g.ui.hud;
    this.drive.append(this.speed, this.fuel);
    this.miniCanvas.width = 380;
    this.miniCanvas.height = 380;
    this.mini.appendChild(this.miniCanvas);
    this.el.append(this.time, this.cash, this.place, this.warn, this.needs, this.obj, this.hint, this.cross, this.drive, this.gps, this.park, this.mini);
    this.hideAll();
  }

  hideAll() {
    for (const c of Array.from(this.el.children)) (c as HTMLElement).classList.add('hidden');
  }

  private show(el: HTMLElement, on: boolean) {
    el.classList.toggle('hidden', !on);
  }

  update(dt: number) {
    const g = this.g;
    const sim = g.sim;
    if (!sim || g.mode === 'menu' || g.hudHidden) {
      this.hideAll();
      if (g.hudHidden && sim) {
        this.show(this.hint, true);
        this.hint.textContent = 'HUD hidden · press H to show';
      }
      return;
    }
    this.t -= dt;
    this.miniT -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    const s = sim.s;
    const v = activeVehicle(s);
    const mode = g.mode;
    const furnishing = mode === 'design';
    const driving = mode === 'drive';
    // time
    this.show(this.time, !furnishing);
    (this.time.children[0] as HTMLElement).textContent = fmtClock(s.time.minutes);
    (this.time.children[1] as HTMLElement).textContent = `Day ${dayOf(s.time.minutes)} · ${WEEKDAYS[weekdayOf(s.time.minutes)]}`;
    this.show(this.cash, !furnishing);
    this.cash.textContent = s.gameType === 'creative' ? 'Creative' : money(s.cash);
    this.cash.classList.toggle('neg', s.cash < 0);
    // place name flash
    const px = mode === 'explore' ? g.explore.x : g.phys!.x;
    const pz = mode === 'explore' ? g.explore.z : g.phys!.z;
    const pn = placeName(px, pz);
    if (pn !== this.lastPlace) {
      this.lastPlace = pn;
      this.placeT = 4;
      this.place.textContent = pn;
    }
    this.placeT -= 0.1;
    this.show(this.place, this.placeT > 0 && !furnishing && !!pn);
    // warnings
    clear(this.warn);
    if (!furnishing) {
      const c = capacities(s, v.id);
      const w = computeWeight(s, v.id);
      const add = (t: string, y = false) => this.warn.append(h('div', { class: `w ${y ? 'y' : ''}` }, t));
      if (v.fuel < c.fuel * 0.12) add(`⛽ Low fuel (${Math.round(v.fuel)} L)`, v.fuel > c.fuel * 0.05);
      if (w.status === 'refuse') add('⚖ Too heavy to drive');
      else if (w.status === 'over') add('⚖ Overloaded', true);
      if (c.black > 0 && v.black >= c.black * 0.9) add('🚽 Black tank nearly full', v.black < c.black - 0.5);
      if (v.gray >= c.gray * 0.9 && !v.hookups.sewer) add('🫗 Gray tank nearly full', v.gray < c.gray - 0.5);
      if (v.batteryWh < c.batteryWh * 0.12 && !v.hookups.power) add('🔋 House battery low', v.batteryWh > 1);
      if (v.fresh < c.fresh * 0.1 && !v.hookups.water) add('💧 Fresh water low', true);
      if (driving && v.condition.engine < 0.25) add('🔧 Check engine');
      if (driving && v.condition.brakes < 0.3) add('🔧 Brakes worn');
      if (driving && looseUnsecured(s, v.id).length) add('📦 Loose cargo', true);
      if (driving && (v.hookups.power || v.hookups.water || v.hookups.sewer)) add('🔌 Still hooked up!');
    }
    // needs
    const n = s.player.needs;
    const lowAny = n.hunger < 40 || n.energy < 40 || n.hygiene < 40 || n.mood < 35;
    const showNeeds = !furnishing && (mode === 'interior' || lowAny || g.settings.needsHud === 'always');
    this.show(this.needs, showNeeds && !driving);
    if (showNeeds && !driving) {
      clear(this.needs);
      for (const [k, ico] of [['hunger', '🍲'], ['energy', '⚡'], ['hygiene', '🚿'], ['mood', '🙂']] as const) {
        const val = n[k];
        const cls = val < NEEDS.critical ? 'crit' : val < NEEDS.low ? 'low' : '';
        this.needs.append(h('div', { class: `need ${cls}`, title: `${k} ${Math.round(val)}` }, h('span', { class: 'ico' }, ico),
          h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${val.toFixed(0)}%` }))));
      }
    }
    // objective
    const o = currentObjective(s);
    this.show(this.obj, !furnishing && !driving);
    if (!driving && !furnishing) {
      clear(this.obj);
      if (o) this.obj.append(h('div', { class: 'o-title' }, '★ ', o.title), h('div', null, o.hint));
      else {
        const day = dayOf(s.time.minutes);
        this.obj.append(h('div', { class: 'o-title' }, day <= 30 ? `★ Day ${day} of 30` : '★ Free play'),
          h('div', null, day <= 30 ? 'Build a sustainable life on the road: savings, a positive week, good mood, a healthy RV.' : 'The road is yours. Explore, upgrade, or just enjoy the view.'));
      }
    }
    this.show(this.cross, mode === 'interior');
    // drive
    this.show(this.drive, driving);
    this.show(this.mini, (driving || mode === 'explore') && g.settings.minimap);
    if (driving) {
      const p = g.phys!;
      const metric = g.settings.units === 'metric';
      const spd = Math.abs(p.speed) * (metric ? 3.6 : 2.237);
      (this.speed.children[0] as HTMLElement).textContent = Math.round(spd).toString();
      (this.speed.children[1] as HTMLElement).textContent = metric ? 'km/h' : 'mph';
      (this.speed.children[2] as HTMLElement).textContent = p.fuelEmpty ? 'NO FUEL' : p.reverse ? 'R' : Math.abs(p.speed) < 0.3 ? 'P' : 'D';
      const c = capacities(s, v.id);
      clear(this.fuel);
      const fuelFrac = v.fuel / c.fuel;
      this.fuel.append(
        h('div', null, `⛽ Fuel ${Math.round(v.fuel)} / ${c.fuel} L`),
        h('div', { class: `bar fuel ${fuelFrac < 0.15 ? 'over' : ''}` }, h('div', { class: 'bar-fill', style: `width:${(fuelFrac * 100).toFixed(0)}%` })),
        h('div', { class: 'small', style: 'margin-top:4px;opacity:0.85' }, `${g.drive.cam === 'chase' ? 'Chase' : 'Cockpit'} cam (C) · Lights ${g.drive.lightMode} (L)`),
      );
      const gps = g.drive.gps;
      this.show(this.gps, !!gps);
      if (gps) {
        clear(this.gps);
        const arrow = gps.turn === 'left' ? '↰' : gps.turn === 'right' ? '↱' : gps.turn === 'arrive' ? '◎' : '↑';
        const dist = gps.distance;
        const dTxt = metric ? (dist > 900 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist / 10) * 10} m`) : (dist > 300 ? `${(dist / 1609).toFixed(1)} mi` : `${Math.round(dist * 3.28 / 50) * 50} ft`);
        const rem = metric ? `${gps.remainingKm.toFixed(0)} km` : `${(gps.remainingKm / 1.609).toFixed(0)} mi`;
        const destName = PLACES.find((pl) => pl.node === g.routeDest)?.name ?? 'Destination';
        this.gps.append(h('div', { class: 'arrow' }, arrow), h('div', null,
          h('div', { class: 'g-main' }, gps.turn === 'straight' ? `Continue ${dTxt}` : gps.turn === 'arrive' ? 'Arriving' : `Turn ${gps.turn} in ${dTxt}`),
          h('div', { class: 'g-sub' }, `${destName} · ${rem} to go`)));
      }
      const pd = g.drive.parkDist;
      this.show(this.park, pd != null);
      if (pd != null) {
        this.park.textContent = `${g.phys!.reverse ? 'Rear' : 'Front'} sensor: ${pd < 0.6 ? 'STOP' : `${pd.toFixed(1)} m`}`;
        this.park.className = `park-guide ${pd < 0.6 ? 'stop' : pd < 1.5 ? 'close' : ''}`;
      }
      this.show(this.hint, true);
      this.hint.textContent = 'W/S drive & reverse · A/D steer · Space brake · Q look back · Tab GPS · H hide HUD';
    } else {
      this.show(this.gps, false);
      this.show(this.park, false);
      this.show(this.hint, mode === 'explore' || mode === 'interior');
      this.hint.textContent = mode === 'interior' ? 'WASD move · mouse look · E interact · F design · Tab phone · Esc pause' : 'WASD move · Shift run · mouse look · E interact · Tab phone · M map · Esc pause';
    }
    if (this.miniT <= 0 && !this.mini.classList.contains('hidden')) {
      this.miniT = 0.2;
      this.drawMinimap();
    }
  }

  private drawMinimap() {
    const g = this.g;
    const c = this.miniCanvas.getContext('2d')!;
    const W = this.miniCanvas.width;
    const driving = g.mode === 'drive';
    const px = driving ? g.phys!.x : g.explore.x;
    const pz = driving ? g.phys!.z : g.explore.z;
    const hd = driving ? g.phys!.heading : g.explore.camYaw;
    const R = driving ? 420 : 180;
    const sc = W / 2 / R;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#e2cf9e';
    c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    c.rotate(Math.PI + hd);
    c.scale(sc, sc);
    c.translate(-px, -pz);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const e of EDGES) {
      // quick reject
      const mid = Math.floor(e.xs.length / 2);
      if (Math.hypot(e.xs[mid] - px, e.zs[mid] - pz) > R + e.length / 2) continue;
      c.strokeStyle = e.def.kind === 'highway' ? '#ffffff' : e.def.kind === 'mountain' ? '#fff6dc' : e.def.kind === 'street' ? '#f4ead5' : '#c8a878';
      c.lineWidth = Math.max(e.def.width, 7 / sc);
      c.beginPath();
      for (let i = 0; i < e.xs.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, e.xs[i], e.zs[i]);
      c.lineTo(e.xs[e.xs.length - 1], e.zs[e.zs.length - 1]);
      c.stroke();
    }
    if (g.route) {
      c.strokeStyle = '#2f9fd0';
      c.lineWidth = 9 / sc;
      c.beginPath();
      g.route.points.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z)));
      c.stroke();
    }
    // lake
    c.fillStyle = '#5a9ac0';
    c.beginPath();
    c.ellipse(-150, -1260, 240, 140, 0, 0, Math.PI * 2);
    c.fill();
    c.setTransform(1, 0, 0, 1, 0, 0);
    // player arrow
    c.fillStyle = '#cf6a3e';
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W / 2, W / 2 - 16);
    c.lineTo(W / 2 + 11, W / 2 + 12);
    c.lineTo(W / 2, W / 2 + 6);
    c.lineTo(W / 2 - 11, W / 2 + 12);
    c.closePath();
    c.fill();
    c.stroke();
  }
}
