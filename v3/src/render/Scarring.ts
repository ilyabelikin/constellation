// Where a shot lands on a ship: raycast from the shooter onto the hull's real
// surface and leave a scar there, in the model's own coordinates, so it turns
// and travels with the ship and stays until repaired.

import * as THREE from "three";
import type { WeaponFamily } from "../sim/data/ships";
import { hullNow, scarRadius, type Scar, type ScarKind } from "./ShipModels";

const ray = new THREE.Raycaster();
const tmp = new THREE.Vector3();

/** The mark a weapon family leaves. */
export function scarKindFor(family: string): ScarKind {
  if (family === "laser" || family === "lance") return "laser";
  if (family === "missile") return "blast";
  return "kinetic";
}

export const SCAR_KINDS: ScarKind[] = ["kinetic", "laser", "blast"];

/** A random point of the hull, in world space. */
export function hullPointWorld(mesh: THREE.Mesh, out = new THREE.Vector3()): THREE.Vector3 {
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  out.fromBufferAttribute(pos, Math.floor(Math.random() * pos.count));
  return mesh.localToWorld(out);
}

/**
 * Where a shot from `from` strikes this hull: aims at a random part of the
 * ship and takes the first surface in the way — the side facing the shooter.
 */
export function strikePoint(mesh: THREE.Mesh, from: THREE.Vector3): { world: THREE.Vector3; local: THREE.Vector3; normal: THREE.Vector3 } | null {
  mesh.updateWorldMatrix(true, false);
  for (let tries = 0; tries < 4; tries++) {
    const aim = hullPointWorld(mesh, tmp);
    ray.set(from, aim.clone().sub(from).normalize());
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) continue;
    const local = mesh.worldToLocal(hit.point.clone());
    const normal = hit.face ? hit.face.normal.clone() : local.clone().normalize();
    return { world: hit.point.clone(), local, normal };
  }
  return null;
}

/** A scar of this kind at a model-space point on a surface with this normal. */
export function makeScar(kind: ScarKind, local: THREE.Vector3, normal: THREE.Vector3, modelLength: number, delay = 0, heavy = false): Scar {
  // Lasers rake along the surface: any direction across it.
  const axis = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)).normalize();
  if (axis.lengthSq() < 0.5) axis.set(0, 0, 1);
  return { kind, p: local.clone(), r: scarRadius(kind, modelLength, heavy), axis, born: hullNow() + delay, seed: Math.random() * 10 };
}

/** A scar somewhere on the hull, as if from a random direction (damage taken out of sight). */
export function randomScar(mesh: THREE.Mesh, modelLength: number, kind: ScarKind, born: number): Scar | null {
  const sphere = mesh.geometry.boundingSphere ?? (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere!);
  const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const fromLocal = sphere.center.clone().addScaledVector(dir, sphere.radius * 3);
  const s = strikePoint(mesh, mesh.localToWorld(fromLocal));
  if (!s) return null;
  const scar = makeScar(kind, s.local, s.normal, modelLength);
  scar.born = born;
  return scar;
}

/** Weapon families the showcase picks from, one per kind of mark. */
export const SHOWCASE_WEAPONS: WeaponFamily[] = ["railgun", "laser", "missile"];
