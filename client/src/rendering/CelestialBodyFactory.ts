import * as THREE from "three";
import { MaterialFactory } from "./MaterialFactory.js";

/**
 * Factory for creating Three.js meshes for celestial bodies and ships
 */
export class CelestialBodyFactory {
  private materialFactory: MaterialFactory;
  private scale: number;
  private bodySizeMultiplier: number;

  constructor(scale: number, bodySizeMultiplier: number) {
    this.materialFactory = new MaterialFactory();
    this.scale = scale;
    this.bodySizeMultiplier = bodySizeMultiplier;
  }

  /**
   * Creates a star mesh with glow layers and lighting
   */
  createStar(star: any, scene: THREE.Scene): THREE.Mesh {
    const radius = star.radius * this.scale * this.bodySizeMultiplier;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    const material = this.materialFactory.createStarMaterial(
      star.color || 0xffff00
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: star.id, type: "star", body: star };

    // Add bright point light from the star (no distance limit, minimal decay for visibility)
    const light = new THREE.PointLight(star.color || 0xffff00, 30, 0, 0.5);
    light.position.set(0, 0, 0);
    scene.add(light);

    // Add multiple layers of glow around the star for enhanced radiance
    const glowLayers = [
      { size: 1.1, opacity: 0.8 },
      { size: 1.2, opacity: 0.6 },
      { size: 1.35, opacity: 0.4 },
    ];

    glowLayers.forEach((layer) => {
      const glowGeometry = new THREE.SphereGeometry(
        radius * layer.size,
        32,
        32
      );
      const glowMaterial = this.materialFactory.createGlowMaterial(
        star.color || 0xffff00,
        layer.opacity
      );
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      scene.add(glow);
    });

    // Add ambient light for the system (so planets are always somewhat visible)
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambient);

    return mesh;
  }

  /**
   * Creates a planet mesh with optional atmosphere
   */
  createPlanet(planet: any): THREE.Mesh {
    const radius = planet.radius * this.scale * this.bodySizeMultiplier;
    const geometry = new THREE.SphereGeometry(radius, 64, 64);

    const material = this.materialFactory.createPlanetMaterial(
      planet.color || 0x888888
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: planet.id, type: "planet", body: planet };

    // Add atmosphere if planet has one
    if (planet.hasAtmosphere) {
      const atmosphereRadius = radius * 1.05; // 5% larger than planet
      const atmosphereGeometry = new THREE.SphereGeometry(
        atmosphereRadius,
        32,
        32
      );

      const atmosphereMaterial = this.materialFactory.createAtmosphereMaterial(
        planet.color || 0x88ccff
      );

      const atmosphereMesh = new THREE.Mesh(
        atmosphereGeometry,
        atmosphereMaterial
      );
      mesh.add(atmosphereMesh); // Attach to planet so it rotates together
    }

    return mesh;
  }

  /**
   * Creates an orbit line for a planet
   */
  createOrbitLine(planet: any): THREE.Line {
    if (!planet.orbitalElements) {
      throw new Error("Planet must have orbital elements to create orbit line");
    }

    const oe = planet.orbitalElements;
    const a = oe.semiMajorAxis * this.scale;
    const e = oe.eccentricity;
    const segments = 128;

    // Create ellipse points in orbital plane
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const trueAnomaly = (i / segments) * Math.PI * 2;
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));

      // Position in orbital plane
      const x_orb = r * Math.cos(trueAnomaly);
      const y_orb = r * Math.sin(trueAnomaly);

      // Apply 3D rotations: argument of periapsis, inclination, longitude of ascending node
      const cosΩ = Math.cos(oe.longitudeOfAscendingNode);
      const sinΩ = Math.sin(oe.longitudeOfAscendingNode);
      const cosω = Math.cos(oe.argumentOfPeriapsis);
      const sinω = Math.sin(oe.argumentOfPeriapsis);
      const cosi = Math.cos(oe.inclination);
      const sini = Math.sin(oe.inclination);

      // Transform from orbital plane to 3D space using proper rotation matrices
      const x =
        x_orb * (cosΩ * cosω - sinΩ * sinω * cosi) -
        y_orb * (cosΩ * sinω + sinΩ * cosω * cosi);
      const y = x_orb * sinω * sini + y_orb * cosω * sini;
      const z =
        x_orb * (sinΩ * cosω + cosΩ * sinω * cosi) -
        y_orb * (sinΩ * sinω - cosΩ * cosω * cosi);

      points.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      opacity: 0.3,
      transparent: true,
    });
    const line = new THREE.Line(geometry, material);

    return line;
  }

  /**
   * Creates a ship mesh
   */
  createShipMesh(): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(2, 6, 4);
    const material = this.materialFactory.createShipMaterial();
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Gets the material factory (for updating shader uniforms)
   */
  getMaterialFactory(): MaterialFactory {
    return this.materialFactory;
  }
}
