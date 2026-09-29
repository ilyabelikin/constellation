// The game's icon set: Lucide line icons (MIT), inlined as SVG so they take
// the surrounding text colour and size. Use `icon(name)` in HTML strings.

import {
  Anchor,
  Anvil,
  ArrowLeftRight,
  ArrowRight,
  Atom,
  Building2,
  Castle,
  Circle,
  CircleDashed,
  Cloud,
  Coins,
  Combine,
  Compass,
  Construction,
  Cpu,
  Crown,
  Diamond,
  Earth,
  Ellipsis,
  Factory,
  Flag,
  FlaskConical,
  Flame,
  Gift,
  HandCoins,
  Handshake,
  Hexagon,
  House,
  LocateFixed,
  Map,
  Menu,
  MessageSquare,
  Microscope,
  Orbit,
  Pause,
  Pencil,
  Pickaxe,
  Rocket,
  Shield,
  ShieldHalf,
  Skull,
  Sparkle,
  Sparkles,
  Split,
  Square,
  Star,
  Sun,
  Swords,
  Telescope,
  TriangleAlert,
  Users,
  X,
  Zap,
} from "lucide";

type Child = readonly [string, Record<string, string | number | undefined>];

const ICONS = {
  // resources
  credits: Coins,
  metals: Anvil,
  energy: Zap,
  exotics: Atom,
  research: FlaskConical,
  // navigation & chrome
  pause: Pause,
  menu: Menu,
  close: X,
  galaxy: Map,
  system: Sun,
  home: House,
  empires: Crown,
  players: Users,
  command: Flag,
  empire: Flag,
  // world features & bodies
  star: Star,
  sun: Sun,
  belt: Ellipsis,
  comet: Sparkle,
  artifact: Hexagon,
  anomaly: Diamond,
  rings: CircleDashed,
  tunnel: ArrowRight,
  // actions
  colonize: Earth,
  war: Swords,
  peace: Handshake,
  trade: ArrowLeftRight,
  talk: MessageSquare,
  gift: Gift,
  warning: TriangleAlert,
  rename: Pencil,
  stop: Square,
  split: Split,
  focus: LocateFixed,
  explore: Compass,
  merge: Combine,
  defense: Shield,
  idle: Anchor,
  build: Construction,
  // structures
  mine: Pickaxe,
  plant: Flame,
  lab: Microscope,
  tradehub: HandCoins,
  shipyard: Rocket,
  grid: ShieldHalf,
  foundry: Factory,
  quantum: Cpu,
  refinery: Sparkles,
  habitat: Building2,
  fortress: Castle,
  gas: Cloud,
  telescope: Telescope,
  dyson: Orbit,
  pirates: Skull,
  dot: Circle,
} as const;

export type IconName = keyof typeof ICONS;

function attrs(a: Record<string, string | number | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
}

function childHtml([tag, a]: Child): string {
  return `<${tag}${attrs(a)}/>`;
}

/** The icon's shapes (Lucide nodes are either ["svg", attrs, children] or just the children). */
function shapes(node: unknown): Child[] {
  const n = node as unknown[];
  return (n[0] === "svg" ? (n[2] as Child[]) : (n as unknown as Child[])) ?? [];
}

const cache = new globalThis.Map<string, string>();

/** An inline SVG icon (1em, current colour). `cls` adds classes; `title` a tooltip. */
export function icon(name: IconName | string, cls = ""): string {
  const key = `${name}|${cls}`;
  let html = cache.get(key);
  if (html === undefined) {
    const node = (ICONS as Record<string, unknown>)[name];
    if (!node) return "";
    html = `<svg class="i${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes(node).map(childHtml).join("")}</svg>`;
    cache.set(key, html);
  }
  return html;
}
