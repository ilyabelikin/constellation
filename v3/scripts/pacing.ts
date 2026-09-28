// Economy pacing benchmark: run AI-only games (every empire, including e0,
// played by the AI) and report when milestones are reached.
//   npx tsx scripts/pacing.ts [days] [seeds...]
import { Game } from "../src/sim/game";
import { HULL_MAP } from "../src/sim/data/ships";

const days = Number(process.argv[2] ?? 2000);
const seeds = process.argv.slice(3).length ? process.argv.slice(3) : ["pace-1", "pace-2", "pace-3"];
type M = Record<string, number>;
const rows: M[] = [];
for (const seed of seeds) {
  const g = Game.create({ seed, systemCount: 32, aiCount: 3 });
  const s = g.state;
  const p = s.empires.e0;
  p.isPlayer = false;
  p.ai = { personality: "expansionist", nextThink: 1, targetSystemId: null, warCooldown: 120 };
  const ms: Record<string, M> = {};
  const startBuildings: Record<string, number> = {};
  for (const e of Object.values(s.empires)) if (!e.isPirate) {
    ms[e.id] = {};
    startBuildings[e.id] = Object.values(s.colonies).filter((c) => c.empireId === e.id).reduce((a, c) => a + c.buildings.length, 0);
  }
  const mark = (id: string, k: string) => (ms[id][k] ??= Math.floor(s.day));
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 10; i++) g.step();
    for (const e of Object.values(s.empires)) {
      if (e.isPirate || !ms[e.id]) continue;
      const cols = Object.values(s.colonies).filter((c) => c.empireId === e.id);
      const b = cols.reduce((a, c) => a + c.buildings.length, 0);
      if (b > startBuildings[e.id]) mark(e.id, "building");
      if (cols.length >= 2) mark(e.id, "colony2");
      if (cols.length >= 4) mark(e.id, "colony4");
      if (Object.values(s.stations).some((st) => st.empireId === e.id)) mark(e.id, "station");
      const hulls = new Set(Object.values(s.fleets).filter((f) => f.empireId === e.id).flatMap((f) => f.ships.map((x) => x.hull)));
      for (const h of ["frigate", "destroyer", "cruiser", "battleship"]) if (hulls.has(h)) mark(e.id, h);
      if (e.research.completed.length >= 5) mark(e.id, "tech5");
      if (e.research.completed.length >= 12) mark(e.id, "tech12");
      if (d === 500 || d === days - 1) {
        ms[e.id][`cols@${d + 1}`] = cols.length;
        ms[e.id][`pop@${d + 1}`] = Math.round(cols.reduce((a, c) => a + c.pop, 0));
        ms[e.id][`cr/d@${d + 1}`] = Math.round(e.income.credits * 10) / 10;
        ms[e.id][`techs@${d + 1}`] = e.research.completed.length;
        ms[e.id][`ships@${d + 1}`] = Object.values(s.fleets).filter((f) => f.empireId === e.id).reduce((a, f) => a + f.ships.filter((x) => HULL_MAP[x.hull].role === "military").length, 0);
      }
    }
  }
  for (const [id, m] of Object.entries(ms)) rows.push({ seed: seeds.indexOf(seed), emp: Number(id.slice(1)), alive: s.empires[id].alive ? 1 : 0, ...m });
}
const keys = ["building", "station", "colony2", "colony4", "tech5", "tech12", "frigate", "destroyer", "cruiser", "battleship", "cols@501", "pop@501", "cr/d@501", `cols@${days}`, `pop@${days}`, `cr/d@${days}`, `techs@${days}`, `ships@${days}`];
const med = (k: string) => {
  const v = rows.map((r) => r[k]).filter((x) => x !== undefined).sort((a, b) => a - b);
  return v.length ? `${v[Math.floor(v.length / 2)]} (${v.length}/${rows.length})` : "never";
};
for (const k of keys) console.log(k.padEnd(12), med(k));
