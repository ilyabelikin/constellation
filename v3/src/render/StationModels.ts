// Orbital station models (mining rigs, harvesters, labs, forts, raider havens).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.getAttribute("uv")) n.deleteAttribute("uv");
  return n;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map(clean))!;
  g.computeVertexNormals();
  return g;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

export function stationGeometry(type: string): THREE.BufferGeometry {
  const hit = geoCache.get(type);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    g.translate(x, y, z);
    parts.push(g);
  };
  switch (type) {
    case "mining_station":
      add(new THREE.BoxGeometry(0.5, 0.5, 0.5));
      add(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), 0, -0.7, 0); // drill
      add(new THREE.ConeGeometry(0.18, 0.3, 6), 0, -1.5, 0);
      add(new THREE.BoxGeometry(1.4, 0.05, 0.35), 0, 0.3, 0);
      add(new THREE.BoxGeometry(0.3, 0.3, 0.8), 0.45, 0, 0);
      break;
    case "gas_harvester":
      add(new THREE.SphereGeometry(0.35, 12, 8));
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), 0, -0.9, 0);
      add(new THREE.CylinderGeometry(0.25, 0.1, 0.4, 8), 0, -1.9, 0); // scoop
      add(new THREE.TorusGeometry(0.6, 0.05, 6, 20));
      break;
    case "solar_array": {
      add(new THREE.BoxGeometry(0.2, 0.2, 0.6));
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.4, 0.02, 0.6), s * 0.85, 0, 0);
      break;
    }
    case "research_station":
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12));
      add(new THREE.TorusGeometry(0.7, 0.06, 6, 24));
      add(new THREE.SphereGeometry(0.22, 10, 8), 0, 0.45, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), 0, 0.9, 0);
      break;
    case "exotic_extractor":
      add(new THREE.OctahedronGeometry(0.45));
      add(new THREE.TorusGeometry(0.75, 0.05, 6, 24));
      add(new THREE.TorusGeometry(0.55, 0.04, 6, 24).rotateX(Math.PI / 2));
      break;
    case "defense_platform":
      add(new THREE.CylinderGeometry(0.8, 0.9, 0.3, 8));
      add(new THREE.BoxGeometry(0.25, 0.25, 1.2), 0.3, 0.3, 0.2);
      add(new THREE.BoxGeometry(0.25, 0.25, 1.2), -0.3, 0.3, 0.2);
      add(new THREE.SphereGeometry(0.3, 8, 6), 0, 0.3, -0.3);
      break;
    case "pirate_haven": {
      const rock = new THREE.IcosahedronGeometry(1.2, 1);
      const pos = rock.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const k = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
      }
      add(rock);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.ConeGeometry(0.12, 1.2, 5);
        spike.rotateZ(Math.PI / 2);
        spike.rotateY(a);
        add(spike, Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3);
      }
      add(new THREE.TorusGeometry(1.7, 0.07, 6, 24).rotateX(Math.PI / 2));
      break;
    }
    default:
      add(new THREE.BoxGeometry(0.6, 0.6, 0.6));
  }
  const g = merge(parts);
  g.userData.shared = true;
  geoCache.set(type, g);
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function stationMaterial(color: string): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#b8bcc6").lerp(new THREE.Color(color), 0.35),
      metalness: 0.6,
      roughness: 0.4,
      emissive: new THREE.Color(color).multiplyScalar(0.25),
    });
    m.userData.shared = true;
    matCache.set(color, m);
  }
  return m;
}
