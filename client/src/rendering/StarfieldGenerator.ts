import * as THREE from "three";

/**
 * Generates a spherical starfield background with varied colors
 */
export class StarfieldGenerator {
  /**
   * Creates a starfield as a sphere of points with varied colors
   * @param radius - Radius of the starfield sphere
   * @param count - Number of stars to generate
   * @returns THREE.Points mesh representing the starfield
   */
  createStarfield(radius: number = 50000, count: number = 10000): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    // Star color palette (different star types)
    const starColors = [
      { r: 0.6, g: 0.7, b: 1.0 }, // Blue (hot stars)
      { r: 0.8, g: 0.9, b: 1.0 }, // Blue-white
      { r: 1.0, g: 1.0, b: 1.0 }, // White
      { r: 1.0, g: 1.0, b: 0.9 }, // Yellowish-white
      { r: 1.0, g: 0.9, b: 0.7 }, // Yellow
      { r: 1.0, g: 0.8, b: 0.6 }, // Orange
      { r: 1.0, g: 0.7, b: 0.5 }, // Red-orange
    ];

    for (let i = 0; i < count; i++) {
      // Generate random point on sphere surface using spherical coordinates
      const theta = Math.random() * Math.PI * 2; // Azimuthal angle
      const phi = Math.acos(2 * Math.random() - 1); // Polar angle

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      vertices.push(x, y, z);

      // Random color from palette
      const color = starColors[Math.floor(Math.random() * starColors.length)];
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });

    return new THREE.Points(geometry, material);
  }
}
