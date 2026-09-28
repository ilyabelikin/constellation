// "Recommended actions": sites worth building on, worlds worth settling, and
// idle assets. Shown as clickable badges under the top bar.

import { HULL_MAP } from "../sim/data/ships";
import { STAR_TYPE_MAP } from "../sim/data/stars";
import { BUILDING_MAP } from "../sim/data/structures";
import { buildingSlots, canColonize, habitability, siteContext, stationBuildError, type SiteContext } from "../sim/economy";
import type { Game } from "../sim/game";
import type { Body } from "../sim/types";

export type OpportunityKind =
  | "colonize"
  | "mining"
  | "energy"
  | "research"
  | "exotic"
  | "dyson"
  | "idleShips"
  | "freeSlots"
  | "researchIdle";

export interface OpportunityTarget {
  kind: "body" | "fleet" | "colony" | "research";
  id: string;
  systemId?: string;
  label: string;
  score: number;
}

export interface Opportunity {
  kind: OpportunityKind;
  icon: string;
  title: string;
  color: string;
  targets: OpportunityTarget[];
}

export const OPPORTUNITY_META: Record<OpportunityKind, { icon: string; title: string; color: string }> = {
  colonize: { icon: "🜨", title: "Habitable worlds to colonize", color: "#7dff9a" },
  mining: { icon: "⛏", title: "Rich mining sites", color: "#c6d0dc" },
  energy: { icon: "⚡", title: "Energy sites (solar arrays, gas harvesters)", color: "#7fe0ff" },
  research: { icon: "🔭", title: "Research sites (artifacts, anomalies, exotic stars)", color: "#8affc1" },
  exotic: { icon: "✦", title: "Exotic matter deposits", color: "#d49cff" },
  dyson: { icon: "◎", title: "Stars ready for a Dyson Swarm", color: "#ffd66b" },
  idleShips: { icon: "⚓", title: "Idle civilian ships awaiting orders", color: "#ffc857" },
  freeSlots: { icon: "🏗", title: "Colonies with free building slots and nothing queued", color: "#ffb36b" },
  researchIdle: { icon: "⚗", title: "Research is idle — pick a project", color: "#ff6b6b" },
};

function site(game: Game, ctx: SiteContext, body: Body, type: string): boolean {
  return stationBuildError(game.state, game.player, type, body, ctx) === null;
}

/**
 * Opportunities in the given systems (site-based kinds) plus empire-wide
 * alerts. Only systems the player has explored are considered.
 */
export function findOpportunities(game: Game, systemIds: string[]): Opportunity[] {
  const s = game.state;
  const p = game.player;
  const ctx = siteContext(s);
  const buckets: Partial<Record<OpportunityKind, OpportunityTarget[]>> = {};
  const push = (k: OpportunityKind, t: OpportunityTarget) => (buckets[k] ??= []).push(t);

  const raiderSystems = new Set(Object.values(s.stations).filter((st) => s.empires[st.empireId]?.isPirate).map((st) => st.systemId));
  for (const sysId of systemIds) {
    if (!p.explored[sysId] || raiderSystems.has(sysId)) continue;
    const owner = ctx.owners[sysId];
    if (owner && owner !== p.id && !s.empires[owner]?.isPirate) continue;
    const sys = s.systems[sysId];
    for (const id of [...sys.starIds, ...sys.bodyIds]) {
      const b = s.bodies[id];
      if ((b.kind === "planet" || b.kind === "moon") && b.size > 0 && !ctx.colonyByBody.has(b.id) && canColonize(p, b)) {
        const h = habitability(p, b);
        push("colonize", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · ${Math.round(h * 100)}% · size ${b.size}`, score: h * b.size });
      }
      if (b.richness.metals >= 1 && site(game, ctx, b, "mining_station"))
        push("mining", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · metals ×${b.richness.metals.toFixed(1)}`, score: b.richness.metals });
      if (b.kind === "star" && (STAR_TYPE_MAP[b.type]?.solar ?? 0) >= 0.8 && site(game, ctx, b, "solar_array"))
        push("energy", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · solar ×${STAR_TYPE_MAP[b.type].solar.toFixed(1)}`, score: STAR_TYPE_MAP[b.type].solar });
      if (b.richness.energy >= 1 && site(game, ctx, b, "gas_harvester"))
        push("energy", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · gas ×${b.richness.energy.toFixed(1)}`, score: b.richness.energy });
      const researchy =
        b.features.includes("artifact") || b.features.includes("anomaly") || b.richness.research >= 1.2 || (b.kind === "star" && (STAR_TYPE_MAP[b.type]?.research ?? 0) >= 1);
      if (researchy && site(game, ctx, b, "research_station"))
        push("research", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · research ×${b.richness.research.toFixed(1)}${b.features.includes("artifact") ? " · artifact" : ""}`, score: b.richness.research + (b.features.includes("artifact") ? 2 : 0) });
      if (site(game, ctx, b, "exotic_extractor"))
        push("exotic", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · exotics ×${b.richness.exotics.toFixed(1)}`, score: b.richness.exotics });
      if (b.kind === "star" && site(game, ctx, b, "dyson_swarm"))
        push("dyson", { kind: "body", id: b.id, systemId: sysId, label: `${b.name} · solar ×${(STAR_TYPE_MAP[b.type]?.solar ?? 0).toFixed(1)}`, score: STAR_TYPE_MAP[b.type]?.solar ?? 0 });
    }
  }

  // Empire-wide alerts.
  for (const f of Object.values(s.fleets)) {
    if (f.empireId !== p.id || f.order || f.transit || !f.ships.length) continue;
    const roles = new Set(f.ships.map((sh) => HULL_MAP[sh.hull].role));
    if (roles.has("colony") || roles.has("constructor") || (roles.has("scout") && roles.size === 1))
      push("idleShips", { kind: "fleet", id: f.id, systemId: f.systemId ?? undefined, label: `${f.name} (${[...roles].join(", ")})`, score: roles.has("colony") ? 3 : roles.has("constructor") ? 2 : 1 });
  }
  for (const c of game.playerColonies()) {
    const queued = c.queue.filter((q) => q.kind === "building").length;
    const free = buildingSlots(s, c) - c.buildings.length - queued;
    if (free > 0 && !c.queue.some((q) => BUILDING_MAP[q.type])) push("freeSlots", { kind: "colony", id: c.bodyId, systemId: c.systemId, label: `${c.name} · ${free} free slot${free > 1 ? "s" : ""}`, score: free });
  }
  if (!p.research.current) push("researchIdle", { kind: "research", id: "", label: "Choose a research project", score: 1 });

  const order: OpportunityKind[] = ["researchIdle", "idleShips", "colonize", "energy", "mining", "research", "exotic", "dyson", "freeSlots"];
  return order
    .filter((k) => buckets[k]?.length)
    .map((k) => ({ kind: k, ...OPPORTUNITY_META[k], targets: buckets[k]!.sort((a, b) => b.score - a.score) }));
}
