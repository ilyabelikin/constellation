// Compact, knowledge-limited situation report for an AI ruler. Everything in
// here is something that empire could know: its own state in full, rivals it
// has met only through what it has observed (colonies in systems it has
// explored, fleets in its sensor range, public strength estimates and the
// news it witnessed). Written tersely to keep prompts cheap.

import { empirePower } from "../sim/ai";
import { fleetArmed, fleetPower } from "../sim/combat";
import { PERSONAS } from "../sim/data/personas";
import { SPECIES_MAP } from "../sim/data/structures";
import { TECH_MAP } from "../sim/data/techs";
import { popCapacity, systemOwnerMap } from "../sim/economy";
import { hasMet, sensorSystems } from "../sim/knowledge";
import type { Empire, GameState } from "../sim/types";
import { canSeeLog } from "../sim/util";
import type { Briefing } from "./types";

const n0 = (v: number) => Math.round(v).toString();
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
const signed = (v: number) => (v >= 0 ? "+" : "") + n1(v);

/** The persona of an AI empire (older saves get one derived from the empire id). */
export function personaOf(e: Empire): string {
  if (e.ai?.persona) return e.ai.persona;
  let h = 0;
  for (const ch of e.id + e.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PERSONAS[h % PERSONAS.length].id;
}

export function buildBriefing(state: GameState, empireId: string, isHuman: (id: string) => boolean): Briefing {
  const me = state.empires[empireId];
  const owners = systemOwnerMap(state);
  const sensors = sensorSystems(state, empireId);
  const sysName = (id: string) => state.systems[id]?.name ?? "?";
  const myPower = empirePower(state, empireId);
  const lines: string[] = [];

  // --- us
  const colonies = Object.values(state.colonies).filter((c) => c.empireId === empireId);
  const r = me.resources;
  const inc = me.income;
  const cur = me.research.current ? TECH_MAP[me.research.current]?.name : null;
  const ownedSystems = Object.values(owners).filter((o) => o === empireId).length;
  const total = Object.keys(state.systems).length;
  lines.push(`DAY ${Math.floor(state.day)}. Systems: you own ${ownedSystems}/${total}, explored ${Object.keys(me.explored).length}.`);
  lines.push(
    `ECONOMY credits ${n0(r.credits)} (${signed(inc.credits)}/d${me.tradeRate ? `, merchants ~${signed(me.tradeRate)}/d` : ""}), metals ${n0(r.metals)} (${signed(inc.metals)}), energy ${n0(r.energy)} (${signed(inc.energy)}), exotics ${n0(r.exotics)} (${signed(inc.exotics)}); research ${n1(inc.research)}/d, ${me.research.completed.length} techs${cur ? `, researching ${cur}` : ""}.`,
  );
  lines.push(
    `COLONIES (${colonies.length}): ` +
      colonies
        .sort((a, b) => b.pop - a.pop)
        .slice(0, 14)
        .map((c) => `${c.name} [${c.id}] pop ${n1(c.pop)}/${n0(popCapacity(state, c))}${c.capital ? " CAPITAL" : ""} @${sysName(c.systemId)}`)
        .join("; "),
  );
  const myFleets = Object.values(state.fleets).filter((f) => f.empireId === empireId && f.ships.length && !f.civilian);
  const war = myFleets.filter((f) => fleetArmed(f));
  lines.push(
    `MILITARY strength ${n0(myPower)}: ${war.length} warfleet(s) [${war
      .sort((a, b) => fleetPower(state, b) - fleetPower(state, a))
      .slice(0, 5)
      .map((f) => `${n0(fleetPower(state, f))}@${f.systemId ? sysName(f.systemId) : "tunnel"}`)
      .join(", ")}], ${myFleets.length - war.length} civilian/support group(s).`,
  );

  // --- rivals we know
  const rivals: Briefing["rivals"] = [];
  const knownColonies: Briefing["knownColonies"] = [];
  let unmet = 0;
  lines.push("KNOWN RIVALS:");
  for (const e of Object.values(state.empires)) {
    if (e.id === empireId || !e.alive || e.isPirate) continue;
    if (!hasMet(state, empireId, e.id)) {
      unmet++;
      continue;
    }
    const human = isHuman(e.id);
    const relation = me.relations[e.id] === "war" ? "war" : "peace";
    const trade = me.tradePartners?.[e.id] !== undefined;
    rivals.push({ id: e.id, name: e.name, human, relation, trade });
    const theirs = Object.values(state.colonies).filter((c) => c.empireId === e.id && me.explored[c.systemId]);
    for (const c of theirs) knownColonies.push({ id: c.id, name: c.name, ownerId: e.id });
    const border = Object.keys(owners).some(
      (sid) => owners[sid] === empireId && state.systems[sid].gates.some((g) => owners[g.otherSystemId] === e.id),
    );
    const theirPower = empirePower(state, e.id);
    const warDays = me.ai?.warStarted?.[e.id] !== undefined ? state.day - me.ai.warStarted[e.id] : null;
    const bits = [
      `- ${e.name} [${e.id}] ${SPECIES_MAP[e.speciesId]?.adjective ?? ""}${human ? " (HUMAN ruler)" : ""}: ${relation.toUpperCase()}${relation === "war" && warDays !== null ? ` for ${n0(warDays)}d` : ""}`,
      `strength ~${n0(theirPower)} (${n1(theirPower / Math.max(1, myPower))}x ours)`,
      border ? "shares a border with us" : "no common border",
      theirs.length
        ? `known colonies: ${theirs
            .sort((a, b) => b.pop - a.pop)
            .slice(0, 6)
            .map((c) => `${c.name} [${c.id}] pop ${n1(c.pop)}${c.capital ? " capital" : ""} @${sysName(c.systemId)}`)
            .join(", ")}`
        : "no colonies known",
    ];
    if (me.peaceOffers?.[e.id] !== undefined) bits.push("THEY OFFER PEACE (pending)");
    if (trade) bits.push("TRADE PARTNER (merchants fly between us)");
    else if (me.tradeOffers?.[e.id] !== undefined) bits.push("THEY OFFER A TRADE AGREEMENT (pending)");
    const theirDemand = me.demands?.[e.id];
    if (theirDemand) bits.push(`THEY DEMAND ${theirDemand.kind === "colony" ? state.colonies[theirDemand.colonyId]?.name : `${theirDemand.amount} ${theirDemand.resource}`}`);
    const ourDemand = e.demands?.[empireId];
    if (ourDemand) bits.push(`we demanded ${ourDemand.kind === "colony" ? state.colonies[ourDemand.colonyId]?.name : `${ourDemand.amount} ${ourDemand.resource}`} (unanswered)`);
    lines.push(bits.join("; ") + ".");
  }
  if (!rivals.length) lines.push("- none met yet");
  if (unmet) lines.push(`${unmet} other civilization(s) exist that we have not met.`);

  // --- threats we can see
  const threats = Object.values(state.fleets).filter(
    (f) => f.empireId !== empireId && f.systemId && sensors.has(f.systemId) && fleetArmed(f) && (me.relations[f.empireId] === "war" || state.empires[f.empireId]?.isPirate),
  );
  if (threats.length)
    lines.push(`HOSTILE FLEETS IN SIGHT: ${threats.slice(0, 6).map((f) => `${state.empires[f.empireId].name} ${n0(fleetPower(state, f))}@${sysName(f.systemId!)}`).join(", ")}.`);

  // --- news we witnessed
  const news = state.log.filter((l) => canSeeLog(l, empireId) && l.kind !== "construction" && l.kind !== "research" && l.kind !== "info").slice(-10);
  if (news.length) lines.push("RECENT: " + news.map((l) => `d${Math.floor(l.day)} ${l.text}`).join(" | "));

  const d = me.ai?.directive;
  if (d) lines.push(`CURRENT STRATEGY (since d${Math.floor(d.day)}): ${d.posture}${d.research ? `, research ${d.research}` : ""}${d.warTarget ? `, war on ${state.empires[d.warTarget]?.name}` : ""}. "${d.summary}"`);

  return {
    day: state.day,
    empireId,
    empireName: me.name,
    speciesId: me.speciesId,
    personaId: personaOf(me),
    dump: lines.join("\n").slice(0, 7000),
    rivals,
    ownColonies: colonies.map((c) => ({ id: c.id, name: c.name, capital: c.capital })).slice(0, 60),
    knownColonies: knownColonies.slice(0, 60),
  };
}
