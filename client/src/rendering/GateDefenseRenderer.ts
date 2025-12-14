import * as THREE from "three";
import { GateDefense, GateAttack } from "@constellation/shared";

/**
 * Manages rendering of gate defense platforms and combat animations
 */
export class GateDefenseRenderer {
  private scene: THREE.Scene;
  private gateGroups: Map<string, THREE.Group>;

  // Map of gate ID to defense platforms
  private defensePlatforms: Map<string, DefensePlatform[]> = new Map();

  // Active attacks
  private activeAttacks: Map<string, AttackAnimation> = new Map();

  // Buffer for defenses that arrive before gates are loaded
  private pendingDefenses: GateDefense[] = [];

  constructor(scene: THREE.Scene, gateGroups: Map<string, THREE.Group>) {
    this.scene = scene;
    this.gateGroups = gateGroups;
  }

  /**
   * Add a defense platform to a gate
   */
  addDefensePlatform(defense: GateDefense): void {
    const gateGroup = this.gateGroups.get(defense.gateId);
    if (!gateGroup) {
      console.warn(
        `Gate ${defense.gateId} not loaded yet, buffering defense ${defense.id}`
      );
      // Buffer this defense to be added later when gates are loaded
      this.pendingDefenses.push(defense);
      return;
    }

    const platforms = this.defensePlatforms.get(defense.gateId) || [];
    const platformIndex = platforms.length;

    const platform = new DefensePlatform(
      gateGroup,
      platformIndex,
      platforms.length + 1,
      defense.id
    );

    platforms.push(platform);
    this.defensePlatforms.set(defense.gateId, platforms);

    console.log(
      `Added defense platform ${defense.id} to gate ${defense.gateId}`
    );
  }

  /**
   * Process any pending defenses that were buffered
   * Called after gates are loaded
   */
  processPendingDefenses(): void {
    if (this.pendingDefenses.length === 0) return;

    console.log(
      `Processing ${this.pendingDefenses.length} pending defense platforms`
    );

    const toAdd = [...this.pendingDefenses];
    this.pendingDefenses = [];

    for (const defense of toAdd) {
      this.addDefensePlatform(defense);
    }
  }

  /**
   * Remove a defense platform
   */
  removeDefensePlatform(gateId: string, defenseId: string): void {
    const platforms = this.defensePlatforms.get(gateId);
    if (!platforms) return;

    const platform = platforms.find((p) => p.id === defenseId);
    if (platform) {
      platform.dispose();
      const newPlatforms = platforms.filter((p) => p.id !== defenseId);
      this.defensePlatforms.set(gateId, newPlatforms);

      // Reposition remaining platforms
      newPlatforms.forEach((p, index) => {
        p.updatePosition(index, newPlatforms.length);
      });
    }
  }

  /**
   * Clear all defenses (used when switching systems)
   */
  clearAll(): void {
    // Dispose all platforms
    for (const platforms of this.defensePlatforms.values()) {
      for (const platform of platforms) {
        platform.dispose();
      }
    }
    this.defensePlatforms.clear();

    // Dispose all attacks
    for (const attack of this.activeAttacks.values()) {
      attack.dispose();
    }
    this.activeAttacks.clear();

    // Clear pending defenses
    this.pendingDefenses = [];
  }

  /**
   * Start an attack animation
   */
  startAttack(attack: GateAttack): void {
    const gateGroup = this.gateGroups.get(attack.gateId);
    if (!gateGroup) {
      console.warn(`Cannot start attack: gate ${attack.gateId} not found`);
      return;
    }

    const defenses = this.defensePlatforms.get(attack.gateId) || [];

    const animation = new AttackAnimation(
      this.scene,
      gateGroup,
      attack,
      defenses
    );

    this.activeAttacks.set(attack.id, animation);

    console.log(
      `Started attack animation ${attack.id} on gate ${attack.gateId}`
    );
  }

  /**
   * Update an ongoing attack with combat events
   */
  updateAttack(attack: GateAttack): void {
    const animation = this.activeAttacks.get(attack.id);
    if (!animation) {
      console.warn(`Attack animation ${attack.id} not found`);
      return;
    }

    // Parse combat log and apply events
    if (attack.combatLog) {
      try {
        const combatEvents = JSON.parse(attack.combatLog);
        animation.applyCombatEvents(combatEvents);
      } catch (error) {
        console.error("Failed to parse combat log:", error);
      }
    }

    // If attack is complete, mark animation as ending
    if (attack.status !== "in_progress") {
      animation.markComplete(attack.status);

      // Clean up destroyed defense platforms after animation completes
      setTimeout(() => {
        const platforms = this.defensePlatforms.get(attack.gateId);
        if (platforms) {
          const remainingPlatforms = platforms.filter((p) => !p.isDestroyed());

          // Remove destroyed platforms from scene
          platforms.forEach((p) => {
            if (p.isDestroyed()) {
              p.dispose();
            }
          });

          // Update platforms array
          this.defensePlatforms.set(attack.gateId, remainingPlatforms);

          // Reposition remaining platforms
          remainingPlatforms.forEach((p, index) => {
            p.updatePosition(index, remainingPlatforms.length);
          });
        }
      }, 2500); // Wait for explosion animations to complete
    }
  }

  /**
   * Get defense count for a gate
   */
  getDefenseCount(gateId: string): number {
    return this.defensePlatforms.get(gateId)?.length || 0;
  }

  /**
   * Update all animations
   */
  update(deltaTime: number): void {
    // Update defense platform orbits
    for (const platforms of this.defensePlatforms.values()) {
      for (const platform of platforms) {
        platform.animate(deltaTime);
      }
    }

    // Update attack animations
    const toRemove: string[] = [];
    for (const [attackId, animation] of this.activeAttacks.entries()) {
      animation.animate(deltaTime);

      if (animation.isComplete()) {
        animation.dispose();
        toRemove.push(attackId);
      }
    }

    // Clean up completed attacks
    for (const attackId of toRemove) {
      this.activeAttacks.delete(attackId);
    }
  }

  /**
   * Set visibility of all defense elements
   */
  setVisible(visible: boolean): void {
    for (const platforms of this.defensePlatforms.values()) {
      for (const platform of platforms) {
        platform.setVisible(visible);
      }
    }

    for (const animation of this.activeAttacks.values()) {
      animation.setVisible(visible);
    }
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    for (const platforms of this.defensePlatforms.values()) {
      for (const platform of platforms) {
        platform.dispose();
      }
    }
    this.defensePlatforms.clear();

    for (const animation of this.activeAttacks.values()) {
      animation.dispose();
    }
    this.activeAttacks.clear();
  }
}

/**
 * A defensive platform orbiting a gate
 */
class DefensePlatform {
  private group: THREE.Group;
  private mesh: THREE.Mesh;
  private light: THREE.PointLight;
  private orbitAngle: number = 0;
  private orbitRadius: number = 15; // Distance from gate
  private orbitSpeed: number = 0.5; // Radians per second
  public id: string;
  private index: number;
  private totalCount: number;
  private destroyed: boolean = false;
  private explosionProgress: number = 0;

  constructor(
    parent: THREE.Group,
    index: number,
    totalCount: number,
    id: string
  ) {
    this.id = id;
    this.index = index;
    this.totalCount = totalCount;
    this.group = new THREE.Group();

    // Distribute platforms evenly around the gate
    this.orbitAngle = (index / totalCount) * Math.PI * 2;

    // Create platform mesh (blue octahedron)
    const geometry = new THREE.OctahedronGeometry(2, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0x4444ff,
      transparent: true,
      opacity: 0.8,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.group.add(this.mesh);

    // Add blue point light
    this.light = new THREE.PointLight(0x4444ff, 0.5, 30);
    this.group.add(this.light);

    parent.add(this.group);
    this.updatePosition(index, totalCount);
  }

  /**
   * Update position in orbit
   */
  updatePosition(index: number, totalCount: number): void {
    this.index = index;
    this.totalCount = totalCount;
    this.orbitAngle = (index / totalCount) * Math.PI * 2;

    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;
    this.group.position.set(x, 0, z);
  }

  /**
   * Animate the platform orbit
   */
  animate(deltaTime: number): void {
    if (this.destroyed) {
      // Explosion animation
      this.explosionProgress += deltaTime * 2; // 0.5 second explosion

      if (this.explosionProgress < 1) {
        // Scale up and fade out
        const scale = 1 + this.explosionProgress * 2;
        this.mesh.scale.set(scale, scale, scale);

        const material = this.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.8 * (1 - this.explosionProgress);

        this.light.intensity = 0.5 * (1 - this.explosionProgress);
      } else {
        // Hide after explosion
        this.group.visible = false;
      }
      return;
    }

    this.orbitAngle += this.orbitSpeed * deltaTime;

    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;
    this.group.position.set(x, 0, z);

    // Rotate the platform itself
    this.mesh.rotation.y += deltaTime;
  }

  /**
   * Destroy the platform
   */
  destroy(): void {
    this.destroyed = true;
  }

  /**
   * Check if platform is destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Set visibility
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Get current world position
   */
  getWorldPosition(): THREE.Vector3 {
    const worldPos = new THREE.Vector3();
    this.group.getWorldPosition(worldPos);
    return worldPos;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

/**
 * An attack animation with ships firing at defense platforms
 */
class AttackAnimation {
  private scene: THREE.Scene;
  private gateGroup: THREE.Group;
  private group: THREE.Group;
  private attack: GateAttack;
  private defenses: DefensePlatform[];

  private attackShips: AttackShip[] = [];
  private projectiles: Projectile[] = [];

  private elapsed: number = 0;
  private complete: boolean = false;
  private combatEventsApplied: boolean = false;
  private outcome: "attacker_victory" | "defender_victory" | null = null;

  constructor(
    scene: THREE.Scene,
    gateGroup: THREE.Group,
    attack: GateAttack,
    defenses: DefensePlatform[]
  ) {
    this.scene = scene;
    this.gateGroup = gateGroup;
    this.attack = attack;
    this.defenses = defenses;
    this.group = new THREE.Group();

    // Position group at gate location
    this.group.position.copy(gateGroup.position);
    this.scene.add(this.group);

    // Create attacking ships
    for (let i = 0; i < attack.attackShipCount; i++) {
      const ship = new AttackShip(this.group, i, attack.attackShipCount);
      this.attackShips.push(ship);
    }
  }

  /**
   * Apply combat events from server
   */
  applyCombatEvents(
    events: Array<{
      time: number;
      type: string;
      targetId?: string;
      damage?: number;
    }>
  ): void {
    if (this.combatEventsApplied) return;
    this.combatEventsApplied = true;

    // Schedule combat events
    for (const event of events) {
      setTimeout(() => {
        this.handleCombatEvent(event);
      }, event.time);
    }
  }

  /**
   * Handle a single combat event
   */
  private handleCombatEvent(event: {
    type: string;
    targetId?: string;
    damage?: number;
  }): void {
    if (event.type === "shipHit" && event.targetId) {
      // Ship hit a defense platform - create projectile from random ship to defense
      const aliveShips = this.attackShips.filter((s) => !s.isDestroyed());
      if (aliveShips.length > 0) {
        const ship = aliveShips[Math.floor(Math.random() * aliveShips.length)];
        const defense = this.defenses.find((d) => d.id === event.targetId);
        if (defense) {
          const projectile = new Projectile(
            this.group,
            ship.getWorldPosition(),
            defense.getWorldPosition(),
            0xff0000 // Red for ship fire
          );
          this.projectiles.push(projectile);
        }
      }
    } else if (event.type === "defenseHit" && event.targetId) {
      // Defense hit a ship - create projectile from defense to random ship
      const defense = this.defenses.find((d) => d.id === event.targetId);
      const aliveShips = this.attackShips.filter((s) => !s.isDestroyed());
      if (defense && aliveShips.length > 0) {
        const ship = aliveShips[Math.floor(Math.random() * aliveShips.length)];
        const projectile = new Projectile(
          this.group,
          defense.getWorldPosition(),
          ship.getWorldPosition(),
          0x0000ff // Blue for defense fire
        );
        this.projectiles.push(projectile);
      }
    } else if (event.type === "shipDestroyed") {
      // Destroy a random alive ship
      const aliveShips = this.attackShips.filter((s) => !s.isDestroyed());
      if (aliveShips.length > 0) {
        const ship = aliveShips[Math.floor(Math.random() * aliveShips.length)];
        ship.destroy();
      }
    } else if (event.type === "defenseDestroyed" && event.targetId) {
      // Defense destroyed - trigger explosion animation
      const defense = this.defenses.find((d) => d.id === event.targetId);
      if (defense) {
        defense.destroy();
      }
    }
  }

  /**
   * Mark the attack as complete
   */
  markComplete(outcome: "attacker_victory" | "defender_victory"): void {
    this.outcome = outcome;
    // Give some time for animations to finish
    setTimeout(() => {
      this.complete = true;
    }, 2000);
  }

  /**
   * Animate the attack
   */
  animate(deltaTime: number): void {
    this.elapsed += deltaTime;

    // Update group position to follow gate
    this.group.position.copy(this.gateGroup.position);

    // Animate ships
    for (const ship of this.attackShips) {
      ship.animate(deltaTime);
    }

    // Animate projectiles
    const toRemove: Projectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.animate(deltaTime);
      if (projectile.isComplete()) {
        projectile.dispose();
        toRemove.push(projectile);
      }
    }

    // Remove completed projectiles
    for (const projectile of toRemove) {
      const index = this.projectiles.indexOf(projectile);
      if (index > -1) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  /**
   * Check if animation is complete
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Set visibility
   */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Clean up
   */
  dispose(): void {
    for (const ship of this.attackShips) {
      ship.dispose();
    }
    this.attackShips = [];

    for (const projectile of this.projectiles) {
      projectile.dispose();
    }
    this.projectiles = [];

    this.scene.remove(this.group);
  }
}

/**
 * An attacking ship
 */
class AttackShip {
  private group: THREE.Group;
  private mesh: THREE.Mesh;
  private light: THREE.PointLight;
  private orbitAngle: number;
  private orbitRadius: number = 25;
  private orbitSpeed: number = 0.3;
  private destroyed: boolean = false;
  private explosionProgress: number = 0;

  constructor(parent: THREE.Group, index: number, totalCount: number) {
    this.group = new THREE.Group();
    this.orbitAngle = (index / totalCount) * Math.PI * 2;

    // Create ship mesh (red cone)
    const geometry = new THREE.ConeGeometry(1, 3, 4);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.9,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = Math.PI / 2; // Point forward
    this.group.add(this.mesh);

    // Add red point light
    this.light = new THREE.PointLight(0xff0000, 0.5, 20);
    this.group.add(this.light);

    parent.add(this.group);
  }

  /**
   * Animate ship movement
   */
  animate(deltaTime: number): void {
    if (this.destroyed) {
      // Explosion animation
      this.explosionProgress += deltaTime * 2;
      const opacity = Math.max(0, 1 - this.explosionProgress);
      (this.mesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.9;
      this.light.intensity = opacity * 0.5;

      // Expand slightly
      const scale = 1 + this.explosionProgress * 2;
      this.mesh.scale.set(scale, scale, scale);
      return;
    }

    this.orbitAngle += this.orbitSpeed * deltaTime;

    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;
    this.group.position.set(x, 0, z);

    // Orient towards center
    this.group.lookAt(0, 0, 0);
  }

  /**
   * Destroy this ship
   */
  destroy(): void {
    this.destroyed = true;
  }

  /**
   * Check if ship is destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed || this.explosionProgress >= 1;
  }

  /**
   * Get world position
   */
  getWorldPosition(): THREE.Vector3 {
    const worldPos = new THREE.Vector3();
    this.group.getWorldPosition(worldPos);
    return worldPos;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

/**
 * A projectile (laser beam)
 */
class Projectile {
  private line: THREE.Line;
  private progress: number = 0;
  private duration: number = 0.3; // 300ms to travel
  private complete: boolean = false;

  constructor(
    parent: THREE.Group,
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: number
  ) {
    // Convert world positions to local positions
    const localStart = parent.worldToLocal(start.clone());
    const localEnd = parent.worldToLocal(end.clone());

    const geometry = new THREE.BufferGeometry().setFromPoints([
      localStart,
      localEnd,
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
    });
    this.line = new THREE.Line(geometry, material);
    parent.add(this.line);
  }

  /**
   * Animate projectile
   */
  animate(deltaTime: number): void {
    this.progress += deltaTime / this.duration;

    if (this.progress >= 1) {
      this.complete = true;
      return;
    }

    // Fade out over time
    const opacity = 1 - this.progress;
    (this.line.material as THREE.LineBasicMaterial).opacity = opacity;
  }

  /**
   * Check if complete
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    if (this.line.parent) {
      this.line.parent.remove(this.line);
    }
  }
}
