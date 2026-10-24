import type { DifficultyId } from '../data/difficulty';
import type { ComponentId, SlotKind, VehicleId } from '../data/types';

// The whole game is one plain JSON-serializable object.

export type Where =
  | { kind: 'stored'; vehicle: string; comp: string }
  | { kind: 'floor'; vehicle: string; x: number; z: number; rot: number }
  | { kind: 'slot'; vehicle: string; slot: SlotKind }
  | { kind: 'mattress'; vehicle: string; bed: string }
  | { kind: 'locker' }
  | { kind: 'outdoor'; x: number; z: number; rot: number }
  | { kind: 'carried' };

export interface CrateSpec {
  name: string;
  dims: [number, number, number];
  mass: number;
  fragile?: boolean;
  refrigerated?: boolean;
}

export interface CargoInfo extends CrateSpec {
  jobId: string;
  /** Accumulated damage 0..1 from rough handling while unsecured. */
  damage: number;
}

export interface ItemInstance {
  uid: string;
  def: string;
  condition: number;
  where: Where;
  servings?: number;
  /** Remaining unrefrigerated shelf life (game minutes) for perishables. */
  shelf?: number;
  spoiled?: boolean;
  /** Strapped down while in a loose compartment. */
  secured?: boolean;
  /** Canister uses / jug liters left. */
  uses?: number;
  cargo?: CargoInfo;
  /** Switchable equipment (fan, lights). */
  on?: boolean;
}

export interface VehicleState {
  id: string;
  def: VehicleId;
  pose: { x: number; z: number; heading: number };
  fuel: number;
  fresh: number;
  gray: number;
  black: number;
  propane: number;
  batteryWh: number;
  condition: Record<Exclude<ComponentId, 'appliances'>, number>;
  body: number;
  dirt: number;
  odometerKm: number;
  hookups: { power: boolean; water: boolean; sewer: boolean };
  awning: boolean;
  levelled: boolean;
  engineOn: boolean;
  generatorOn: boolean;
  parkingBrake: boolean;
}

export type Activity = 'idle' | 'walk' | 'run' | 'drive' | 'work' | 'labor' | 'sleep' | 'relax';

export interface MoodMod {
  id: string;
  label: string;
  amount: number;
  untilMin: number;
}

export interface Look {
  skin: string;
  hair: string;
  hairStyle: number;
  shirt: string;
  pants: string;
}

export type PlayerMode = 'explore' | 'interior' | 'drive';

export interface PlayerState {
  name: string;
  look: Look;
  mode: PlayerMode;
  pos: { x: number; z: number; yaw: number };
  inside: { x: number; z: number; yaw: number };
  needs: { hunger: number; energy: number; hygiene: number; mood: number };
  moodMods: MoodMod[];
  /** An odd-job object being carried (pickup index) or an item uid. */
  carrying: { kind: 'job'; jobId: string } | { kind: 'item'; uid: string } | null;
}

export interface DeliveryOffer {
  id: string;
  kind: 'delivery';
  board: string;
  title: string;
  client: string;
  description: string;
  pickup: string;
  dropoff: string;
  crates: CrateSpec[];
  distanceKm: number;
  pay: number;
  deadlineMin: number;
  postedDay: number;
  special?: string;
}

export interface OddOffer {
  id: string;
  kind: 'odd';
  board: string;
  title: string;
  description: string;
  odd: string;
  pay: number;
  postedDay: number;
  npc?: string;
  /** Visit points override (NPC jobs at the NPC's location). */
  points?: [number, number][];
}

export type JobOffer = DeliveryOffer | OddOffer;

export interface ActiveJob {
  offer: JobOffer;
  acceptedMin: number;
  status: 'accepted' | 'loaded';
  /** Odd jobs: completed steps. */
  progress: number;
}

export interface JobHistory {
  title: string;
  pay: number;
  day: number;
  result: 'paid' | 'late' | 'failed';
}

export interface JobsState {
  boards: Record<string, { day: number; offers: JobOffer[] }>;
  active: ActiveJob[];
  completed: number;
  failed: number;
  history: JobHistory[];
  remoteHoursToday: number;
  remoteDay: number;
  /** Hank's special load, once per week. */
  hankWeek: number;
}

export type TxCategory =
  | 'job' | 'groceries' | 'equipment' | 'fuel' | 'campsite' | 'repairs' | 'services' | 'recurring'
  | 'vehicle' | 'sale' | 'food' | 'fees' | 'other';

export interface Transaction {
  t: number;
  amount: number;
  category: TxCategory;
  label: string;
}

export interface Reservation {
  camp: string;
  site: string;
  /** Game minute when the paid stay ends (check-out). */
  checkoutMin: number;
  nights: number;
}

export interface DayStats {
  day: number;
  earned: number;
  spent: number;
  km: number;
  discoveries: string[];
}

export interface JournalEntry {
  t: number;
  kind: 'event' | 'discovery' | 'job' | 'tip' | 'goal';
  text: string;
}

export interface NpcState {
  met: boolean;
  tips: number;
  soldItem: boolean;
  jobWeek: number;
}

export interface GameState {
  version: number;
  seed: number;
  difficulty: DifficultyId;
  time: { minutes: number };
  uidCounter: number;
  player: PlayerState;
  vehicles: VehicleState[];
  vehicleId: string;
  items: Record<string, ItemInstance>;
  cash: number;
  tx: Transaction[];
  jobs: JobsState;
  reservation: Reservation | null;
  /** Consecutive nights at free/limited places, keyed by campground id. */
  freeNights: Record<string, number>;
  lastNightPlace: string | null;
  procedures: Record<string, number>;
  discovered: Record<string, number>;
  revealed: Record<string, boolean>;
  explored: Record<string, boolean>;
  npcs: Record<string, NpcState>;
  objectives: { done: Record<string, number>; goalResult: 'pending' | 'met' | 'missed'; };
  stats: { kmTotal: number; today: DayStats; history: DayStats[]; nights: number };
  journal: JournalEntry[];
  locker: { paidUntilMin: number } | null;
  /** Used-shop stock purchased: shopId:item → count bought. */
  usedSold: Record<string, number>;
  eventsVisited: Record<string, number>;
  flags: Record<string, number | boolean | string>;
}
