// Smooth orbiting camera: every parameter eases towards its goal with
// frame-rate independent exponential damping, so all motion feels fluid.

import * as THREE from "three";

export class CameraRig {
  readonly target = new THREE.Vector3();
  readonly goalTarget = new THREE.Vector3();
  distance = 300;
  goalDistance = 300;
  yaw = 0.6;
  goalYaw = 0.6;
  pitch = 0.75;
  goalPitch = 0.75;
  minDistance = 3;
  maxDistance = 4000;
  /** Optional function returning a point to follow each frame. */
  follow: (() => THREE.Vector3 | null) | null = null;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  update(dt: number): void {
    if (this.follow) {
      const p = this.follow();
      if (p) this.goalTarget.copy(p);
    }
    const k = 1 - Math.exp(-dt * 6);
    const kFast = 1 - Math.exp(-dt * 10);
    this.target.lerp(this.goalTarget, this.follow ? kFast : k);
    this.distance += (this.goalDistance - this.distance) * k;
    this.yaw += (this.goalYaw - this.yaw) * kFast;
    this.pitch += (this.goalPitch - this.pitch) * kFast;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + this.distance * cp * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * cp * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.target);
  }

  rotate(dx: number, dy: number): void {
    this.goalYaw -= dx * 0.005;
    this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + dy * 0.005, -1.45, 1.52);
  }

  pan(dx: number, dy: number): void {
    this.follow = null;
    const scale = this.distance * 0.0016;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.goalTarget.addScaledVector(right, -dx * scale).addScaledVector(fwd, dy * scale);
  }

  zoom(factor: number): void {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, this.minDistance, this.maxDistance);
  }

  focus(point: THREE.Vector3, distance?: number): void {
    this.goalTarget.copy(point);
    if (distance !== undefined) this.goalDistance = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
  }

  snap(): void {
    this.target.copy(this.goalTarget);
    this.distance = this.goalDistance;
    this.yaw = this.goalYaw;
    this.pitch = this.goalPitch;
  }
}
