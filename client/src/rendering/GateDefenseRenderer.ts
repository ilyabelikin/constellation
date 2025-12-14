import * as THREE from "three";
import { GateDefense, GateAttack } from "@constellation/shared";

/**
 * Manages rendering of gate defense platforms and combat animations
 */
export class GateDefenseRenderer {
  private scene: THREE.Scene;
  private gateGroups: Map<string, THREE.Group>;
  private playerId: string | null = null;

  // Map of gate ID to defense platforms
  private defensePlatforms: Map<string, DefensePlatform[]> = new Map();

  // Map of gate ID to owner ID (for coloring platforms)
  private gateOwners: Map<string, string> = new Map();

  // Active attacks
  private activeAttacks: Map<string, AttackAnimation> = new Map();

  // Buffer for defenses that arrive before gates are loaded
  private pendingDefenses: GateDefense[] = [];

  constructor(scene: THREE.Scene, gateGroups: Map<string, THREE.Group>) {
    this.scene = scene;
    this.gateGroups = gateGroups;
  }

  /**
   * Set the current player ID for determining friendly vs enemy colors
   */
  setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  /**
   * Set gate ownership information
   */
  setGateOwner(gateId: string, ownerId: string): void {
    this.gateOwners.set(gateId, ownerId);
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

    // Check if this defense platform already exists (prevent duplicates on system refresh)
    const existingPlatform = platforms.find((p) => p.id === defense.id);
    if (existingPlatform) {
      return; // Skip duplicates silently
    }

    const platformIndex = platforms.length;

    // Determine if this platform is friendly or enemy
    const gateOwnerId = this.gateOwners.get(defense.gateId);
    const isEnemy = gateOwnerId !== this.playerId;

    const platform = new DefensePlatform(
      gateGroup,
      platformIndex,
      platforms.length + 1,
      defense.id,
      isEnemy
    );

    platforms.push(platform);
    this.defensePlatforms.set(defense.gateId, platforms);

    // Reposition ALL platforms to distribute them evenly around the gate
    platforms.forEach((p, index) => {
      p.updatePosition(index, platforms.length);
    });

    console.log(
      `Added defense platform ${defense.id} to gate ${defense.gateId} (total: ${platforms.length})`
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
   * Remove destroyed platforms from the map
   * This is called after system state refresh to clean up platforms that were destroyed in combat
   */
  cleanupDestroyedPlatforms(): void {
    for (const [gateId, platforms] of this.defensePlatforms.entries()) {
      // Filter out destroyed platforms
      const alivePlatforms = platforms.filter(p => !p.isDestroyed());
      
      if (alivePlatforms.length !== platforms.length) {
        // Some platforms were destroyed - dispose them and update the map
        const destroyedPlatforms = platforms.filter(p => p.isDestroyed());
        for (const platform of destroyedPlatforms) {
          platform.dispose();
        }
        
        // Update the map with only alive platforms
        this.defensePlatforms.set(gateId, alivePlatforms);
        
        // Reposition remaining platforms
        alivePlatforms.forEach((p, index) => {
          p.updatePosition(index, alivePlatforms.length);
        });
        
        console.log(
          `[GateDefenseRenderer] Cleaned up ${destroyedPlatforms.length} destroyed platforms from gate ${gateId}`
        );
      }
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
   * Check if a gate has an active attack
   */
  hasActiveAttack(gateId: string): boolean {
    for (const [attackId, animation] of this.activeAttacks.entries()) {
      // Check if any active attack is targeting this gate
      // We need to get the gate ID from the animation somehow
      // For now, we can check if the attack ID includes the gate ID or track it differently
    }
    return this.activeAttacks.size > 0; // Temporary: block all travel if any attack is active
  }

  /**
   * Start an attack animation
   */
  startAttack(attack: GateAttack): void {
    // Check if this attack animation already exists (prevent duplicates)
    if (this.activeAttacks.has(attack.id)) {
      console.log(`Attack animation ${attack.id} already exists, skipping duplicate`);
      return;
    }

    const gateGroup = this.gateGroups.get(attack.gateId);
    if (!gateGroup) {
      console.warn(`Cannot start attack: gate ${attack.gateId} not found`);
      return;
    }

    const defenses = this.defensePlatforms.get(attack.gateId) || [];

    // Determine if this is the player's attack (for coloring ships)
    const isPlayerAttacking = attack.attackerId === this.playerId;

    const animation = new AttackAnimation(
      this.scene,
      gateGroup,
      attack,
      defenses,
      isPlayerAttacking
    );

    this.activeAttacks.set(attack.id, animation);

    console.log(
      `Started attack animation ${attack.id} on gate ${attack.gateId} (player attacking: ${isPlayerAttacking})`
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
    const platforms = this.defensePlatforms.get(gateId) || [];
    // Only count non-destroyed platforms
    return platforms.filter(p => !p.isDestroyed()).length;
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
    id: string,
    isEnemy: boolean = false
  ) {
    this.id = id;
    this.index = index;
    this.totalCount = totalCount;
    this.group = new THREE.Group();

    // Distribute platforms evenly around the gate
    this.orbitAngle = (index / totalCount) * Math.PI * 2;

    // Color based on ownership: blue for friendly, red for enemy
    const platformColor = isEnemy ? 0xff4444 : 0x4444ff;

    // Create platform mesh (colored octahedron)
    const geometry = new THREE.OctahedronGeometry(2, 0);
    const material = new THREE.MeshBasicMaterial({
      color: platformColor,
      transparent: true,
      opacity: 0.8,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.group.add(this.mesh);

    // Add colored point light
    this.light = new THREE.PointLight(platformColor, 0.5, 30);
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
    defenses: DefensePlatform[],
    isPlayerAttacking: boolean = false
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
      const ship = new AttackShip(
        this.group,
        i,
        attack.attackShipCount,
        isPlayerAttacking
      );
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

    console.log(`[Combat] Applying ${events.length} combat events`);

    // Delay combat events until ships finish approaching
    // Ships approach at 0.5 speed, so they reach gate at progress=1, which takes ~2 seconds
    const APPROACH_TIME = 2000; // 2 seconds for ships to reach gate

    // Schedule combat events AFTER approach completes
    for (const event of events) {
      const delay = APPROACH_TIME + event.time;
      console.log(`[Combat] Scheduling event ${event.type} at ${delay}ms`);
      setTimeout(() => {
        this.handleCombatEvent(event);
      }, delay);
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
    console.log(`[Combat] Handling event: ${event.type}, targetId: ${event.targetId}`);
    
    if (event.type === "shipHit" && event.targetId) {
      // Ship hit a defense platform - create projectile from random ship to defense
      // Only fire from ships that have finished approaching (are orbiting)
      const aliveShips = this.attackShips.filter(
        (s) => !s.isDestroyed() && !s.getIsApproaching()
      );
      console.log(`[Combat] shipHit - alive ships not approaching: ${aliveShips.length}/${this.attackShips.length}`);
      if (aliveShips.length > 0) {
        const ship = aliveShips[Math.floor(Math.random() * aliveShips.length)];
        const defense = this.defenses.find((d) => d.id === event.targetId);
        if (defense) {
          console.log(`[Combat] Creating RED projectile from ship to defense`);
          const projectile = new Projectile(
            this.group,
            ship.getWorldPosition(),
            defense.getWorldPosition(),
            0xff0000 // Red for ship fire
          );
          this.projectiles.push(projectile);
        } else {
          console.warn(`[Combat] Defense ${event.targetId} not found`);
        }
      }
    } else if (event.type === "defenseHit" && event.targetId) {
      // Defense hit a ship - create projectile from defense to random ship
      // Only fire at ships that have finished approaching (are orbiting)
      const defense = this.defenses.find((d) => d.id === event.targetId);
      const aliveShips = this.attackShips.filter(
        (s) => !s.isDestroyed() && !s.getIsApproaching()
      );
      console.log(`[Combat] defenseHit - alive ships not approaching: ${aliveShips.length}/${this.attackShips.length}`);
      if (defense && aliveShips.length > 0) {
        const ship = aliveShips[Math.floor(Math.random() * aliveShips.length)];
        console.log(`[Combat] Creating BLUE projectile from defense to ship`);
        const projectile = new Projectile(
          this.group,
          defense.getWorldPosition(),
          ship.getWorldPosition(),
          0x0000ff // Blue for defense fire
        );
        this.projectiles.push(projectile);
      } else {
        console.warn(`[Combat] Defense not found or no alive ships`);
      }
    } else if (event.type === "shipDestroyed") {
      // Destroy a random alive ship
      const aliveShips = this.attackShips.filter((s) => !s.isDestroyed());
      console.log(`[Combat] shipDestroyed - destroying 1 of ${aliveShips.length} alive ships`);
      if (aliveShips.length > 0) {
        const ship = aliveShips[Math.floor(Math.random() * aliveShips.length)];
        ship.destroy();
      }
    } else if (event.type === "defenseDestroyed" && event.targetId) {
      // Defense destroyed - trigger explosion animation
      const defense = this.defenses.find((d) => d.id === event.targetId);
      console.log(`[Combat] defenseDestroyed - defense found: ${!!defense}`);
      if (defense) {
        defense.destroy();
      }
    }
  }

  /**
   * Mark the attack as complete
   */
  markComplete(outcome: "attacker_victory" | "defender_victory"): void {
    console.log(`[Combat] Attack marked complete: ${outcome}`);
    this.outcome = outcome;
    // Wait for approach (2s) + combat duration + explosions to finish
    // Don't mark complete until all visual effects are done
    setTimeout(() => {
      this.complete = true;
    }, 6000); // 2s approach + 3s combat + 1s cleanup
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

  // Approach animation (flying in from off-screen)
  private isApproaching: boolean = true;
  private approachProgress: number = 0;
  private startPosition: THREE.Vector3;
  private targetPosition: THREE.Vector3;

  constructor(
    parent: THREE.Group,
    index: number,
    totalCount: number,
    isPlayerShip: boolean = false
  ) {
    this.group = new THREE.Group();
    this.orbitAngle = (index / totalCount) * Math.PI * 2;

    // Vary orbit radius so ships spread out at different distances
    this.orbitRadius = 20 + Math.random() * 10; // 20-30 units from gate

    // Color based on ownership: blue for your ships, red for enemy ships
    const shipColor = isPlayerShip ? 0x4444ff : 0xff4444;

    // Create ship mesh (colored cone)
    const geometry = new THREE.ConeGeometry(1, 3, 4);
    const material = new THREE.MeshBasicMaterial({
      color: shipColor,
      transparent: true,
      opacity: 0.9,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = Math.PI / 2; // Point forward
    this.group.add(this.mesh);

    // Add colored point light
    this.light = new THREE.PointLight(shipColor, 0.5, 20);
    this.group.add(this.light);

    parent.add(this.group);

    // Start from random off-screen position (like mining drones)
    const spawnDistance = 200 + Math.random() * 100; // 200-300 units away
    const spawnAngle = Math.random() * Math.PI * 2;
    this.startPosition = new THREE.Vector3(
      Math.cos(spawnAngle) * spawnDistance,
      (Math.random() - 0.5) * 100, // Random vertical offset
      Math.sin(spawnAngle) * spawnDistance
    );

    // Add some random angle variation so ships don't all line up perfectly
    const angleVariation = (Math.random() - 0.5) * 0.5; // +/- ~15 degrees
    this.orbitAngle += angleVariation;

    // Target orbit position with varied radius and angle
    this.targetPosition = new THREE.Vector3(
      Math.cos(this.orbitAngle) * this.orbitRadius,
      (Math.random() - 0.5) * 4, // Small vertical variation
      Math.sin(this.orbitAngle) * this.orbitRadius
    );

    // Set initial position
    this.group.position.copy(this.startPosition);
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
      
      // Hide completely after explosion
      if (this.explosionProgress >= 1) {
        this.group.visible = false;
      }
      return;
    }

    // Approach phase: fly from off-screen to orbit position
    if (this.isApproaching) {
      this.approachProgress += deltaTime * 0.5; // Approach speed

      if (this.approachProgress >= 1) {
        // Reached orbit position
        console.log(`[Combat] Ship finished approaching, ready to fight`);
        this.isApproaching = false;
        this.approachProgress = 1;
      }

      // Smooth easing
      const easedProgress = this.easeInOutCubic(this.approachProgress);

      // Lerp from start to target position
      this.group.position.lerpVectors(
        this.startPosition,
        this.targetPosition,
        easedProgress
      );

      // Point ship toward target
      const direction = new THREE.Vector3()
        .subVectors(this.targetPosition, this.group.position)
        .normalize();
      this.mesh.lookAt(this.group.position.clone().add(direction));

      return;
    }

    // Orbit phase: circle the gate
    this.orbitAngle += this.orbitSpeed * deltaTime;

    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;
    this.group.position.set(x, this.targetPosition.y, z);

    // Point nose toward the gate center (aggressive attack posture)
    const targetDirection = new THREE.Vector3(0, 0, 0);
    this.group.lookAt(targetDirection);
  }

  /**
   * Destroy this ship
   */
  destroy(): void {
    console.log(`[Combat] Ship destroyed (was approaching: ${this.isApproaching})`);
    this.destroyed = true;
  }

  /**
   * Check if ship is destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed || this.explosionProgress >= 1;
  }

  /**
   * Check if ship is still approaching (not yet in combat position)
   */
  getIsApproaching(): boolean {
    return this.isApproaching;
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
   * Easing function for smooth approach animation
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
