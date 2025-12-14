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
  private tunnelControlRow: HTMLElement;
  private gateAOwnerElement: HTMLElement;
  private gateBOwnerElement: HTMLElement;
  private tunnelPowerElement: HTMLElement;
  private defenseRow: HTMLElement;
  private defenseCountElement: HTMLElement;
  private blockadeRow: HTMLElement;
  private blockadeInfoElement: HTMLElement;
  private travelButton: HTMLButtonElement;
  private fortifyButton: HTMLButtonElement;
  private attackButton: HTMLButtonElement;
  private overtakeButton: HTMLButtonElement;
  private overtakeCooldownDiv: HTMLElement;
  private overtakeCooldownTimeSpan: HTMLElement;
  private debugConnectButton: HTMLButtonElement;
  private cooldownUpdateInterval: number | null = null;
  private currentGateId: string | null = null;
  private isDebugMode: boolean = false;
  public onTravelClick?: (gateId: string) => void;
  public onFortifyClick?: (gateId: string) => void;
  public onAttackClick?: (gateId: string) => void;
  public onOvertakeClick?: (gateId: string) => void;
  public onDebugConnectClick?: (gateId: string) => void;

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
    this.tunnelControlRow = document.getElementById(
      "gate-detail-tunnel-control-row"
    )!;
    this.gateAOwnerElement = document.getElementById(
      "gate-detail-gate-a-owner"
    )!;
    this.gateBOwnerElement = document.getElementById(
      "gate-detail-gate-b-owner"
    )!;
    this.tunnelPowerElement = document.getElementById(
      "gate-detail-tunnel-power"
    )!;
    this.defenseRow = document.getElementById("gate-detail-defense-row")!;
    this.defenseCountElement = document.getElementById(
      "gate-detail-defense-count"
    )!;
    this.blockadeRow = document.getElementById("gate-detail-blockade-row")!;
    this.blockadeInfoElement = document.getElementById(
      "gate-detail-blockade-info"
    )!;
    this.travelButton = document.getElementById(
      "gate-travel-button"
    )! as HTMLButtonElement;
    this.fortifyButton = document.getElementById(
      "gate-fortify-button"
    )! as HTMLButtonElement;
    this.attackButton = document.getElementById(
      "gate-attack-button"
    )! as HTMLButtonElement;
    this.overtakeButton = document.getElementById(
      "gate-overtake-button"
    )! as HTMLButtonElement;
    this.overtakeCooldownDiv = document.getElementById(
      "gate-overtake-cooldown"
    )!;
    this.overtakeCooldownTimeSpan = document.getElementById(
      "gate-overtake-cooldown-time"
    )!;
    this.debugConnectButton = document.getElementById(
      "gate-debug-connect-button"
    )! as HTMLButtonElement;

    // Check if debug mode is enabled (check for debug_mode parameter in URL)
    const urlParams = new URLSearchParams(window.location.search);
    this.isDebugMode = urlParams.has("debug_mode");
    console.log(`[GateDetailView] Debug mode: ${this.isDebugMode}`);

    // Setup button click handlers
    this.travelButton.addEventListener("click", () => {
      if (this.currentGateId && this.onTravelClick) {
        this.onTravelClick(this.currentGateId);
      }
    });

    this.fortifyButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling
      if (
        this.currentGateId &&
        this.onFortifyClick &&
        !this.fortifyButton.disabled
      ) {
        console.log(
          "[GateDetailView] Fortify button clicked for gate:",
          this.currentGateId
        );
        // Temporarily disable to prevent double-clicks
        this.fortifyButton.disabled = true;
        this.onFortifyClick(this.currentGateId);
        // Re-enable after a short delay
        setTimeout(() => {
          this.fortifyButton.disabled = false;
        }, 1000);
      }
    });

    this.attackButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling
      if (
        this.currentGateId &&
        this.onAttackClick &&
        !this.attackButton.disabled
      ) {
        console.log(
          "[GateDetailView] Attack button clicked for gate:",
          this.currentGateId
        );
        // Temporarily disable to prevent double-clicks
        this.attackButton.disabled = true;
        this.onAttackClick(this.currentGateId);
        // Re-enable after a short delay
        setTimeout(() => {
          this.attackButton.disabled = false;
        }, 1000);
      }
    });

    this.overtakeButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling
      if (
        this.currentGateId &&
        this.onOvertakeClick &&
        !this.overtakeButton.disabled
      ) {
        console.log(
          "[GateDetailView] Overtake button clicked for gate:",
          this.currentGateId
        );
        // Temporarily disable to prevent double-clicks
        this.overtakeButton.disabled = true;
        this.onOvertakeClick(this.currentGateId);
        // Re-enable after a short delay
        setTimeout(() => {
          this.overtakeButton.disabled = false;
        }, 2000); // Longer delay for overtake since it's a bigger action
      }
    });

    this.debugConnectButton.addEventListener("click", () => {
      if (this.currentGateId && this.onDebugConnectClick) {
        this.onDebugConnectClick(this.currentGateId);
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
    ownerInfo?: {
      ownerId: string;
      ownerName: string;
      status: string;
      lastOvertakenAt?: number;
    },
    defenseCount: number = 0,
    currentTime?: number,
    resourceFlow?: {
      energyFlow: number;
      alloyFlow: number;
      scienceFlow: number;
      isBlockaded: boolean;
      blockadeOwnerName?: string;
    },
    destinationDefenseCount: number = 0,
    tunnelInfo?: {
      gateAOwnerName?: string;
      gateBOwnerName?: string;
      gateAStatus?: string;
      gateBStatus?: string;
      tunnelPoweredBySpecies?: string | null;
      canTravel?: boolean;
      hasTunnelPower?: boolean;
    }
  ): void {
    this.panel.classList.remove("hidden");
    this.currentGateId = gate.id;

    // Check if gate is explored by current player
    const isExploredBySelf =
      player?.exploredGateIds?.includes(gate.id) ?? false;

    // Get status from ownership info
    const gateStatus = ownerInfo?.status;

    // Show tunnel control information if available
    // Display tunnel info whenever we have it, regardless of exploration status
    // This provides strategic information about tunnel ownership
    if (tunnelInfo) {
      this.tunnelControlRow.style.display = "flex";

      // Gate A (this side) owner
      const gateAColor = this.getStatusColor(tunnelInfo.gateAStatus);
      this.gateAOwnerElement.textContent =
        tunnelInfo.gateAOwnerName || "Uncontrolled";
      this.gateAOwnerElement.style.color = gateAColor;

      // Gate B (other side) owner
      const gateBColor = this.getStatusColor(tunnelInfo.gateBStatus);
      this.gateBOwnerElement.textContent =
        tunnelInfo.gateBOwnerName || "Uncontrolled";
      this.gateBOwnerElement.style.color = gateBColor;

      // Tunnel power status
      if (tunnelInfo.hasTunnelPower) {
        this.tunnelPowerElement.textContent =
          "⚡ Fully Powered (You control both gates)";
        this.tunnelPowerElement.style.color = "#fbbf24";
      } else if (tunnelInfo.canTravel) {
        this.tunnelPowerElement.textContent =
          "🔓 Can Travel (You control one gate)";
        this.tunnelPowerElement.style.color = "#10b981";
      } else if (tunnelInfo.tunnelPoweredBySpecies) {
        this.tunnelPowerElement.textContent =
          "❌ Controlled by another species";
        this.tunnelPowerElement.style.color = "#ef4444";
      } else {
        this.tunnelPowerElement.textContent = "⚪ Unpowered";
        this.tunnelPowerElement.style.color = "#9ca3af";
      }
    } else {
      this.tunnelControlRow.style.display = "none";
    }

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
        this.statusElement.textContent = "Controlled by You ⚡";
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
        // No specific status - show as controlled by player if they discovered it
        this.statusElement.textContent = `Controlled by ${
          player?.name || "You"
        } ⚡`;
        this.ownerRow.style.display = "none";
        travelCost = 0;
      }
    }

    // Check if travel is blocked by defended aggressive gate
    const isDefendedAggressiveGate =
      gateStatus === "aggressive" && defenseCount > 0;

    if (isDefendedAggressiveGate) {
      // Cannot travel through defended hostile gates
      this.travelButton.style.display = "none";
      this.travelButton.title =
        "Cannot travel through defended hostile gate - destroy defenses first";
    } else {
      // Update travel/open button text with cost
      this.travelButton.style.display = "block";
      const isUnexplored = !(
        player?.exploredGateIds?.includes(gate.id) ?? false
      );
      const buttonLabel = isUnexplored ? "Open" : "Travel";
      if (travelCost > 0) {
        this.travelButton.textContent = `⚡ ${buttonLabel} (${travelCost} Energy)`;
      } else {
        this.travelButton.textContent = `${buttonLabel} (Free)`;
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
    }

    // Military buttons: Fortify and Attack
    // Show Fortify button if player owns the gate
    console.log(
      `[GateDetailView] Gate ${gate.name}, gateStatus=${gateStatus}, ownerInfo:`,
      ownerInfo
    );
    const playerOwnsGate = gateStatus === "owned_by_self";
    console.log(
      `[GateDetailView] playerOwnsGate=${playerOwnsGate} (checking if gateStatus === "owned_by_self")`
    );
    if (playerOwnsGate) {
      this.fortifyButton.style.display = "block";
      const canFortify =
        (player?.energy ?? 0) >= 1 && (player?.alloy ?? 0) >= 0.1;
      this.fortifyButton.disabled = !canFortify;
      if (!canFortify) {
        this.fortifyButton.title = `Requires 1 Energy and 0.1 Minerals (you have ${
          player?.energy ?? 0
        } energy, ${player?.alloy ?? 0} minerals)`;
      } else {
        this.fortifyButton.title =
          "Build a defense platform to protect this gate";
      }
    } else {
      this.fortifyButton.style.display = "none";
    }

    // Show Attack button if another player owns the gate, has aggressive stance, AND has defenses
    const canAttack =
      gateStatus === "aggressive" &&
      ownerInfo &&
      ownerInfo.ownerId !== player?.id &&
      defenseCount > 0; // Only show attack if there are defenses to destroy
    if (canAttack) {
      this.attackButton.style.display = "block";
      const hasResources =
        (player?.energy ?? 0) >= 1 && (player?.alloy ?? 0) >= 0.1;
      this.attackButton.disabled = !hasResources;
      if (!hasResources) {
        this.attackButton.title = `Requires 1 Energy and 0.1 Minerals (you have ${
          player?.energy ?? 0
        } energy, ${player?.alloy ?? 0} minerals)`;
      } else {
        this.attackButton.title = `Launch an attack on this gate (${defenseCount} defense platform${
          defenseCount !== 1 ? "s" : ""
        })`;
      }
    } else {
      this.attackButton.style.display = "none";
      if (gateStatus === "aggressive" && defenseCount === 0) {
        this.attackButton.title =
          "No defenses to attack - use Overtake instead";
      }
    }

    // Clear any existing cooldown update interval
    if (this.cooldownUpdateInterval !== null) {
      clearInterval(this.cooldownUpdateInterval);
      this.cooldownUpdateInterval = null;
    }

    // Show Overtake button if gate is owned by someone else and BOTH ends are undefended
    const isOtherPlayerGate = ownerInfo && ownerInfo.ownerId !== player?.id;
    const isUndefended = defenseCount === 0;
    const isDestinationUndefended = destinationDefenseCount === 0;

    console.log(
      `[GateDetailView] Overtake check: isOtherPlayerGate=${isOtherPlayerGate}, isUndefended=${isUndefended}, isDestinationUndefended=${isDestinationUndefended}, gateStatus=${gateStatus}`
    );

    if (isOtherPlayerGate && isUndefended) {
      this.overtakeButton.style.display = "block";

      // Check if destination gate is defended
      if (!isDestinationUndefended) {
        this.overtakeButton.disabled = true;
        this.overtakeButton.title = `Cannot overtake: destination gate has ${destinationDefenseCount} defense platform(s). Both ends must be undefended.`;
        this.overtakeCooldownDiv.style.display = "none";
      } else {
        // Check cooldown period (10 game days = 10 * 86400 seconds)
        const COOLDOWN_PERIOD = 10 * 86400; // 10 days in seconds
        const lastOvertakenAt = ownerInfo.lastOvertakenAt || 0;
        const timeSinceOvertake = (currentTime || 0) - lastOvertakenAt;
        const isOnCooldown =
          lastOvertakenAt > 0 && timeSinceOvertake < COOLDOWN_PERIOD;

        if (isOnCooldown) {
          // On cooldown - show button disabled and display countdown
          this.overtakeButton.disabled = true;
          this.overtakeButton.title = "Gate is protected by overtake cooldown";

          // Show cooldown message
          this.overtakeCooldownDiv.style.display = "block";

          // Update cooldown time display
          const updateCooldownDisplay = () => {
            const now = currentState.currentTime;
            const remainingSeconds = COOLDOWN_PERIOD - (now - lastOvertakenAt);

            if (remainingSeconds <= 0) {
              // Cooldown expired, hide the message and refresh the view
              this.overtakeCooldownDiv.style.display = "none";
              if (this.cooldownUpdateInterval !== null) {
                clearInterval(this.cooldownUpdateInterval);
                this.cooldownUpdateInterval = null;
              }
              return;
            }

            const remainingDays = Math.floor(remainingSeconds / 86400);
            const remainingHours = Math.floor(
              (remainingSeconds % 86400) / 3600
            );
            const remainingMinutes = Math.floor((remainingSeconds % 3600) / 60);

            let timeMessage = "";
            if (remainingDays > 0) {
              timeMessage = `${remainingDays}d ${remainingHours}h`;
            } else if (remainingHours > 0) {
              timeMessage = `${remainingHours}h ${remainingMinutes}m`;
            } else {
              timeMessage = `${remainingMinutes}m`;
            }

            this.overtakeCooldownTimeSpan.textContent = timeMessage;
          };

          // Initial update
          updateCooldownDisplay();

          // Update every second (game time updates)
          this.cooldownUpdateInterval = window.setInterval(
            updateCooldownDisplay,
            1000
          );
        } else {
          // Not on cooldown - hide cooldown message
          this.overtakeCooldownDiv.style.display = "none";

          // Check resources
          const hasResources =
            (player?.energy ?? 0) >= 3 && (player?.science ?? 0) >= 10;
          this.overtakeButton.disabled = !hasResources;
          if (!hasResources) {
            this.overtakeButton.title = `Requires 3 Energy and 10 Science (you have ${
              player?.energy ?? 0
            } energy, ${player?.science ?? 0} science)`;
          } else {
            this.overtakeButton.title =
              "Peacefully overtake this undefended gate (both ends are clear)";
          }
        }
      }
    } else {
      this.overtakeButton.style.display = "none";
      this.overtakeCooldownDiv.style.display = "none";
      if (defenseCount > 0) {
        this.overtakeButton.title = `Cannot overtake: gate has ${defenseCount} defense platform(s)`;
      }
    }

    // Display blockade information if gate is blockading resources
    if (resourceFlow && resourceFlow.isBlockaded) {
      this.blockadeRow.style.display = "flex";
      this.blockadeRow.style.color = "#ff6b6b"; // Red for blockade
      const blockedResources = [];
      if (resourceFlow.energyFlow > 0) {
        blockedResources.push(`${resourceFlow.energyFlow.toFixed(1)} ⚡`);
      }
      if (resourceFlow.alloyFlow > 0) {
        blockedResources.push(`${resourceFlow.alloyFlow.toFixed(1)} 🔩`);
      }
      if (resourceFlow.scienceFlow > 0) {
        blockedResources.push(`${resourceFlow.scienceFlow.toFixed(1)} 🔬`);
      }
      const blockedText = blockedResources.join(", ");
      this.blockadeInfoElement.textContent = `⚠️ BLOCKADE: ${
        resourceFlow.blockadeOwnerName || "Enemy"
      } blocking ${blockedText}/day`;
    } else if (
      resourceFlow &&
      (resourceFlow.energyFlow > 0 ||
        resourceFlow.alloyFlow > 0 ||
        resourceFlow.scienceFlow > 0)
    ) {
      // Show resource flow even if not blockaded (for information)
      this.blockadeRow.style.display = "flex";
      this.blockadeRow.style.color = "#66ff66"; // Green for active flow
      const flowingResources = [];
      if (resourceFlow.energyFlow > 0) {
        flowingResources.push(`${resourceFlow.energyFlow.toFixed(1)} ⚡`);
      }
      if (resourceFlow.alloyFlow > 0) {
        flowingResources.push(`${resourceFlow.alloyFlow.toFixed(1)} 🔩`);
      }
      if (resourceFlow.scienceFlow > 0) {
        flowingResources.push(`${resourceFlow.scienceFlow.toFixed(1)} 🔬`);
      }
      const flowText = flowingResources.join(", ");
      this.blockadeInfoElement.textContent = `✓ Resources flowing: ${flowText}/day`;
    } else {
      this.blockadeRow.style.display = "none";
    }

    // Show Debug Connect button for unexplored gates (only in debug mode)
    const isUnexplored = !isExploredBySelf && !ownerInfo;
    console.log(
      `[GateDetailView] Debug check - debugMode: ${this.isDebugMode}, isExploredBySelf: ${isExploredBySelf}, ownerInfo:`,
      ownerInfo,
      `isUnexplored: ${isUnexplored}`
    );
    if (this.isDebugMode && isUnexplored) {
      this.debugConnectButton.style.display = "block";
      this.debugConnectButton.title =
        "Debug: Connect this gate to another civilization's unexplored gate";
      console.log(
        `[GateDetailView] Showing debug connect button for gate ${gate.id}`
      );
    } else {
      this.debugConnectButton.style.display = "none";
      console.log(
        `[GateDetailView] Hiding debug connect button - debugMode: ${this.isDebugMode}, isUnexplored: ${isUnexplored}`
      );
    }

    // Defense count - show for all owned gates (will be populated by game state updates)
    // For now, just hide it - will be shown when defenses are loaded
    this.defenseRow.style.display = "none";
    this.defenseCountElement.textContent = defenseCount.toString();

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
    // Clear cooldown update interval
    if (this.cooldownUpdateInterval !== null) {
      clearInterval(this.cooldownUpdateInterval);
      this.cooldownUpdateInterval = null;
    }
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

  private getStatusColor(status?: string): string {
    switch (status) {
      case "owned_by_self":
        return "#fbbf24"; // Yellow/Orange
      case "friendly":
        return "#10b981"; // Green
      case "neutral":
        return "#9ca3af"; // Gray
      case "aggressive":
        return "#ef4444"; // Red
      default:
        return "#ffffff"; // White
    }
  }
}
