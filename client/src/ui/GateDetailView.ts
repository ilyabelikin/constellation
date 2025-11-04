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
  private ownerRow: HTMLElement;
  private ownerElement: HTMLElement;
  private travelButton: HTMLButtonElement;
  private currentGateId: string | null = null;
  public onTravelClick?: (gateId: string) => void;

  constructor() {
    this.panel = document.getElementById("gate-details-panel")!;
    this.nameElement = document.getElementById("gate-detail-name")!;
    this.statusElement = document.getElementById("gate-detail-status")!;
    this.destinationElement = document.getElementById(
      "gate-detail-destination"
    )!;
    this.distanceElement = document.getElementById("gate-detail-distance")!;
    this.periodElement = document.getElementById("gate-detail-period")!;
    this.ownerRow = document.getElementById("gate-detail-owner-row")!;
    this.ownerElement = document.getElementById("gate-detail-owner")!;
    this.travelButton = document.getElementById(
      "gate-travel-button"
    )! as HTMLButtonElement;

    // Setup button click handler
    this.travelButton.addEventListener("click", () => {
      if (this.currentGateId && this.onTravelClick) {
        this.onTravelClick(this.currentGateId);
      }
    });
  }

  /**
   * Show the gate detail panel with the given information
   */
  show(
    gate: any,
    player: Player | null,
    system: StarSystem,
    currentState: SystemState,
    ownerInfo?: { ownerId: string; ownerName: string; status: string }
  ): void {
    this.panel.classList.remove("hidden");
    this.currentGateId = gate.id;

    // Check if gate is explored by current player
    const isExploredBySelf =
      player?.exploredGateIds?.includes(gate.id) ?? false;

    // Status (check userData for status from gate creation)
    const gateStatus = gate.userData?.status;

    // Determine display based on ownership and exploration
    let travelCost = 0; // Cost in energy

    if (ownerInfo && !isExploredBySelf) {
      // Gate owned by someone else but not explored by us yet
      this.nameElement.textContent = "???";

      // Show diplomatic stance status
      if (ownerInfo.status === "neutral") {
        this.statusElement.textContent =
          "Neutral Gate ● (Maintained by another civilization)";
      } else if (ownerInfo.status === "friendly") {
        this.statusElement.textContent = "Friendly Gate ✓ (Maintained by ally)";
      } else if (ownerInfo.status === "aggressive") {
        this.statusElement.textContent = "Hostile Gate ⚠ (Maintained by enemy)";
      } else {
        this.statusElement.textContent =
          "Occupied Gate (Maintained by another civilization)";
      }

      this.ownerRow.style.display = "block";
      this.ownerElement.textContent = ownerInfo.ownerName;
      travelCost = 0;
    } else if (!isExploredBySelf) {
      // Truly unexplored - no owner, not explored by us
      this.nameElement.textContent = "???";
      this.statusElement.textContent = "Unexplored ◈";
      this.ownerRow.style.display = "none";
      travelCost = 1;
    } else {
      // Explored by us
      this.nameElement.textContent = gate.name;
      // Show status based on ownership
      if (gateStatus === "owned_by_self") {
        this.statusElement.textContent = "Powered by You ⚡";
        this.ownerRow.style.display = "none"; // No need to show owner row when it's in the status
        travelCost = 0;
      } else if (gateStatus === "neutral") {
        this.statusElement.textContent = "Neutral Gate ●";
        this.ownerRow.style.display = "block";
        this.ownerElement.textContent = ownerInfo?.ownerName || "Unknown";
        travelCost = 0;
      } else if (gateStatus === "aggressive") {
        this.statusElement.textContent = "Hostile Gate ⚠";
        this.ownerRow.style.display = "block";
        this.ownerElement.textContent = ownerInfo?.ownerName || "Unknown";
        travelCost = 0;
      } else if (gateStatus === "friendly") {
        this.statusElement.textContent = "Friendly Gate ✓";
        this.ownerRow.style.display = "block";
        this.ownerElement.textContent = ownerInfo?.ownerName || "Unknown";
        travelCost = 0;
      } else {
        // No specific status - show as powered by player if they discovered it
        this.statusElement.textContent = `Powered by ${
          player?.name || "You"
        } ⚡`;
        this.ownerRow.style.display = "none";
        travelCost = 0;
      }
    }

    // Update travel button text with cost
    if (travelCost > 0) {
      this.travelButton.textContent = `⚡ Travel (${travelCost} Energy)`;
    } else {
      this.travelButton.textContent = "Travel (Free)";
    }

    // Check if player has enough energy
    const hasEnoughEnergy = (player?.energy ?? 0) >= travelCost;
    this.travelButton.disabled = !hasEnoughEnergy;

    if (!hasEnoughEnergy && travelCost > 0) {
      this.travelButton.title = `Requires ${travelCost} Energy (you have ${
        player?.energy ?? 0
      })`;
    } else {
      this.travelButton.title = "";
    }

    // Destination
    if (isExploredBySelf) {
      // We explored it - show full destination name
      const destination = gate.name.replace("Gate to ", "");
      this.destinationElement.textContent = destination;
    } else if (ownerInfo) {
      // Someone else owns it - show it's known but we haven't been there
      this.destinationElement.textContent = "Explored by another civilization";
    } else {
      // Truly unexplored
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
