import type { Note } from '../sim/core';
import { clear, h } from './dom';

// UI manager: screen stack (modal panels), toasts, interaction prompt,
// hold-progress, fades and the loading overlay.

export interface Screen {
  id: string;
  el: HTMLElement;
  render: () => void;
  onClose?: () => void;
  /** Pauses game time while open (default true). */
  pauses?: boolean;
  /** Blocks game controls (default true). */
  blocks?: boolean;
  /** Closing with Escape allowed (default true). */
  escClose?: boolean;
}

export class UI {
  root: HTMLElement;
  hud: HTMLElement;
  promptEl: HTMLElement;
  toastsEl: HTMLElement;
  screensEl: HTMLElement;
  fadeEl: HTMLElement;
  loadingEl: HTMLElement;
  holdEl: HTMLElement;
  stack: Screen[] = [];
  private toasts: { el: HTMLElement; until: number }[] = [];
  private dirty = false;
  muteToasts = false;

  constructor() {
    this.root = document.getElementById('ui')!;
    this.hud = h('div', { id: 'hud' });
    this.promptEl = h('div', { id: 'prompt', class: 'hidden', testid: 'prompt' });
    this.holdEl = h('div', { id: 'hold', class: 'hidden' }, h('div', { class: 'hold-fill' }));
    this.toastsEl = h('div', { id: 'toasts', testid: 'toasts' });
    this.screensEl = h('div', { id: 'screens' });
    this.fadeEl = h('div', { id: 'fade' });
    this.loadingEl = h('div', { id: 'loading', class: 'hidden' });
    this.root.append(this.hud, this.promptEl, this.holdEl, this.toastsEl, this.screensEl, this.fadeEl, this.loadingEl);
  }

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  get blocking(): boolean {
    return this.stack.some((s) => s.blocks !== false);
  }

  get pausing(): boolean {
    return this.stack.some((s) => s.pauses !== false);
  }

  isOpen(id: string): boolean {
    return this.stack.some((s) => s.id === id);
  }

  open(s: Screen) {
    const existing = this.stack.findIndex((x) => x.id === s.id);
    if (existing >= 0) this.closeId(s.id);
    this.stack.push(s);
    s.el.classList.add('screen');
    s.el.setAttribute('data-screen', s.id);
    this.screensEl.appendChild(s.el);
    s.render();
    document.exitPointerLock?.();
  }

  close() {
    const s = this.stack.pop();
    if (!s) return;
    s.el.remove();
    s.onClose?.();
  }

  closeId(id: string) {
    const i = this.stack.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [s] = this.stack.splice(i, 1);
    s.el.remove();
    s.onClose?.();
  }

  closeAll() {
    while (this.stack.length) this.close();
  }

  /** Mark screens for re-render on the next frame (sim changed). */
  invalidate() {
    this.dirty = true;
  }

  frame() {
    if (this.dirty) {
      this.dirty = false;
      for (const s of this.stack) {
        const scroll = s.el.querySelector('.scroll') as HTMLElement | null;
        const st = scroll?.scrollTop ?? 0;
        s.render();
        const scroll2 = s.el.querySelector('.scroll') as HTMLElement | null;
        if (scroll2) scroll2.scrollTop = st;
      }
    }
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => {
      if (t.until < now) {
        t.el.classList.add('out');
        setTimeout(() => t.el.remove(), 400);
        return false;
      }
      return true;
    });
  }

  toast(n: Pick<Note, 'text' | 'kind'>, ms = 4800) {
    if (this.muteToasts) return;
    const el = h('div', { class: `toast toast-${n.kind}` }, n.text);
    this.toastsEl.appendChild(el);
    this.toasts.push({ el, until: performance.now() + ms + n.text.length * 25 });
    while (this.toasts.length > 4) {
      const t = this.toasts.shift()!;
      t.el.remove();
    }
  }

  setPrompt(key: string | null, label = '', sub = '') {
    if (!key) {
      this.promptEl.classList.add('hidden');
      return;
    }
    clear(this.promptEl);
    this.promptEl.classList.remove('hidden');
    this.promptEl.append(h('span', { class: 'key' }, key), h('span', { class: 'prompt-label' }, label), sub ? h('span', { class: 'prompt-sub' }, sub) : '');
  }

  setHold(frac: number | null) {
    if (frac == null) {
      this.holdEl.classList.add('hidden');
      return;
    }
    this.holdEl.classList.remove('hidden');
    (this.holdEl.firstChild as HTMLElement).style.width = `${Math.min(100, frac * 100)}%`;
  }

  async fade(mid: () => void | Promise<void>, ms = 450, card?: HTMLElement) {
    this.fadeEl.classList.add('on');
    if (card) {
      clear(this.fadeEl);
      this.fadeEl.appendChild(card);
    }
    await new Promise((r) => setTimeout(r, ms));
    await mid();
    await new Promise((r) => setTimeout(r, 120));
    this.fadeEl.classList.remove('on');
    setTimeout(() => clear(this.fadeEl), ms);
  }

  loading(label: string | null, f = 0) {
    if (label == null) {
      this.loadingEl.classList.add('hidden');
      return;
    }
    this.loadingEl.classList.remove('hidden');
    clear(this.loadingEl);
    this.loadingEl.append(
      h('div', { class: 'loading-card' },
        h('div', { class: 'logo' }, 'Rolling Home'),
        h('div', { class: 'loading-label' }, label),
        h('div', { class: 'bar loading-bar' }, h('div', { class: 'bar-fill', style: `width:${Math.round(f * 100)}%` })),
      ),
    );
  }
}
