// Economy scarcity benchmark: AI-only games; reports stockpiles, net income
// and how often stockpiles sit at the storage cap (a sign resources are not
// scarce), at several checkpoints.
//   npx tsx scripts/economy.ts [days] [seeds...]
import { Game } from "../src/sim/game";
import { incomeReport, storageCap } from "../src/sim/economy";

const days = Number(process.argv[2] ?? 1500);
const seeds = process.argv.slice(3).length ? process.argv.slice(3) : ["eco-1", "eco-2", "eco-3"];
const checkpoints = [250, 500, 1000, 1500, 2000].filter((d) => d <= days);
type Row = Record<string, number[]>;
const rows: Record<number, Row> = {};
const push = (d: number, k: string, v: number) => ((rows[d] ??= {})[k] ??= []).push(v);
for (const seed of seeds) {
  const g = Game.create({ seed, systemCount: 32, aiCount: 3 });
  const s = g.state;
  s.empires.e0.isPlayer = false;
  s.empires.e0.ai = { personality: "expansionist", nextThink: 1, targetSystemId: null, warCooldown: 120 };
  const capped: Record<string, number> = {};
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < 10; i++) g.step();
    for (const e of Object.values(s.empires)) {
      if (e.isPirate || !e.alive) continue;
      const cap = storageCap(s, e);
      for (const k of ["metals", "energy", "credits"] as const) if (e.resources[k] >= cap * 0.98) capped[`${e.id}${k}`] = (capped[`${e.id}${k}`] ?? 0) + 1;
    }
    if (!checkpoints.includes(d)) continue;
    for (const e of Object.values(s.empires)) {
      if (e.isPirate || !e.alive) continue;
      const r = incomeReport(s, e);
      for (const k of ["credits", "metals", "energy"] as const) {
        push(d, `${k} stock`, e.resources[k]);
        push(d, `${k} gross`, r.gross[k]);
        push(d, `${k} upkeep`, r.upkeep[k]);
        push(d, `${k} net`, r.net[k]);
        push(d, `${k} %capped`, (100 * (capped[`${e.id}${k}`] ?? 0)) / d);
      }
      push(d, "research", r.net.research);
      push(d, "trade", e.tradeRate ?? 0);
      push(d, "colonies", Object.values(s.colonies).filter((c) => c.empireId === e.id).length);
      push(d, "ships", Object.values(s.fleets).filter((f) => f.empireId === e.id && !f.civilian).reduce((a, f) => a + f.ships.length, 0));
    }
  }
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const keys = Object.keys(rows[checkpoints[0]] ?? {});
console.log(["", ...checkpoints.map((d) => `d${d}`)].map((x) => x.padEnd(16)).join(""));
for (const k of keys) console.log([k, ...checkpoints.map((d) => (Math.round(med(rows[d]?.[k] ?? [0]) * 10) / 10).toString())].map((x) => x.padEnd(16)).join(""));
