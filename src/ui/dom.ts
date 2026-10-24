// Tiny DOM builder. Text is always set via textContent (never innerHTML).

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Attrs {
  class?: string;
  style?: string;
  title?: string;
  id?: string;
  testid?: string;
  disabled?: boolean;
  type?: string;
  value?: string | number;
  min?: number;
  max?: number;
  step?: number;
  checked?: boolean;
  placeholder?: string;
  maxlength?: number;
  onClick?: (e: MouseEvent) => void;
  onInput?: (e: Event) => void;
  onChange?: (e: Event) => void;
  onKeydown?: (e: KeyboardEvent) => void;
  [k: `data-${string}`]: string;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'testid') el.setAttribute('data-testid', String(v));
      else if (k === 'onClick') el.addEventListener('click', v as (e: Event) => void);
      else if (k === 'onInput') el.addEventListener('input', v as (e: Event) => void);
      else if (k === 'onChange') el.addEventListener('change', v as (e: Event) => void);
      else if (k === 'onKeydown') el.addEventListener('keydown', v as (e: Event) => void);
      else if (k === 'disabled') (el as HTMLButtonElement).disabled = !!v;
      else if (k === 'checked') (el as HTMLInputElement).checked = !!v;
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function btn(label: Child, onClick: () => void, cls = '', testid?: string, disabled = false, title?: string): HTMLButtonElement {
  return h('button', { class: `btn ${cls}`, onClick: () => !disabled && onClick(), testid, disabled, title }, label);
}

export function bar(frac: number, cls = '', label?: string): HTMLElement {
  const f = Math.max(0, Math.min(1, frac));
  return h('div', { class: `bar ${cls}`, title: label },
    h('div', { class: 'bar-fill', style: `width:${(f * 100).toFixed(1)}%` }),
    label ? h('span', { class: 'bar-label' }, label) : null,
  );
}

export function tabs(names: { id: string; label: string }[], active: string, onPick: (id: string) => void, testPrefix = 'tab'): HTMLElement {
  return h('div', { class: 'tabs' }, names.map((n) => h('button', {
    class: `tab ${n.id === active ? 'active' : ''}`, onClick: () => onPick(n.id), testid: `${testPrefix}-${n.id}`,
  }, n.label)));
}

export function stat(label: string, value: Child, cls = ''): HTMLElement {
  return h('div', { class: `stat ${cls}` }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value));
}

export function icon(name: string): HTMLElement {
  return h('span', { class: `ico ico-${name}`, 'data-ico': name }, ICONS[name] ?? '•');
}

export const ICONS: Record<string, string> = {
  hunger: '🍲', energy: '⚡', hygiene: '🚿', mood: '🙂', fuel: '⛽', water: '💧', gray: '🫗', black: '🚽', battery: '🔋',
  propane: '🔥', money: '$', map: '🗺', jobs: '📦', finance: '💳', rv: '🚐', inventory: '🧺', journal: '📓', settings: '⚙',
  warn: '⚠', clock: '🕗', signal: '📶', home: '🏠', star: '★', wrench: '🔧', weight: '⚖', sun: '☀', plug: '🔌',
};
