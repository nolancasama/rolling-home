import { fmtDuration, money, type Result } from '../../sim/core';
import { canLevel, outdoorItemsNear, pretrip } from '../../sim/camping';
import { cookCheck, edibleFoods, sleepPlan } from '../../sim/living';
import { diyCheck, partsInVehicle } from '../../sim/maintenance';
import { activeVehicle, capacities, compartmentById, defOf, itemName, itemsInCompartment, itemsInVehicle, overallCondition, vdef } from '../../sim/vehicle';
import type { SleepSummary } from '../../sim/sim';
import type { Game } from '../../game/game';
import type { Action } from '../../game/interactions';
import { btn, h, type Child } from '../dom';
import { kg, liters, modal, pct, thumbEl } from './common';
import { weightPanel } from './phone';

export function actionMenu(g: Game, title: string, actions: Action[]) {
  g.ui.open(modal(g.ui, 'actions', {
    title, size: 'narrow',
    body: () => h('div', { class: 'list' }, actions.filter((a) => !a.hidden).map((a, i) => h('div', {
      class: `item ${a.disabled ? 'disabled' : ''}`, testid: `action-${i}`,
      onClick: () => {
        if (a.disabled) {
          g.ui.toast({ text: a.disabled, kind: 'warn' });
          return;
        }
        g.ui.closeId('actions');
        a.run();
      },
    }, h('div', { class: 'meta' }, h('div', { class: 'name' }, a.label), a.disabled ? h('div', { class: 'desc bad' }, a.disabled) : null)))),
  }));
}

/** Run a timed sim action behind a short fade with a caption. */
export function timed(g: Game, fn: () => Result<{ minutes: number }>, caption: string) {
  const t0 = g.sim!.s.time.minutes;
  let res: Result<{ minutes: number }> | null = null;
  const card = h('div', { class: 'fade-card' }, h('div', { class: 'big' }, caption || '...'), h('div', { class: 'small' }, ''));
  const quick = !caption;
  const run = () => {
    res = fn();
    if (!res.ok) return;
    const el = card.querySelector('.small');
    if (el) el.textContent = `${fmtDuration(g.sim!.s.time.minutes - t0)} pass.`;
  };
  if (quick) {
    run();
    if (res && !(res as Result).ok) g.ui.toast({ text: (res as { reason: string }).reason, kind: 'warn' });
    return;
  }
  // check cheaply first by running inside the fade
  void g.ui.fade(async () => {
    run();
    await new Promise((r) => setTimeout(r, 700));
    if (res && !res.ok) g.ui.toast({ text: res.reason, kind: 'warn' });
  }, 380, card);
}

export function confirmScreen(g: Game, title: string, text: string, ok: () => void, okLabel = 'OK') {
  g.ui.open(modal(g.ui, 'confirm', {
    title, size: 'narrow', body: () => h('p', null, text),
    foot: () => [btn('Cancel', () => g.ui.closeId('confirm'), 'ghost'), btn(okLabel, () => { g.ui.closeId('confirm'); ok(); }, 'teal', 'confirm-ok')],
  }));
}

export function infoScreen(g: Game, title: string, lines: Child[]) {
  g.ui.open(modal(g.ui, 'info', { title, size: 'narrow', body: () => h('div', null, lines), foot: () => [btn('OK', () => g.ui.closeId('info'), 'teal', 'info-ok')] }));
}

function foodList(g: Game, cook: boolean): Child {
  const s = g.sim!.s;
  const foods = edibleFoods(s).filter((f) => (cook ? defOf(f).food!.kind === 'cook' : true));
  if (!foods.length) return h('p', { class: 'muted' }, cook ? 'Nothing to cook. Buy groceries at a market.' : 'No food in the RV. Buy groceries, or eat at the diner.');
  return h('div', { class: 'list' }, foods.map((f) => {
    const d = defOf(f);
    const fd = d.food!;
    const chk = cook ? cookCheck(s, f.uid) : f.spoiled ? { ok: false as const, reason: 'Spoiled.' } : { ok: true as const };
    const comp = f.where.kind === 'stored' ? compartmentById(s, activeVehicle(s).id, f.where.comp)?.name : '';
    return h('div', { class: `item ${chk.ok ? '' : 'disabled'}`, testid: `${cook ? 'cook' : 'eat'}-${f.def}` , onClick: () => {
      if (!chk.ok) {
        g.ui.toast({ text: chk.reason, kind: 'warn' });
        return;
      }
      g.ui.closeId(cook ? 'cook' : 'eat');
      timed(g, () => (cook ? g.sim!.cook(f.uid) : g.sim!.eat(f.uid)), cook ? `Cooking ${d.name.toLowerCase()}...` : '');
      if (cook) g.audio.stove();
    } }, thumbEl(d), h('div', { class: 'meta' }, h('div', { class: 'name' }, d.name, f.spoiled ? h('span', { class: 'pill bad' }, 'spoiled') : null),
      h('div', { class: 'desc' }, `${f.servings} serving(s) · ${comp}${fd.perishable && !f.spoiled && f.shelf != null ? ` · fresh for ${fmtDuration(Math.max(0, f.shelf))} outside a fridge` : ''}`),
      !chk.ok ? h('div', { class: 'desc bad' }, chk.reason) : h('div', { class: 'desc' }, cook ? `+${fd.hunger} hunger · ${fd.cookMinutes} min` : fd.kind === 'cook' ? `Eat cold: +${Math.round(fd.hunger * 0.5)} (better cooked)` : `+${fd.hunger} hunger`)));
  }));
}

export function eatScreen(g: Game) {
  g.ui.open(modal(g.ui, 'eat', { title: 'Something to eat', size: 'mid', body: () => foodList(g, false) }));
}

export function cookScreen(g: Game) {
  const s = g.sim!.s;
  const c = capacities(s, activeVehicle(s).id);
  g.ui.open(modal(g.ui, 'cook', {
    title: 'Cook a meal', size: 'mid',
    sub: () => `Stove: ${c.stove ?? 'none'} · uses ~3 L fresh water (2.5 L to gray) for cooking and dishes`,
    body: () => foodList(g, true),
  }));
}

export function sleepScreen(g: Game, nap: boolean) {
  const s = g.sim!.s;
  const plan = sleepPlan(s, nap);
  g.ui.open(modal(g.ui, 'sleep', {
    title: nap ? 'Take a nap' : 'Go to bed', size: 'narrow',
    body: () => h('div', null,
      h('p', null, `${nap ? 'Nap' : 'Sleep'} for ${fmtDuration(plan.minutes)} in the ${plan.bed.toLowerCase()}.`),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Expected sleep quality'), h('span', { class: `stat-value ${plan.quality < 0.6 ? 'bad' : plan.quality > 0.9 ? 'good' : ''}` }, pct(plan.quality))),
      plan.reasons.length ? h('ul', { class: 'small' }, plan.reasons.map((r) => h('li', null, r))) : null,
      h('p', { class: 'small muted' }, 'Time passes while you sleep: your fridge, battery, fees and deadlines keep running.'),
    ),
    foot: () => [btn('Not yet', () => g.ui.closeId('sleep'), 'ghost'), btn(nap ? 'Nap' : 'Sleep', () => {
      g.ui.closeId('sleep');
      g.screens.doSleep(nap);
    }, 'teal', 'sleep-go')],
  }));
}

export function sleepSummaryScreen(g: Game, sum: SleepSummary, nap: boolean) {
  const s = g.sim!.s;
  g.ui.open(modal(g.ui, 'summary', {
    title: nap ? 'Feeling better' : `Good morning, day ${sum.day}`, size: 'narrow',
    body: () => h('div', { class: 'sleep-card' },
      h('div', { class: 'big' }, `Slept ${fmtDuration(sum.minutes)} · ${pct(sum.quality)} quality`),
      h('p', { class: 'muted' }, `Energy ${Math.round(sum.energyBefore)} → ${Math.round(sum.energyAfter)}`),
      !nap ? h('div', { class: 'detail', style: 'text-align:left' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Earned yesterday'), h('span', { class: 'stat-value pos' }, money(sum.earned))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Spent'), h('span', { class: 'stat-value neg' }, money(sum.spent))),
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Distance'), h('span', { class: 'stat-value' }, g.settings.units === 'metric' ? `${sum.km.toFixed(0)} km` : `${(sum.km / 1.609).toFixed(0)} mi`)),
        sum.discoveries.length ? h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Discovered'), h('span', { class: 'stat-value' }, sum.discoveries.join(', '))) : null,
        h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Cash now'), h('span', { class: 'stat-value' }, money(s.cash)))) : null,
      sum.reasons.length ? h('p', { class: 'small muted' }, sum.reasons.join(' · ')) : null,
    ),
    foot: () => [btn('Start the day', () => g.ui.closeId('summary'), 'teal', 'summary-ok')],
  }));
  setTimeout(() => g.ui.closeId('summary'), 12000);
}

export function storageScreen(g: Game, compId: string) {
  g.ui.open(modal(g.ui, 'storage', {
    title: compartmentById(g.sim!.s, activeVehicle(g.sim!.s).id, compId)?.name ?? 'Storage', size: 'mid',
    body: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const cp = compartmentById(s, v.id, compId);
      if (!cp) return h('p', null, 'Gone.');
      const items = itemsInCompartment(s, v.id, compId);
      return h('div', null,
        h('p', { class: 'small muted' }, `${cp.refrigerated ? 'Refrigerated. ' : ''}${cp.secure ? 'Closed storage: safe while driving.' : 'Loose: strap things down before driving.'}`),
        items.length ? h('div', { class: 'list' }, items.map((it) => h('div', { class: 'item' }, thumbEl(defOf(it)), h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(it)),
          h('div', { class: 'desc' }, `${kg(defOf(it).mass)}${it.servings != null ? ` · ${it.servings} servings` : ''}${it.spoiled ? ' · spoiled' : ''}`)),
          defOf(it).food && !it.spoiled ? btn('Eat', () => timed(g, () => g.sim!.eat(it.uid), ''), 'small') : null))) : h('p', { class: 'muted' }, 'Empty.'),
        h('p', { class: 'small' }, btn('Manage all storage', () => g.screens.openPhone('inventory'), 'small ghost')),
      );
    },
  }));
}

export function dialogScreen(g: Game, npcId: string) {
  const d = g.sim!.npcDialog(npcId);
  let lines = d.lines;
  g.ui.open(modal(g.ui, 'dialog', {
    title: d.name, size: 'narrow',
    body: () => h('div', { class: 'dialog-lines' }, lines.map((l) => h('p', null, l))),
    foot: () => g.sim!.npcDialog(npcId).options.map((o) => btn(o.label, () => {
      const r = g.sim!.npcChoose(npcId, o.id);
      if (r.close) {
        g.ui.closeId('dialog');
        return;
      }
      lines = r.lines;
      g.ui.invalidate();
    }, o.id === 'bye' ? 'ghost' : 'secondary', `talk-${o.id}`)),
  }));
}

export function rangerScreen(g: Game) {
  infoScreen(g, 'Ranger desk', [
    h('p', null, '"Welcome to Pine Lake! A few things worth knowing:"'),
    h('ul', null,
      h('li', null, 'The campground on the east shore has power and water at every site, and a dump station by the office.'),
      h('li', null, 'Eagle Rock trail starts behind the cabins: best view of the lake.'),
      h('li', null, 'Fishing is good early and late from the end of the pier.'),
      h('li', null, 'Signal is weak up here. Remote workers do better in Mesa City.'),
      h('li', null, 'Friday evenings there is a campfire at the campground fire circle.')),
  ]);
}

export function inspectScreen(g: Game) {
  const s = g.sim!.s;
  const v = activeVehicle(s);
  const def = vdef(v);
  const c = capacities(s, v.id);
  infoScreen(g, `Your ${def.shortName}`, [
    h('p', { class: 'small' }, def.description),
    h('div', { class: 'detail' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Mechanical condition'), h('span', { class: 'stat-value' }, pct(overallCondition(s, v.id)))),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Body & paint'), h('span', { class: 'stat-value' }, `${pct(v.body)} (looks only)`)),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Fuel'), h('span', { class: 'stat-value' }, `${v.fuel.toFixed(0)} / ${c.fuel} L`)),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Fresh / gray / black'), h('span', { class: 'stat-value' }, `${v.fresh.toFixed(0)} / ${v.gray.toFixed(0)} / ${v.black.toFixed(0)} L`))),
    h('h3', null, 'Weight'),
    weightPanel(g, true),
    h('p', { class: 'small muted' }, 'Tip: Tab opens your phone. RV Status shows everything in detail.'),
  ]);
}

export function campSetupScreen(g: Game) {
  g.ui.open(modal(g.ui, 'campsetup', {
    title: 'Camp setup', size: 'narrow',
    body: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const c = capacities(s, v.id);
      const lv = canLevel(s);
      const outside = itemsInVehicle(s, v.id).filter((i) => i.where.kind === 'stored' && defOf(i).features?.outdoor);
      return h('div', { class: 'list' },
        h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, 'Parking brake'), h('div', { class: 'desc' }, v.parkingBrake ? 'Set' : 'Off')),
          btn(v.parkingBrake ? 'Set ✓' : 'Set', () => { v.parkingBrake = true; g.sim!.changed(); }, 'small ghost')),
        h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, 'Level the RV'), h('div', { class: 'desc' }, v.levelled ? 'Level on blocks' : lv.ok ? 'Uneven ground' : lv.reason)),
          btn(v.levelled ? 'Level ✓' : 'Use blocks', () => { const r = g.sim!.level(); if (!r.ok) g.ui.toast({ text: r.reason, kind: 'warn' }); }, 'small teal', 'level-go', !lv.ok)),
        c.awning ? h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, 'Awning'), h('div', { class: 'desc' }, v.awning ? 'Extended' : 'Rolled up')),
          btn(v.awning ? 'Roll up' : 'Extend', () => { g.sim!.setAwning(!v.awning); g.vv?.sync(g.sim!.s, true); }, 'small teal', 'awning-go')) : null,
        ...outside.map((it) => h('div', { class: 'item' }, h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(it)), h('div', { class: 'desc' }, 'In storage')),
          btn('Carry outside', () => { s.player.carrying = { kind: 'item', uid: it.uid }; it.where = { kind: 'carried' }; g.sim!.changed(); g.ui.closeId('campsetup'); }, 'small', `carry-${it.def}`, g.mode !== 'explore'))),
        outdoorItemsNear(s).length ? h('p', { class: 'small muted' }, `${outdoorItemsNear(s).length} item(s) set up outside. They are packed automatically before you drive.`) : null,
        h('p', { class: 'small muted' }, 'Power, water and sewer connect at the site’s pedestal.'),
      );
    },
  }));
}

export function diyScreen(g: Game) {
  g.ui.open(modal(g.ui, 'diy', {
    title: 'DIY maintenance', size: 'narrow',
    body: () => {
      const s = g.sim!.s;
      const v = activeVehicle(s);
      const parts = partsInVehicle(s, v.id);
      return h('div', { class: 'list' }, parts.length ? parts.map((p) => {
        const chk = diyCheck(s, v.id, p.uid);
        return h('div', { class: `item ${chk.ok ? '' : 'disabled'}` }, h('div', { class: 'meta' }, h('div', { class: 'name' }, itemName(p)), h('div', { class: 'desc' }, chk.ok ? defOf(p).description : chk.reason)),
          btn('Install (1.5 h)', () => {
            g.ui.closeId('diy');
            timed(g, () => {
              const r = g.sim!.diy(p.uid);
              return r.ok ? { ok: true as const, minutes: 90 } : r;
            }, 'Wrenches out, sleeves rolled up...');
            if (g.phys) g.phys.perf = null;
          }, 'small teal', `diy-${p.def}`, !chk.ok));
      }) : h('p', null, 'No parts kits on board.'));
    },
  }));
}

export function pretripScreen(g: Game, go: () => void, back: () => void) {
  const s = g.sim!.s;
  const p = pretrip(s);
  if (!p.issues.length && !p.refuse) {
    go();
    return;
  }
  g.ui.open(modal(g.ui, 'pretrip', {
    title: 'Before you drive', size: 'narrow', closable: false,
    body: () => {
      const pp = pretrip(g.sim!.s);
      return h('div', null,
        h('div', { class: 'list' }, pp.issues.map((iss) => h('div', { class: `item ${iss.fixable ? '' : 'disabled'}` }, h('div', { class: 'meta' }, h('div', { class: 'name' }, iss.label), iss.reason ? h('div', { class: 'desc' }, iss.reason) : null), iss.fixable ? h('span', { class: 'pill' }, `${iss.minutes} min`) : null))),
        pp.refuse ? h('div', { class: 'callout bad', style: 'margin-top:8px' }, `Too overloaded to drive safely (${pp.weight.messages.join('; ')}). Remove weight first: drain water at a dump station, move belongings to a locker, or sell something.`) : null,
      );
    },
    foot: () => {
      const pp = pretrip(g.sim!.s);
      const fixable = pp.issues.some((i) => i.fixable);
      // non-fixable issues (no straps, no room for outdoor gear) are warnings, never a soft-lock
      return [
        btn('Leave the seat', () => { g.ui.closeId('pretrip'); back(); }, 'ghost', 'pretrip-back'),
        fixable ? btn(`Pack up & secure (${pp.issues.filter((i) => i.fixable).reduce((a, i) => a + i.minutes, 0)} min)`, () => {
          g.sim!.packUp();
          g.vv?.sync(g.sim!.s, true);
          g.ui.invalidate();
        }, 'teal', 'pretrip-pack') : null,
        btn(pp.issues.some((i) => i.id === 'weight') ? 'Drive anyway (overloaded)' : pp.issues.length ? 'Drive anyway' : 'Drive', () => { g.ui.closeId('pretrip'); go(); }, 'secondary', 'pretrip-go', fixable || pp.refuse),
      ];
    },
  }));
}

void liters;
