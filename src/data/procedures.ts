// Short interactive service procedures. The first time, the next correct step
// is highlighted with an explanation; once learned, a quick option skips them.

export interface ProcStep {
  id: string;
  label: string;
  hint: string;
}

export interface ProcMistake {
  /** Step clicked too early. */
  step: string;
  /** Steps that must already be done to avoid the mistake. */
  before: string[];
  text: string;
  hygiene?: number;
  mood?: number;
  /** Damages the related tool's condition. */
  toolDamage?: string;
}

export interface ProcedureDef {
  id: string;
  title: string;
  intro: string;
  steps: ProcStep[];
  mistakes: ProcMistake[];
  /** Game minutes for the full procedure and the quick version. */
  minutes: number;
  quickMinutes: number;
}

export const PROCEDURES: Record<string, ProcedureDef> = {
  dump_tanks: {
    id: 'dump_tanks',
    title: 'Empty the waste tanks',
    intro: 'Dump stations take your gray (sink/shower) and black (toilet) water. Order matters.',
    steps: [
      { id: 'gloves', label: 'Put on disposable gloves', hint: 'Always start with gloves. Trust us.' },
      { id: 'hose_rv', label: 'Connect the sewer hose to the RV outlet', hint: 'Twist-lock the bayonet fitting onto the outlet.' },
      { id: 'hose_inlet', label: 'Put the hose end into the dump inlet', hint: 'Seat it deep in the inlet so it cannot pop out.' },
      { id: 'black', label: 'Open the black valve', hint: 'Black first, so the cleaner gray water rinses the hose afterwards.' },
      { id: 'gray', label: 'Close black, then open the gray valve', hint: 'Gray water flushes the hose clean.' },
      { id: 'stow', label: 'Close the valves, rinse and stow the hose', hint: 'Rinse with the non-potable hose, cap the outlet.' },
    ],
    mistakes: [
      { step: 'black', before: ['hose_rv', 'hose_inlet'], text: 'Splash! You opened a valve with no hose attached.', hygiene: -40, mood: -10 },
      { step: 'gray', before: ['hose_rv', 'hose_inlet'], text: 'Gray water all over your shoes. Hose first!', hygiene: -25, mood: -6 },
      { step: 'gray', before: ['black'], text: 'Gray first means the hose stays dirty after the black tank. Not ideal.', mood: -2 },
    ],
    minutes: 18,
    quickMinutes: 9,
  },
  fill_water: {
    id: 'fill_water',
    title: 'Fill the fresh water tank',
    intro: 'Use only your white drinking-water hose for fresh water.',
    steps: [
      { id: 'spigot', label: 'Wipe the spigot and let it run briefly', hint: 'Sanitize the tap before attaching your hose.' },
      { id: 'hose', label: 'Attach the drinking-water hose to the spigot', hint: 'Hand-tight is enough.' },
      { id: 'inlet', label: 'Put the hose into the fresh-water fill', hint: 'The fill port is usually behind a small door on the side.' },
      { id: 'open', label: 'Open the tap and fill to your target', hint: 'Remember: every liter weighs a kilogram.' },
      { id: 'stow', label: 'Close the tap, drain and stow the hose', hint: 'Drain it so it stays clean.' },
    ],
    mistakes: [
      { step: 'open', before: ['hose', 'inlet'], text: 'You opened the tap before connecting. Soaked!', hygiene: 5, mood: -3 },
    ],
    minutes: 8,
    quickMinutes: 4,
  },
  connect_power: {
    id: 'connect_power',
    title: 'Connect shore power',
    intro: 'Campground pedestals supply 15/30/50 amp power.',
    steps: [
      { id: 'breaker_off', label: 'Check the pedestal breaker is OFF', hint: 'Never plug in under load.' },
      { id: 'plug_pedestal', label: 'Plug the cord into the pedestal', hint: 'Match the cord to the outlet amperage (adapters if needed).' },
      { id: 'plug_rv', label: 'Plug the cord into the RV inlet', hint: 'Make sure the connector is fully seated.' },
      { id: 'breaker_on', label: 'Switch the breaker ON', hint: 'Now the RV runs on shore power and charges the battery.' },
    ],
    mistakes: [
      { step: 'breaker_on', before: ['plug_pedestal', 'plug_rv'], text: 'Sparks! Plug in with the breaker off.', mood: -4, toolDamage: 'power_cord' },
      { step: 'plug_pedestal', before: ['breaker_off'], text: 'The breaker was on. A fat spark jumped from the plug.', mood: -3, toolDamage: 'power_cord' },
    ],
    minutes: 5,
    quickMinutes: 2,
  },
  connect_water: {
    id: 'connect_water',
    title: 'Connect city water',
    intro: 'A city-water hookup feeds your faucets directly so the fresh tank is not used.',
    steps: [
      { id: 'hose', label: 'Attach the drinking-water hose to the site spigot', hint: 'Use the white potable hose.' },
      { id: 'inlet', label: 'Connect to the RV city-water inlet', hint: 'Not the tank fill: the pressurized inlet.' },
      { id: 'open', label: 'Open the spigot', hint: 'Faucets and shower now use campground water.' },
    ],
    mistakes: [{ step: 'open', before: ['hose', 'inlet'], text: 'Water everywhere! Connect before opening.', mood: -2 }],
    minutes: 4,
    quickMinutes: 2,
  },
  connect_sewer: {
    id: 'connect_sewer',
    title: 'Connect the sewer',
    intro: 'Full-hookup sites have their own sewer inlet.',
    steps: [
      { id: 'gloves', label: 'Put on gloves', hint: 'Every time.' },
      { id: 'hose_rv', label: 'Connect the sewer hose to the RV outlet', hint: 'Twist-lock it.' },
      { id: 'hose_inlet', label: 'Seal the hose into the site inlet', hint: 'Use the rubber donut seal.' },
      { id: 'gray_open', label: 'Open the gray valve (leave black closed)', hint: 'Gray drains continuously; dump black only when it is mostly full.' },
    ],
    mistakes: [
      { step: 'gray_open', before: ['hose_rv', 'hose_inlet'], text: 'Gray water on the ground. Hose first!', hygiene: -20, mood: -5 },
    ],
    minutes: 6,
    quickMinutes: 3,
  },
};
