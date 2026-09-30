import { expect, it } from "vitest";
import * as THREE from "three";
import { Effects } from "../src/render/Effects";

it("laser beams point from the gun to the target, even in a scaled effects layer", () => {
  for (const scale of [1, 3.7]) {
    const fx = new Effects();
    fx.group.scale.setScalar(scale);
    fx.group.position.set(5, -2, 1);
    const from = new THREE.Vector3(1, 2, 3);
    const to = new THREE.Vector3(-4, 6, 0.5);
    fx.beam(from, to, new THREE.Color("#f00"), 0.1, 0.3);
    const beam = fx.group.children[0] as THREE.Mesh;
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(beam.quaternion);
    expect(dir.dot(to.clone().sub(from).normalize())).toBeGreaterThan(0.9999);
    // Its far end reaches the target (in the layer's space).
    beam.updateMatrix();
    const end = new THREE.Vector3(0, 0, 1).applyMatrix4(beam.matrix);
    expect(end.distanceTo(to)).toBeLessThan(1e-4);
  }
});
