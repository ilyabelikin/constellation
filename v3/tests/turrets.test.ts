import { expect, it } from "vitest";
import * as THREE from "three";
import { shipModel } from "../src/render/ShipModels";
import { TurretRig } from "../src/render/Turrets";
import { HULLS } from "../src/sim/data/ships";

const STYLES = ["terran", "vashari", "lumenari", "kraal", "thalassi", "aurelian"] as const;

it("every armed hull carries turning turrets in every species' style", () => {
  const missing: string[] = [];
  for (const st of STYLES)
    for (const h of HULLS) {
      if (h.role !== "military" || !h.weapons.length) continue;
      if (!shipModel(h.id, st).turrets.length) missing.push(`${st}:${h.id}`);
    }
  expect(missing).toEqual([]);
});

it("a turret swings onto its target before it bears, and its guns then point at it", () => {
  const model = shipModel("cruiser", "vashari");
  const owner = new THREE.Mesh(model.hull);
  const rig = new TurretRig();
  const turrets = rig.add(owner, model.turrets, "vashari", new THREE.Color("#fff"));
  const t = turrets[0];
  // A target off to the side and above: the turret must traverse to face it.
  const mount = model.turrets[0].pos;
  const target = mount.clone().add(new THREE.Vector3(40, 15, -10));
  rig.aim(t, target, 5);
  rig.update(0.016);
  expect(rig.onTarget(t)).toBe(false);
  let frames = 0;
  while (!rig.onTarget(t) && frames < 300) {
    rig.update(0.016);
    frames++;
  }
  expect(rig.onTarget(t)).toBe(true);
  expect(frames).toBeGreaterThan(10); // it turns at a finite rate, not instantly
  const tip = rig.muzzle(t, new THREE.Vector3(), 0);
  const base = rig.muzzle(t, new THREE.Vector3(), 0).sub(tip); // zero: same barrel
  expect(base.length()).toBe(0);
  // The barrel runs from the trunnion toward the target.
  const dirToTarget = target.clone().sub(tip).normalize();
  const barrelDir = new THREE.Vector3(0, 0, 1).transformDirection(t.barrelM);
  expect(barrelDir.dot(dirToTarget)).toBeGreaterThan(0.97);
  // Without a target it returns to rest.
  t.hold = 0;
  for (let i = 0; i < 400; i++) rig.update(0.016);
  expect(Math.abs(t.yaw) + Math.abs(t.pitch)).toBeLessThan(0.01);
  rig.dispose();
});
