import { journal, note } from './core';
import type { GameState } from './types';

// Onboarding checklist that introduces each system, then the 30-day goal.

export interface ObjectiveDef {
  id: string;
  title: string;
  hint: string;
}

export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'inspect', title: 'Inspect your RV', hint: 'Walk up to your RV and press E to look it over (or open RV Status on your phone).' },
  { id: 'groceries', title: 'Buy groceries', hint: 'Cactus Market is on Main Street. Food lives in the fridge and cabinets.' },
  { id: 'weight', title: 'Check your vehicle weight', hint: 'Phone (Tab) → RV Status → Weight. Every kilogram counts.' },
  { id: 'accept', title: 'Accept a delivery', hint: 'The Post & Freight job board is on South Street.' },
  { id: 'load', title: 'Load the cargo', hint: 'Park at the loading dock behind Post & Freight, then press E at the dock.' },
  { id: 'travel', title: 'Drive to a new place', hint: 'Get in the driver’s seat. Pick a destination in the Map app for GPS guidance.' },
  { id: 'deliver', title: 'Deliver the cargo', hint: 'Park at the delivery dock and press E to unload and get paid.' },
  { id: 'campsite', title: 'Find a campsite', hint: 'Campground offices rent sites. Free spots exist too, if you know where to look.' },
  { id: 'hookups', title: 'Connect utilities', hint: 'Park on your reserved pad, then press E at the hookup pedestal.' },
  { id: 'dump', title: 'Empty your waste tanks', hint: 'Use a dump station with your RV parked next to it.' },
  { id: 'upgrade', title: 'Earn money and buy an upgrade', hint: 'Furniture, solar, batteries, mattresses... install them in furnishing mode (F).' },
];

export function complete(s: GameState, id: string): void {
  if (s.objectives.done[id] != null) return;
  if (!OBJECTIVES.some((o) => o.id === id)) return;
  s.objectives.done[id] = s.time.minutes;
  const o = OBJECTIVES.find((x) => x.id === id)!;
  note(s, `Objective complete: ${o.title}`, 'good');
  journal(s, 'goal', `Completed: ${o.title}.`);
  if (OBJECTIVES.every((x) => s.objectives.done[x.id] != null)) {
    note(s, 'Onboarding complete! The road is yours. Goal: build a sustainable life by day 30.', 'good');
    journal(s, 'goal', 'Onboarding complete. Long-term goal: a sustainable life on the road by day 30.');
  }
}

export function currentObjective(s: GameState): ObjectiveDef | null {
  return OBJECTIVES.find((o) => s.objectives.done[o.id] == null) ?? null;
}

export function onboardingDone(s: GameState): boolean {
  return OBJECTIVES.every((o) => s.objectives.done[o.id] != null);
}
