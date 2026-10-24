export type DifficultyId = 'relaxed' | 'balanced' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  blurb: string;
  startCash: number;
  /** Multiplies shop, fuel, campsite and repair prices. */
  priceMul: number;
  /** Multiplies job income. */
  payMul: number;
  /** Multiplies how fast hunger/energy/hygiene drop. */
  needsMul: number;
  /** Multiplies mechanical wear. */
  wearMul: number;
  /** Multiplies weekly insurance/registration/phone costs. */
  recurringMul: number;
  /** Multiplies electrical/water consumption of fixtures. */
  resourceMul: number;
  /** Cash needed on day 30 for the "sustainable lifestyle" goal. */
  goalCash: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  relaxed: {
    id: 'relaxed',
    name: 'Relaxed Road Trip',
    blurb: 'Low financial pressure and forgiving resource use. Take your time and enjoy the views.',
    startCash: 2200,
    priceMul: 0.9,
    payMul: 1.2,
    needsMul: 0.75,
    wearMul: 0.6,
    recurringMul: 0.6,
    resourceMul: 0.8,
    goalCash: 1500,
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Life',
    blurb: 'The intended experience: money matters, but there is room to breathe.',
    startCash: 950,
    priceMul: 1,
    payMul: 1,
    needsMul: 1,
    wearMul: 1,
    recurringMul: 1,
    resourceMul: 1,
    goalCash: 1500,
  },
  hard: {
    id: 'hard',
    name: 'Hard Road',
    blurb: 'Tight finances and demanding maintenance. Every dollar and kilogram counts.',
    startCash: 420,
    priceMul: 1.12,
    payMul: 0.9,
    needsMul: 1.15,
    wearMul: 1.5,
    recurringMul: 1.25,
    resourceMul: 1.15,
    goalCash: 1500,
  },
};
