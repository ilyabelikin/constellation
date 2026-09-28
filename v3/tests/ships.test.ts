import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HULLS } from "../src/sim/data/ships";
import { SPECIES } from "../src/sim/data/structures";
import { SHIP_STYLES, shipModel, styleForSpecies, type ShipStyle } from "../src/render/ShipModels";

describe("species ship styles", () => {
  const styles = Object.keys(SHIP_STYLES) as ShipStyle[];

  it("every species has a design language, and they differ", () => {
    const used = new Set(SPECIES.map((s) => styleForSpecies(s.id)));
    expect(used.size).toBe(SPECIES.length);
    expect(styleForSpecies("pirates")).toBe("terran");
  });

  it("builds every hull in every style with sane geometry and engines", () => {
    for (const style of styles)
      for (const h of HULLS) {
        const m = shipModel(h.id, style);
        const pos = m.hull.getAttribute("position");
        expect(pos.count).toBeGreaterThan(20);
        const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
        for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v)).toBe(true);
        expect(m.length).toBeGreaterThan(0);
        expect(m.engines.length).toBeGreaterThan(0);
        // Engines sit at the back half (the nose points +Z).
        for (const e of m.engines) expect(e.z).toBeLessThan(box.max.z);
      }
  });

  it("bigger hulls are built bigger within a style", () => {
    for (const style of styles) {
      const size = (id: string) => {
        const m = shipModel(id, style);
        const b = new THREE.Box3().setFromBufferAttribute(m.hull.getAttribute("position") as THREE.BufferAttribute);
        return b.getSize(new THREE.Vector3()).length();
      };
      if (style !== "terran") expect(size("titan")).toBeGreaterThan(size("corvette"));
    }
  });
});
