import {
  SystemState,
  ASTRONOMICAL_UNIT,
  Ship,
  StarSystem,
} from "@constellation/shared";

/**
 * Manages the detail view for player ships
 */
export class ShipDetailView {
  private panel: HTMLElement;
  private nameElement: HTMLElement;
  private typeElement: HTMLElement;
  private parentElement: HTMLElement;
  private distanceElement: HTMLElement;
  private velocityElement: HTMLElement;
  private deltaVElement: HTMLElement;
  private periodElement: HTMLElement;

  constructor() {
    this.panel = document.getElementById("ship-details-panel")!;
    this.nameElement = document.getElementById("ship-detail-name")!;
    this.typeElement = document.getElementById("ship-detail-type")!;
    this.parentElement = document.getElementById("ship-detail-parent")!;
    this.distanceElement = document.getElementById("ship-detail-distance")!;
    this.velocityElement = document.getElementById("ship-detail-velocity")!;
    this.deltaVElement = document.getElementById("ship-detail-deltav")!;
    this.periodElement = document.getElementById("ship-detail-period")!;
  }

  /**
   * Show the ship detail panel with the given information
   */
  show(ship: Ship, currentState: SystemState, system: StarSystem): void {
    this.panel.classList.remove("hidden");

    this.nameElement.textContent = "Your Ship";
    this.typeElement.textContent = "Light Cruiser";

    // Find the ship's runtime state for velocity
    const shipState = currentState.ships.find((s) => s.id === ship.id);

    // Find parent body
    const parentBody = currentState.bodies.find(
      (b) => b.id === ship.parentBodyId
    );
    if (parentBody) {
      const parentName =
        system.planets.find((p) => p.id === parentBody.id)?.name ||
        system.moons.find((m) => m.id === parentBody.id)?.name ||
        system.star?.name ||
        "Unknown";

      this.parentElement.textContent = `Orbiting: ${parentName}`;

      // Calculate distance from parent
      if (shipState) {
        const dx = shipState.position.x - parentBody.position.x;
        const dy = shipState.position.y - parentBody.position.y;
        const dz = shipState.position.z - parentBody.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        this.distanceElement.textContent = `Distance: ${this.formatDistance(
          distance
        )}`;
      }
    } else {
      this.parentElement.textContent = "Orbiting: Unknown";
      this.distanceElement.textContent = "Distance: -";
    }

    // Calculate velocity magnitude
    if (shipState) {
      const velocity = Math.sqrt(
        shipState.velocity.x ** 2 +
          shipState.velocity.y ** 2 +
          shipState.velocity.z ** 2
      );
      this.velocityElement.textContent = `Velocity: ${(velocity / 1000).toFixed(
        2
      )} km/s`;
    } else {
      this.velocityElement.textContent = "Velocity: -";
    }

    // Display delta-v budget
    this.deltaVElement.textContent = `Delta-V: ${(ship.deltaV / 1000).toFixed(
      2
    )} km/s`;

    // Calculate and display orbital period
    if (ship.orbitalElements && parentBody) {
      const a = ship.orbitalElements.semiMajorAxis;
      // Simplified period calculation (assuming parent body mass dominates)
      // For more accurate calculation, would need parent body mass
      const period = this.estimateOrbitalPeriod(a);
      this.periodElement.textContent = `Orbital Period: ${this.formatTime(
        period
      )}`;
    } else {
      this.periodElement.textContent = "Orbital Period: -";
    }
  }

  /**
   * Hide the detail panel
   */
  hide(): void {
    this.panel.classList.add("hidden");
  }

  private formatDistance(distance: number): string {
    if (distance > ASTRONOMICAL_UNIT * 0.1) {
      return `${(distance / ASTRONOMICAL_UNIT).toFixed(3)} AU`;
    } else if (distance > 1e6) {
      return `${(distance / 1e6).toFixed(2)} Mm`;
    } else if (distance > 1e3) {
      return `${(distance / 1e3).toFixed(2)} km`;
    } else {
      return `${distance.toFixed(2)} m`;
    }
  }

  private estimateOrbitalPeriod(semiMajorAxis: number): number {
    // Simplified: assume orbiting Earth-like planet
    // T = 2π√(a³/μ) where μ ≈ 4×10^14 for Earth
    const mu = 4e14; // m³/s² (approximate for Earth-like planet)
    const period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
    return period;
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)} s`;
    } else if (seconds < 3600) {
      return `${(seconds / 60).toFixed(1)} min`;
    } else if (seconds < 86400) {
      return `${(seconds / 3600).toFixed(1)} h`;
    } else {
      return `${(seconds / 86400).toFixed(1)} days`;
    }
  }
}
