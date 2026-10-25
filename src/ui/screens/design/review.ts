import { fmtDuration, money } from '../../../sim/core';
import * as reno from '../../../sim/renovation';
import type { Game } from '../../../game/game';
import { btn, h, type Child } from '../../dom';
import { kg, modal } from '../common';

// Review and confirm a Design Mode session: every line priced, removed pieces
// kept / sold / discarded, DIY versus professional work, then one atomic commit.

const GROUPS: { kinds: reno.RenovationLine['kind'][]; title: string }[] = [
  { kinds: ['item'], title: 'Purchases' },
  { kinds: ['surface'], title: 'Floors, walls and ceilings' },
  { kinds: ['covering'], title: 'Window coverings' },
  { kinds: ['refinish'], title: 'Refinishing and options' },
  { kinds: ['install', 'remove'], title: 'Installation work' },
  { kinds: ['delivery', 'labor'], title: 'Delivery and labor' },
  { kinds: ['sale'], title: 'Sold secondhand' },
];

export function designReview(g: Game) {
  const dm = g.design;
  const screen = modal(g.ui, 'design-review', {
    title: 'Review your renovation', size: 'mid', testid: 'design-review',
    sub: () => {
      const ctx = dm.context();
      return ctx.atShop ? 'Parked at an RV shop: no delivery fee, professional installers on hand.'
        : ctx.atService ? 'Parked at a service: professional installation is available.'
          : 'Ordered here, goods are delivered for a fee. Professional installation needs a mechanic or RV shop.';
    },
    body: () => body(g),
    foot: () => foot(g),
  });
  g.ui.open(screen);
}

function body(g: Game): Child {
  const dm = g.design;
  const sum = dm.summary();
  const ctx = dm.context();
  const out: Child[] = [];
  const line = (label: string, amount: number, minutes = 0) => h('div', { class: 'design-line' },
    h('span', null, label), h('span', { class: 'small muted' }, minutes >= 1 ? fmtDuration(minutes) : ''), h('b', null, amount ? money(amount) : '—'));
  for (const group of GROUPS) {
    const lines = sum.lines.filter((l) => group.kinds.includes(l.kind));
    if (!lines.length) continue;
    out.push(h('h3', null, group.title), lines.map((l) => line(l.label, l.amount, l.minutes)));
  }
  if (sum.removed.length) {
    out.push(h('h3', null, 'What happens to the pieces you took out'));
    for (const r of sum.removed) {
      const pick = (disp: reno.Removal) => {
        if (disp === r.disposition) return;
        dm.apply(reno.setRemoval(dm.draft!, r.uid, disp));
      };
      out.push(h('div', { class: 'design-line' }, h('span', null, r.name),
        h('div', { class: 'row' },
          btn('Keep in storage', () => pick('store'), `small ${r.disposition === 'store' ? 'teal' : 'ghost'}`, `d-disp-store-${r.uid}`),
          btn(`Sell (${money(r.value)})`, () => pick('sell'), `small ${r.disposition === 'sell' ? 'teal' : 'ghost'}`, `d-disp-sell-${r.uid}`),
          btn('Discard', () => pick('discard'), `small ${r.disposition === 'discard' ? 'teal' : 'ghost'}`, `d-disp-discard-${r.uid}`),
        )));
    }
  }
  if (sum.diyMinutes > 0) {
    out.push(h('h3', null, 'Who does the work'));
    out.push(h('div', { class: 'design-choice' },
      h('button', { class: `design-option-card ${!dm.pro ? 'active' : ''}`, testid: 'd-diy', onClick: () => { dm.pro = false; g.ui.invalidate(); } },
        h('b', null, 'Do it yourself'), h('div', { class: 'small' }, `${fmtDuration(sum.diyMinutes)} of your time, no labor cost`)),
      h('button', { class: `design-option-card ${dm.pro ? 'active' : ''}`, testid: 'd-pro', disabled: !ctx.atService, onClick: () => { if (ctx.atService) { dm.pro = true; g.ui.invalidate(); } } },
        h('b', null, 'Professional installers'),
        h('div', { class: 'small' }, ctx.atService ? `${money(sum.proCost)} labor, about ${fmtDuration(sum.proMinutes)}` : 'Only at a mechanic or RV shop')),
    ));
  }
  const cash = g.sim!.s.cash, creative = g.sim!.s.gameType === 'creative';
  out.push(h('h3', null, 'Total'));
  out.push(h('div', { class: 'design-totals' },
    h('div', { class: 'design-line' }, h('span', null, 'Goods and materials'), h('b', null, money(sum.goods))),
    sum.delivery ? h('div', { class: 'design-line' }, h('span', null, 'Delivery'), h('b', null, money(sum.delivery))) : null,
    sum.labor ? h('div', { class: 'design-line' }, h('span', null, 'Labor'), h('b', null, money(sum.labor))) : null,
    sum.sales ? h('div', { class: 'design-line' }, h('span', null, 'Sales credit'), h('b', null, `−${money(sum.sales)}`)) : null,
    h('div', { class: 'design-line total', testid: 'd-total' }, h('span', null, creative ? 'Creative mode: free' : 'You pay'), h('b', null, money(sum.total))),
    creative ? null : h('div', { class: 'design-line small' }, h('span', null, 'Cash after'), h('b', { class: cash - sum.total < 0 ? 'bad' : '' }, money(cash - sum.total))),
    sum.minutes >= 1 ? h('div', { class: 'design-line small' }, h('span', null, 'Time'), h('b', null, fmtDuration(sum.minutes))) : null,
    h('div', { class: 'design-line small' }, h('span', null, 'Weight after'), h('b', null, `${kg(sum.weightAfter.total)} · payload left ${kg(sum.weightAfter.payloadLeft)}`)),
  ));
  const blocks = sum.issues.filter((i) => i.severity === 'block');
  if (blocks.length) out.push(h('div', { class: 'callout bad small', testid: 'd-review-blocked' }, h('b', null, 'Fix these before confirming: '), blocks.slice(0, 4).map((b) => b.text).join(' · ')));
  else if (!sum.canCommit && sum.reason) out.push(h('div', { class: 'callout bad small' }, sum.reason));
  const warns = sum.issues.filter((i) => i.severity === 'warn');
  if (warns.length) out.push(h('div', { class: 'callout small' }, h('b', null, 'Heads up: '), warns.slice(0, 4).map((w) => w.text).join(' · ')));
  return out;
}

function foot(g: Game): Child {
  const dm = g.design;
  const sum = dm.summary();
  return [
    btn('Discard all', () => g.screens.confirm('Discard all changes?', 'Nothing will be bought or changed.', () => dm.discard(), 'Discard'), 'ghost', 'd-review-discard'),
    btn('Keep editing', () => g.ui.closeId('design-review'), 'ghost', 'd-review-back'),
    btn(sum.total > 0 ? `Confirm & pay ${money(sum.total)}` : 'Confirm', () => dm.confirm(), 'teal', 'd-confirm', !sum.canCommit, sum.reason),
  ];
}
