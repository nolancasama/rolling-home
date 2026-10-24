import { clear, h, type Child } from '../dom';
import type { Screen, UI } from '../ui';
import type { ItemDef } from '../../data/types';
import { thumb } from '../thumbs';

export interface ModalOpts {
  title: string;
  sub?: () => Child;
  size?: '' | 'narrow' | 'mid';
  body: () => Child;
  foot?: () => Child;
  onClose?: () => void;
  pauses?: boolean;
  blocks?: boolean;
  closable?: boolean;
  testid?: string;
}

/** A standard modal card screen that re-renders its body on demand. */
export function modal(ui: UI, id: string, o: ModalOpts): Screen {
  const el = h('div', { testid: o.testid ?? `screen-${id}` });
  const screen: Screen = {
    id, el, pauses: o.pauses ?? true, blocks: o.blocks ?? true, escClose: o.closable !== false,
    onClose: o.onClose,
    render: () => {
      clear(el);
      const head = h('div', { class: 'card-head' },
        h('div', { style: 'flex:1' }, h('h2', null, o.title), o.sub ? h('div', { class: 'sub' }, o.sub()) : null),
        o.closable === false ? null : h('button', { class: 'close-x', onClick: () => ui.closeId(id), testid: `close-${id}`, title: 'Close (Esc)' }, '✕'),
      );
      const body = h('div', { class: 'card-body scroll' }, o.body());
      const foot = o.foot ? h('div', { class: 'card-foot' }, o.foot()) : null;
      el.append(h('div', { class: `card ${o.size ?? ''}` }, head, body, foot));
    },
  };
  return screen;
}

export function thumbEl(def: ItemDef, big = false): HTMLElement {
  const url = thumb(def);
  const cls = big ? 'big-thumb' : 'thumb';
  return h('div', { class: cls }, url ? h('img', { src: url, alt: '' } as never) : '📦');
}

export function kv(pairs: [string, Child][]): HTMLElement {
  return h('div', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('span', { class: 'k' }, k), h('span', { class: 'v' }, v)]));
}

export function kg(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} kg`;
}

export function liters(n: number): string {
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} L`;
}

export function dims(d: [number, number, number]): string {
  return `${d[0].toFixed(2)} × ${d[1].toFixed(2)} × ${d[2].toFixed(2)} m`;
}

export function pct(f: number): string {
  return `${Math.round(f * 100)}%`;
}
