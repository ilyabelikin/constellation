import { expect, it } from "vitest";
import * as THREE from "three";
import { shipModel } from "../src/render/ShipModels";
import { HULLS } from "../src/sim/data/ships";

function tris(g: THREE.BufferGeometry): THREE.Triangle[] {
  const pos = g.getAttribute("position");
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const out: THREE.Triangle[] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos as THREE.BufferAttribute, idx ? idx.getX(i) : i);
  for (let i = 0; i + 2 < n; i += 3) out.push(new THREE.Triangle(v(i), v(i + 1), v(i + 2)));
  return out;
}
function samples(t: THREE.Triangle[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const n = 4;
  for (const tr of t)
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const a = i / n, b = j / n, c = 1 - a - b;
        out.push(new THREE.Vector3().addScaledVector(tr.a, a).addScaledVector(tr.b, b).addScaledVector(tr.c, c));
      }
  return out;
}
it("every ship design is structurally sound: no part floats free of the hull", () => {
  const report: string[] = [];
  let checked = 0;
  const ray = new THREE.Raycaster();
  for (const st of ["terran", "thalassi", "vashari", "kraal", "lumenari", "aurelian"] as const)
    for (const h of HULLS) {
      const m = shipModel(h.id, st);
      const parts = m.parts.map((g) => ({ t: tris(g), mesh: new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), box: new THREE.Box3().setFromBufferAttribute(g.getAttribute("position") as THREE.BufferAttribute) }));
      const eps = m.length * 0.012;
      const touches = (a: typeof parts[0], b: typeof parts[0]) => {
        if (!a.box.clone().expandByScalar(eps).intersectsBox(b.box)) return false;
        const cp = new THREE.Vector3();
        for (const p of samples(a.t)) {
          if (!b.box.clone().expandByScalar(eps).containsPoint(p)) continue;
          for (const tr of b.t) if (tr.closestPointToPoint(p, cp).distanceTo(p) < eps) return true;
          // inside b?
          ray.set(p, new THREE.Vector3(0.577, 0.577, 0.577));
          if (ray.intersectObject(b.mesh, false).length % 2 === 1) return true;
        }
        return false;
      };
      const parent = parts.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (find(i) !== find(j) && (touches(parts[i], parts[j]) || touches(parts[j], parts[i]))) parent[find(i)] = find(j);
      const size = new Map<number, number>();
      parts.forEach((_, i) => size.set(find(i), (size.get(find(i)) ?? 0) + 1));
      const main = [...size.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const loose = parts.map((_, i) => i).filter((i) => find(i) !== main);
      checked++;
      if (loose.length) report.push(`LOOSE ${st} ${h.id}: ${loose.length}/${parts.length} ` + loose.map((i) => { const c = new THREE.Vector3(); parts[i].box.getCenter(c); const sz = new THREE.Vector3(); parts[i].box.getSize(sz); return `#${i} c(${c.toArray().map((v) => v.toFixed(2))}) s(${sz.toArray().map((v) => v.toFixed(2))})`; }).join("; "));
    }
  expect(checked).toBe(HULLS.length * 6);
  expect(report, report.join("\n")).toEqual([]);
}, 120000);
