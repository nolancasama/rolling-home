// Balance constants. Every tunable number for the simulation lives here.

export const DENSITY = { gasoline: 0.745, diesel: 0.835, water: 1.0 } as const;

export const PERSON_MASS = 75;

export const TIME = {
  /** Day 1 starts at 08:00 (game minutes since day 1, 00:00). */
  startMinutes: 8 * 60,
  /** Game seconds per real second on foot / inside. 1 real minute = 6 game minutes. */
  walkScale: 6,
  /** Integration step (game minutes) for long time skips. */
  stepMinutes: 5,
  checkoutHour: 11,
  wakeHour: 7,
};

export const NEEDS = {
  /** Points lost per game hour (Balanced). */
  hungerPerHour: 4.0,
  energyPerHour: 3.4,
  hygienePerHour: 1.9,
  /** Extra drain per hour by activity. */
  activity: {
    idle: { energy: 0, hygiene: 0, hunger: 0 },
    walk: { energy: 0.6, hygiene: 0.2, hunger: 0.3 },
    run: { energy: 2.2, hygiene: 1.2, hunger: 0.8 },
    drive: { energy: 1.1, hygiene: 0, hunger: 0 },
    work: { energy: 1.4, hygiene: 0, hunger: 0.2 },
    labor: { energy: 4.5, hygiene: 3.5, hunger: 1.5 },
    sleep: { energy: 0, hygiene: 0, hunger: -1.6 },
    relax: { energy: -0.6, hygiene: 0, hunger: 0 },
  },
  /** Energy restored per hour of sleep at quality 1.0. */
  sleepPerHour: 12.5,
  /** Mood moves toward its target at this many points per hour. */
  moodRate: 4,
  low: 30,
  critical: 15,
};

export const WATER = {
  cook: { fresh: 3, gray: 2.5 },
  dishes: { fresh: 4, gray: 4 },
  wash: { fresh: 1.5, gray: 1.5 },
  drink: { fresh: 0.5 },
  toilet: { fresh: 0.8, black: 1.4 },
  /** Shower liters come from the fixture. */
};

export const POWER = {
  parasiticW: 4,
  lightsW: 14,
  pumpWhPerL: 0.35,
  laptopW: 55,
  chargerW: 380,
  alternatorW: 280,
  solarEfficiency: 0.78,
  inductionW: 1800,
  electricShowerWh: 300,
};

export const PROPANE = {
  perMealKg: 0.1,
  perShowerKg: 0.06,
};

export const FUEL = {
  /** Fuel use grows with load above the reference mass (curb + driver). */
  loadFactor: 0.55,
  /** Extra consumption per m/s above 22 m/s (aero). */
  speedFactor: 0.03,
  /** Max extra consumption from engine wear. */
  wearFactor: 0.35,
};

export const WEAR = {
  /** Condition lost per fictional km at normal load (fraction 0..1). */
  enginePerKm: 0.00011,
  steeringPerKm: 0.00009,
  brakesPerKm: 0.00004,
  /** Brake wear per (m/s)² of hard braking energy, scaled. */
  brakesPerBrake: 0.0000025,
  appliancesPerDay: 0.0035,
  /** Rough surfaces multiply steering wear. */
  roughSurfaceMul: 2.5,
  /** Collision body damage per m/s of impact above 2 m/s. */
  bodyPerImpact: 0.012,
  limpModeBelow: 0.15,
};

export const OVERLOAD = {
  /** Driving is refused beyond this fraction over any rating. */
  refuseFraction: 0.15,
};

export const ECONOMY = {
  phoneWeekly: 12,
  lockerWeekly: 15,
  sellFraction: 0.4,
  /** Starting fresh water fraction and fuel fraction. */
  startFresh: 1,
  startFuel: 0.7,
  dinerHunger: 55,
  showerPayHygiene: 100,
  canoeMood: 14,
  failPenalty: 25,
  latePenaltyPerHour: 0.04,
};

export const JOBS = {
  maxActive: 3,
  graceHours: 12,
  baseDelivery: 40,
  perKm: 1.55,
  perKg: 0.32,
  fragileBonus: 0.25,
  coldBonus: 0.2,
  remoteMaxHoursPerDay: 6,
};

export const CAMP = {
  /** Sleep quality multipliers by situation. */
  noisySleep: 0.72,
  unlevelSleep: 0.85,
  streetSleep: 0.7,
  overstayFine: 50,
};

export const SIGNAL_BY_ROAD: Record<string, number> = { highway: 2, mountain: 1, street: 3, dirt: 1, track: 0 };
