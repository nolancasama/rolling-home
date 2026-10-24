import { itemDef } from '../data/items';
import type { GameState, ItemInstance, JournalEntry, TxCategory, Where } from './types';
import { DIFFICULTIES } from '../data/difficulty';

// Shared primitives for all sim modules: results, notifications, item
// creation, money and the journal.

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string };

export function ok<T extends object>(extra?: T): { ok: true } & T {
  return { ok: true, ...(extra ?? ({} as T)) };
}

export function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

// ── notifications ──

export type NoteKind = 'info' | 'good' | 'warn' | 'bad' | 'money' | 'discovery';
export interface Note {
  text: string;
  kind: NoteKind;
  t: number;
}

const sinks: ((n: Note) => void)[] = [];

export function onNote(f: (n: Note) => void): () => void {
  sinks.push(f);
  return () => {
    const i = sinks.indexOf(f);
    if (i >= 0) sinks.splice(i, 1);
  };
}

export function note(s: GameState, text: string, kind: NoteKind = 'info'): void {
  const n = { text, kind, t: s.time.minutes };
  for (const f of sinks) f(n);
}

export function journal(s: GameState, kind: JournalEntry['kind'], text: string): void {
  s.journal.push({ t: s.time.minutes, kind, text });
  if (s.journal.length > 250) s.journal.splice(0, s.journal.length - 250);
}

// ── time helpers ──

export function dayOf(min: number): number {
  return Math.floor(min / 1440) + 1;
}

export function hourOf(min: number): number {
  return (min % 1440) / 60;
}

/** 0 = Monday. Day 1 is a Monday. */
export function weekdayOf(min: number): number {
  return (dayOf(min) - 1) % 7;
}

export function fmtClock(min: number): string {
  const h = Math.floor(hourOf(min));
  const m = Math.floor(min % 60);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ap}`;
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// ── items ──

export function newItem(s: GameState, defId: string, where: Where, opts: Partial<ItemInstance> = {}): ItemInstance {
  const uid = `i${++s.uidCounter}`;
  const inst: ItemInstance = { uid, def: defId, condition: 1, where, ...opts };
  if (defId !== 'cargo') {
    const d = itemDef(defId);
    if (d.food && inst.servings == null) inst.servings = d.food.servings;
    if (d.food?.perishable && inst.shelf == null) inst.shelf = (d.food.shelfHours ?? 48) * 60;
    if (d.features?.butane && inst.uses == null) inst.uses = d.features.butane.uses;
    if (d.features?.waterJug && inst.uses == null) inst.uses = d.features.waterJug.liters;
  }
  s.items[uid] = inst;
  return inst;
}

export function deleteItem(s: GameState, uid: string): void {
  delete s.items[uid];
}

// ── money ──

export function difficulty(s: GameState) {
  return DIFFICULTIES[s.difficulty];
}

export function price(s: GameState, base: number): number {
  return Math.round(base * difficulty(s).priceMul * 100) / 100;
}

export function money(n: number): string {
  const neg = n < 0;
  const v = Math.abs(n);
  const str = v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2).replace(/\.00$/, '');
  return `${neg ? '-' : ''}$${str}`;
}

export function canAfford(s: GameState, amount: number): boolean {
  return amount <= 0 || s.cash >= amount - 1e-6;
}

function logTx(s: GameState, amount: number, category: TxCategory, label: string) {
  s.tx.push({ t: s.time.minutes, amount, category, label });
  if (s.tx.length > 600) s.tx.splice(0, s.tx.length - 600);
  if (amount > 0) s.stats.today.earned += amount;
  else s.stats.today.spent += -amount;
}

/** Charge a cost the player chose; refuses when funds are insufficient. */
export function charge(s: GameState, amount: number, category: TxCategory, label: string): Result {
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return ok();
  if (!canAfford(s, amount)) return fail(`Not enough cash: ${money(amount)} needed, you have ${money(s.cash)}.`);
  s.cash = Math.round((s.cash - amount) * 100) / 100;
  logTx(s, -amount, category, label);
  return ok();
}

/** Mandatory costs (fees, recurring bills) — may push cash negative. */
export function bill(s: GameState, amount: number, category: TxCategory, label: string): void {
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return;
  s.cash = Math.round((s.cash - amount) * 100) / 100;
  logTx(s, -amount, category, label);
}

export function earn(s: GameState, amount: number, category: TxCategory, label: string): void {
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return;
  s.cash = Math.round((s.cash + amount) * 100) / 100;
  logTx(s, amount, category, label);
}
