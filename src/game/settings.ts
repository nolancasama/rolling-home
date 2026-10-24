// Player settings (per browser) and save slots in localStorage. All storage
// access is wrapped: private windows or blocked storage must not break play.

export type QualityLevel = 'low' | 'medium' | 'high';

export interface Settings {
  quality: QualityLevel;
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  units: 'imperial' | 'metric';
  parkingGuides: boolean;
  steeringAssist: boolean;
  autoLights: boolean;
  driveCam: 'chase' | 'cockpit';
  needsHud: 'auto' | 'always';
  minimap: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium', master: 0.8, music: 0.45, sfx: 0.8, sensitivity: 1, invertY: false, fov: 68, units: 'imperial',
  parkingGuides: true, steeringAssist: false, autoLights: true, driveCam: 'chase', needsHud: 'auto', minimap: true,
};

const SETTINGS_KEY = 'rollinghome:settings';
const SAVE_PREFIX = 'rollinghome:save:';
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOTS)[number];

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function writeSlot(slot: SlotId, json: string): boolean {
  try {
    localStorage.setItem(SAVE_PREFIX + slot, json);
    return true;
  } catch {
    return false;
  }
}

export function readSlot(slot: SlotId): string | null {
  try {
    return localStorage.getItem(SAVE_PREFIX + slot);
  } catch {
    return null;
  }
}

export function deleteSlot(slot: SlotId) {
  try {
    localStorage.removeItem(SAVE_PREFIX + slot);
  } catch {
    /* ignore */
  }
}

export interface SlotInfo {
  slot: SlotId;
  savedAt: string;
  summary: { day: number; clock: string; cash: number; place: string; vehicle: string; name: string } | null;
}

export function slotInfo(slot: SlotId): SlotInfo | null {
  const raw = readSlot(slot);
  if (!raw) return null;
  try {
    const f = JSON.parse(raw);
    return { slot, savedAt: f.savedAt, summary: f.summary ?? null };
  } catch {
    return { slot, savedAt: '', summary: null };
  }
}

export function latestSlot(): SlotId | null {
  let best: SlotInfo | null = null;
  for (const s of SLOTS) {
    const i = slotInfo(s);
    if (i && (!best || i.savedAt > best.savedAt)) best = i;
  }
  return best?.slot ?? null;
}

export function qualityParams(q: QualityLevel) {
  if (q === 'low') return { shadows: 0, vegetation: 0.55, traffic: 6, fogFar: 950, pixelRatio: 0.85, antialias: false };
  if (q === 'high') return { shadows: 2048, vegetation: 1.15, traffic: 14, fogFar: 1700, pixelRatio: 1.5, antialias: true };
  return { shadows: 1024, vegetation: 0.85, traffic: 10, fogFar: 1300, pixelRatio: 1.15, antialias: true };
}
