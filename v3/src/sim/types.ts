// Core, fully serialisable game state types. Everything in GameState must be
// plain JSON data (no classes, no functions) so saves are trivial and the
// simulation stays deterministic.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type ResourceKey = "credits" | "metals" | "energy" | "exotics";
export const RESOURCE_KEYS: readonly ResourceKey[] = ["credits", "metals", "energy", "exotics"];

export type Resources = Record<ResourceKey, number>;

/** Per-day flows. `research` is not stockpiled; it flows into the active project. */
export type Yields = Partial<Resources> & { research?: number };

export type BodyKind = "star" | "planet" | "moon" | "belt" | "comet";

export interface Orbit {
  /** Semi-major axis in AU (moons: in planet-radii scaled units, see orbits.ts). */
  a: number;
  e: number;
  /** Orbital period in game days. */
  period: number;
  /** Mean anomaly at t = 0 (radians). */
  phase: number;
  inclination: number;
  node: number;
  argPeri: number;
}

export interface Ring {
  inner: number; // in planet radii
  outer: number;
  tilt: number;
  color: string;
  opacity: number;
}

export interface Richness {
  metals: number;
  energy: number;
  research: number;
  exotics: number;
}

export interface Body {
  id: string;
  systemId: string;
  name: string;
  kind: BodyKind;
  /** StarTypeId / PlanetTypeId / BeltTypeId / "comet". */
  type: string;
  parentId: string | null;
  orbit: Orbit | null;
  /** Visual radius: stars in solar radii, planets & moons in Earth radii, belts: half width in AU. */
  radius: number;
  /** Colony size class (1-5); 0 for uncolonisable bodies. */
  size: number;
  richness: Richness;
  features: BodyFeature[];
  seed: number;
  axialTilt: number;
  /** Days per revolution (negative = retrograde). */
  rotation: number;
  ring?: Ring;
  /** Stars only: luminosity relative to Sol and mass in solar masses. */
  luminosity?: number;
  mass?: number;
  /** Planets only: equilibrium temperature class used for flavour text. */
  temperatureK?: number;
}

export type BodyFeature = "artifact" | "anomaly" | "rings" | "tidallyLocked" | "homeworld";

export interface Gate {
  tunnelId: string;
  systemId: string;
  otherSystemId: string;
  /** Static position inside the system, AU. */
  pos: Vec3;
}

export interface Tunnel {
  id: string;
  a: string;
  b: string;
  /** Galactic distance in light years. */
  length: number;
  /** Days to traverse at base speed. */
  travelDays: number;
}

export interface StarSystem {
  id: string;
  name: string;
  /** Galactic position in light years. */
  pos: Vec3;
  starIds: string[];
  bodyIds: string[];
  gates: Gate[];
  /** Radius of the outer edge of the system (AU). */
  extent: number;
  nebula?: string; // colour for a surrounding nebula, if any
}

/**
 * aggressive: engage and pursue · defensive: engage, never pursue ·
 * passive: hold course, only take fire · evasive: avoid fights, fall back home from danger.
 */
export type Stance = "aggressive" | "defensive" | "passive" | "evasive";

export interface Ship {
  id: string;
  hull: string;
  name: string;
  hull_hp: number;
  armor: number;
  shields: number;
  xp: number;
}

export type OrderKind = "move" | "colonize" | "buildStation" | "invade" | "attack" | "migrate" | "trade";

export type QueuedOrder = Omit<Order, "route" | "work">;

export interface Order {
  kind: OrderKind;
  systemId: string;
  bodyId?: string;
  pos?: Vec3;
  gateTunnelId?: string;
  fleetId?: string;
  stationType?: string;
  colonyId?: string;
  /** Remaining tunnel hops (tunnel ids) to reach systemId. */
  route: string[];
  /** Progress (days) of an on-site action such as building a station. */
  work?: number;
}

export interface Transit {
  tunnelId: string;
  from: string;
  to: string;
  progress: number; // days
  total: number;
}

export interface Fleet {
  id: string;
  empireId: string;
  name: string;
  ships: Ship[];
  systemId: string | null;
  pos: Vec3;
  /** Previous-tick position, used by the renderer to interpolate smoothly. */
  prevPos: Vec3;
  /** Velocity in AU/day. */
  vel: Vec3;
  /** Current burn: direction of thrust scaled 0..1 of max acceleration (0 = coasting). */
  thrust: Vec3;
  orbitBodyId: string | null;
  order: Order | null;
  transit: Transit | null;
  stance: Stance;
  battleId: string | null;
  /** Privately run vessel (migrant liner): follows its own course, not player orders. */
  civilian?: boolean;
  /** Colonists aboard a migrant liner. */
  migrants?: number;
  /** Orders to carry out after the current one (shift-queued). */
  queue?: QueuedOrder[];
  /** Credits a merchant freighter's cargo is worth on delivery. */
  cargo?: number;
  /** Refuge body an evasive fleet is currently falling back to. */
  evading?: string;
}

export interface BuildingInstance {
  type: string;
}

export type QueueItem =
  | { kind: "building"; type: string; progress: number; total: number }
  | {
      kind: "ship";
      type: string;
      progress: number;
      total: number;
      paid?: Partial<Resources>;
      /** Standing order the new ship executes on launch (e.g. colonise a chosen world). */
      then?: { kind: "colonize"; bodyId: string };
    };

export interface Colony {
  id: string;
  empireId: string;
  bodyId: string;
  systemId: string;
  name: string;
  pop: number;
  buildings: BuildingInstance[];
  queue: QueueItem[];
  /** Current planetary defense HP (shields + batteries). */
  defense: number;
  founded: number;
  /** Days since last combat damage; defenses regenerate after a delay. */
  lastAttacked: number;
  capital: boolean;
  /** Day before which no new migrant liner departs from this colony. */
  nextMigration?: number;
  /** Day the colony's trade hub dispatches its next freighter. */
  nextTrade?: number;
}

export interface Station {
  id: string;
  empireId: string;
  type: string;
  bodyId: string;
  systemId: string;
  level: number;
  hp: number;
  founded: number;
}

export type Relation = "war" | "peace";

export interface ResearchState {
  current: string | null;
  progress: Record<string, number>;
  completed: string[];
  queue: string[];
}

export interface AiState {
  personality: "expansionist" | "militarist" | "scholar" | "trader";
  nextThink: number;
  targetSystemId: string | null;
  warCooldown: number;
  /** Day each current war started, keyed by enemy empire id. */
  warStarted?: Record<string, number>;
  /** Day until which peace proposals from an empire are refused outright. */
  peaceRefusedUntil?: Record<string, number>;
  /** Grand strategy chosen by the empire's (LLM) ruler; steers the utility AI. */
  directive?: AiDirective;
  /** Day on which the ruler next reviews its strategy. */
  llmNext?: number;
  /** Ruler persona (see data/personas.ts), drawn independently of species. */
  persona?: string;
  /** Last day a peace proposal was sent to each (human) empire. */
  peaceProposedAt?: Record<string, number>;
  /** Day until which trade proposals from an empire are declined. */
  tradeRefusedUntil?: Record<string, number>;
}

/** A formal demand one empire has made of another, awaiting an answer. */
export type Demand =
  | { kind: "colony"; colonyId: string; day: number }
  | { kind: "tribute"; resource: ResourceKey; amount: number; day: number };

/** A concrete diplomatic act attached to a message. */
export interface DiploAction {
  kind:
    | "none"
    | "accept_peace"
    | "propose_peace"
    | "declare_war"
    | "offer_tribute"
    | "cede_colony"
    | "demand_tribute"
    | "demand_colony"
    | "propose_trade"
    | "accept_trade"
    | "cancel_trade";
  resource?: ResourceKey;
  amount?: number;
  colonyId?: string;
}

export type Posture = "expand" | "consolidate" | "militarize" | "attack" | "defend";

export interface AiDirective {
  posture: Posture;
  /** Research branch to favour. */
  research: string | null;
  /** Empire to wage war on (declared when the AI next thinks, if at peace). */
  warTarget: string | null;
  /** Empires the ruler wants peace with. */
  seekPeace: string[];
  summary: string;
  day: number;
}

/** A diplomatic message between two empires' rulers. */
export interface ChatMessage {
  id: string;
  from: string; // empire id
  to: string; // empire id
  text: string;
  day: number;
  at: number; // wall-clock ms
  /** Diplomatic act the sender carried out along with the message. */
  action?: DiploAction;
}

export interface EmpireStats {
  shipsBuilt: number;
  shipsLost: number;
  kills: number;
  coloniesFounded: number;
}

export interface Empire {
  id: string;
  name: string;
  color: string;
  speciesId: string;
  isPlayer: boolean;
  isPirate: boolean;
  resources: Resources;
  research: ResearchState;
  explored: Record<string, true>;
  relations: Record<string, Relation>;
  ai: AiState | null;
  alive: boolean;
  /** Last computed per-day income breakdown (net), for UI and AI. */
  income: Required<Yields>;
  stats: EmpireStats;
  fleetCounter: number;
  /** Day the empire lost its last colony (cleared when it has one again). */
  homelessSince?: number;
  /** Empires this one has met (shared a system, or surveyed one of theirs). */
  contacts?: Record<string, true>;
  /** Pending peace offers from other (human) empires: sender id → day offered. */
  peaceOffers?: Record<string, number>;
  /** Empires we have a trade agreement with (id → day signed). */
  tradePartners?: Record<string, number>;
  /** Pending trade agreement proposals from other (human) empires. */
  tradeOffers?: Record<string, number>;
  /** Merchant income: smoothed credits per day, and today's takings. */
  tradeRate?: number;
  tradeToday?: number;
  /** Last day the player was warned about an empty treasury. */
  bankruptWarnedAt?: number;
  /** Pending demands made of this empire: demander id → demand. */
  demands?: Record<string, Demand>;
}

export interface Battle {
  id: string;
  systemId: string;
  pos: Vec3;
  started: number;
  empireIds: string[];
  rounds: number;
}

export type GameEventKind =
  | "info"
  | "combat"
  | "colony"
  | "research"
  | "construction"
  | "diplomacy"
  | "danger"
  | "victory"
  | "defeat";

export interface GameLogEntry {
  day: number;
  kind: GameEventKind;
  text: string;
  empireId: string | null; // a single recipient, or null together with `audience`/public
  /** Empires that know about this event (when absent and empireId is null: public news). */
  audience?: string[];
  systemId?: string;
  /** What the entry is about, and where it was seen at the time (clicking the entry locates it). */
  ref?: LogRef;
}

export interface LogRef {
  kind: "fleet" | "body" | "point";
  /** Fleet or body id (empty for a point). */
  id: string;
  systemId: string;
  /** Position in the system (AU) when the entry was written. */
  pos?: Vec3;
}

export interface GameSettings {
  seed: string;
  systemCount: number;
  aiCount: number;
  playerName: string;
  playerSpecies: string;
  playerColor: string;
  difficulty: "easy" | "normal" | "hard";
  pirates: boolean;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  day: number;
  rngState: number;
  idCounter: number;
  systems: Record<string, StarSystem>;
  bodies: Record<string, Body>;
  tunnels: Record<string, Tunnel>;
  empires: Record<string, Empire>;
  colonies: Record<string, Colony>;
  stations: Record<string, Station>;
  fleets: Record<string, Fleet>;
  battles: Record<string, Battle>;
  log: GameLogEntry[];
  playerId: string;
  winner: string | null;
  victoryType: string | null;
  /** Next day on which pirates may spawn a raid. */
  nextRaid: number;
  /** Diplomatic correspondence (local games; sessions keep it server-side). */
  chats?: ChatMessage[];
}

/** Ephemeral events emitted by a tick, consumed by the renderer/UI (not saved). */
export type SimEvent =
  | {
      type: "shot";
      systemId: string;
      from: Vec3;
      to: Vec3;
      weapon: string;
      hit: boolean;
      intercepted?: boolean;
      fromEmpire: string;
      /** "fleet:<id>" or "body:<id>" so the renderer can anchor effects to visuals. */
      fromRef: string;
      toRef: string;
    }
  | { type: "explosion"; systemId: string; pos: Vec3; size: number; ref: string }
  | { type: "shipBuilt"; systemId: string; fleetId: string; hull: string }
  | { type: "colonized"; systemId: string; bodyId: string; empireId: string }
  | { type: "stationBuilt"; systemId: string; bodyId: string; empireId: string; stationType: string }
  | { type: "jump"; systemId: string; pos: Vec3; fleetId: string; entering: boolean }
  | { type: "contact"; a: string; b: string };
