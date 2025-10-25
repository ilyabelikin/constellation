import {
  Player,
  StarSystem,
  SystemState,
  ASTRONOMICAL_UNIT,
} from "@constellation/shared";

/**
 * Manages the detail view for star gates
 */
export class GateDetailView {
  private panel: HTMLElement;
  private nameElement: HTMLElement;
  private statusElement: HTMLElement;
  private destinationElement: HTMLElement;
  private distanceElement: HTMLElement;
  private periodElement: HTMLElement;

  constructor() {
    this.panel = document.getElementById("gate-details-panel")!;
    this.nameElement = document.getElementById("gate-detail-name")!;
    this.statusElement = document.getElementById("gate-detail-status")!;
    this.destinationElement = document.getElementById(
      "gate-detail-destination"
    )!;
    this.distanceElement = document.getElementById("gate-detail-distance")!;
    this.periodElement = document.getElementById("gate-detail-period")!;
  }

  /**
   * Show the gate detail panel with the given information
   */
  show(
    gate: any,
    player: Player | null,
    system: StarSystem,
    currentState: SystemState
  ): void {
    this.panel.classList.remove("hidden");

    // Check if gate is explored
    const isExplored = player?.exploredGateIds?.includes(gate.id) ?? false;

    // Show "???" for unexplored gates, actual name for explored gates
    this.nameElement.textContent = isExplored ? gate.name : "???";

    // Status
    if (isExplored) {
      this.statusElement.textContent = "Explored ⚡";
    } else {
      this.statusElement.textContent = "Unexplored ◈";
    }

    // Destination
    if (isExplored) {
      // Extract destination star name from gate name (format: "Gate to [Star Name]")
      const destination = gate.name.replace("Gate to ", "");
      this.destinationElement.textContent = destination;
    } else {
      this.destinationElement.textContent = "Unknown";
    }

    // Find gate state for position
    const gateState = currentState.gates?.find((g) => g.id === gate.id);
    if (gateState) {
      // Calculate distance from star (center)
      const distance = Math.sqrt(
        gateState.position.x ** 2 +
          gateState.position.y ** 2 +
          gateState.position.z ** 2
      );
      this.distanceElement.textContent = this.formatDistance(distance);

      // Calculate orbital period
      const orbitalElements = gate.orbitalElements;
      if (orbitalElements && system) {
        const starMass = system.star.mass;
        const GRAVITATIONAL_CONSTANT = 6.6743e-11;
        const orbitalPeriod =
          2 *
          Math.PI *
          Math.sqrt(
            Math.pow(orbitalElements.semiMajorAxis, 3) /
              (GRAVITATIONAL_CONSTANT * starMass)
          );
        const orbitalPeriodDays = orbitalPeriod / 86400;
        this.periodElement.textContent = `${orbitalPeriodDays.toFixed(1)} days`;
      } else {
        this.periodElement.textContent = "Unknown";
      }
    } else {
      this.distanceElement.textContent = "Unknown";
      this.periodElement.textContent = "Unknown";
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
}
