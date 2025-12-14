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
  private captureButton: HTMLButtonElement;
  private overtakeButton: HTMLButtonElement;
  private overtakeCooldownDiv: HTMLElement;
  private overtakeCooldownTimeSpan: HTMLElement;
  private debugConnectButton: HTMLButtonElement;
  private cooldownUpdateInterval: number | null = null;
  private currentGateId: string | null = null;
  private isDebugMode: boolean = false;
  private currentTimeGetter: (() => number) | null = null;
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
    this.captureButton = document.getElementById(
      "gate-capture-button"
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
      event.preventDefault(); // Prevent any default behavior
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
      return false; // Additional safety to prevent event propagation
    });

    this.captureButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling
      if (
        this.currentGateId &&
        this.onOvertakeClick &&
        !this.captureButton.disabled
      ) {
        console.log(
          "[GateDetailView] Capture button clicked for gate:",
          this.currentGateId
        );
        // Temporarily disable to prevent double-clicks
        this.captureButton.disabled = true;
        this.onOvertakeClick(this.currentGateId);
        // Re-enable after a short delay
        setTimeout(() => {
          this.captureButton.disabled = false;
        }, 1500);
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
   * Set the function to get current game time (respects time scale and pause)
   */
  setCurrentTimeGetter(getter: () => number): void {
    this.currentTimeGetter = getter;
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

      // Tunnel power status - show which species powers the tunnel
      // Power is independent of gate control
      // Use neutral color - colors are ONLY for gate ownership
      if (tunnelInfo.tunnelPoweredBySpecies) {
        // Determine which player's species powers the tunnel
        const thisGateOwner = tunnelInfo.gateAOwnerName || "Unknown";
        const otherGateOwner = tunnelInfo.gateBOwnerName || "Unknown";

        // If both gates owned by same player, their species powers it
        if (
          thisGateOwner !== "Uncontrolled" &&
          thisGateOwner === otherGateOwner
        ) {
          // Check if it's the current player
          if (
            tunnelInfo.gateAStatus === "owned_by_self" ||
            tunnelInfo.gateBStatus === "owned_by_self"
          ) {
            this.tunnelPowerElement.textContent = `⚡ Powered by Your Species`;
          } else {
            this.tunnelPowerElement.textContent = `⚡ Powered by ${thisGateOwner}'s Species`;
          }
        } else {
          // Shouldn't happen, but handle it
          this.tunnelPowerElement.textContent = "⚡ Powered (Unknown Species)";
        }
        // Always use neutral white/light color for tunnel power text
        this.tunnelPowerElement.style.color = "#e5e7eb";
      } else {
        this.tunnelPowerElement.textContent = "⚪ Unpowered";
        this.tunnelPowerElement.style.color = "#9ca3af";
      }
    } else {
      this.tunnelControlRow.style.display = "none";
    }

    // Determine display based on ownership and exploration
    let travelCost = 0; // Cost in energy

    // Hide status row - tunnel control provides all ownership information
    this.statusElement.style.display = "none";
    this.ownerRow.style.display = "none";

    // Set gate name
    if (!isExploredBySelf && ownerInfo) {
      // Gate owned by someone else but not explored by us yet
      this.nameElement.textContent = "???";
      travelCost = 0;
    } else if (!isExploredBySelf) {
      // Truly unexplored - no owner, not explored by us
      this.nameElement.textContent = "???";
      travelCost = 1;
    } else {
      // Explored by us
      this.nameElement.textContent = gate.name;
      travelCost = 0;
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

    // Show Attack button if another player owns the gate AND has defenses
    // Use tunnel info for accurate ownership (not ownerInfo which might be stale)
    // You must destroy defenses before you can capture/overtake
    const thisGateOwnedByMe = tunnelInfo?.gateAStatus === "owned_by_self";
    const thisGateOwnedBySomeoneElse =
      tunnelInfo?.gateAStatus && tunnelInfo.gateAStatus !== "owned_by_self";

    const canAttack = thisGateOwnedBySomeoneElse && defenseCount > 0; // Only attack if enemy owns this gate AND has defenses

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
        this.attackButton.title = `Destroy ${
          tunnelInfo?.gateAOwnerName || "enemy"
        }'s defenses (${defenseCount} platform${
          defenseCount !== 1 ? "s" : ""
        })`;
      }
    } else if (thisGateOwnedByMe && defenseCount > 0) {
      // Don't show attack button for your own defenses
      this.attackButton.style.display = "none";
      this.attackButton.title = "These are your own defenses";
    } else {
      this.attackButton.style.display = "none";
    }

    // Clear any existing cooldown update interval
    if (this.cooldownUpdateInterval !== null) {
      clearInterval(this.cooldownUpdateInterval);
      this.cooldownUpdateInterval = null;
    }

    // Show Capture/Overtake buttons if gate is owned by someone else AND undefended
    const isOtherPlayerGate = ownerInfo && ownerInfo.ownerId !== player?.id;
    const isUndefended = defenseCount === 0;
    const isDestinationUndefended = destinationDefenseCount === 0;

    console.log(
      `[GateDetailView] Capture/Overtake check: isOtherPlayerGate=${isOtherPlayerGate}, isUndefended=${isUndefended}, isDestinationUndefended=${isDestinationUndefended}, gateStatus=${gateStatus}, defenseCount=${defenseCount}`
    );

    // Capture/Overtake buttons ONLY show if:
    // 1. Gate is owned by another player (not you)
    // 2. THIS gate has NO defenses (defenseCount === 0)
    // If gate has defenses, only Attack button will show (see attack button logic above)
    if (isOtherPlayerGate && isUndefended) {
      // Check cooldown period (10 game days = 10 * 86400 seconds)
      const COOLDOWN_PERIOD = 10 * 86400; // 10 days in seconds
      const lastOvertakenAt = ownerInfo.lastOvertakenAt || 0;
      const timeSinceOvertake = (currentTime || 0) - lastOvertakenAt;
      const isOnCooldown =
        lastOvertakenAt > 0 && timeSinceOvertake < COOLDOWN_PERIOD;

      if (isOnCooldown) {
        // On cooldown - disable both buttons and show countdown
        this.captureButton.style.display = "block";
        this.captureButton.disabled = true;
        this.captureButton.title = "Gate is protected by overtake cooldown";

        this.overtakeButton.style.display = "block";
        this.overtakeButton.disabled = true;
        this.overtakeButton.title = "Gate is protected by overtake cooldown";

        // Show cooldown message
        this.overtakeCooldownDiv.style.display = "block";

        // Update cooldown time display
        const updateCooldownDisplay = () => {
          // Get current game time from the getter (respects time scale and pause)
          const now = this.currentTimeGetter ? this.currentTimeGetter() : currentState.currentTime;
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
          const remainingHours = Math.floor((remainingSeconds % 86400) / 3600);
          const remainingMinutes = Math.floor((remainingSeconds % 3600) / 60);
          const remainingSecs = Math.floor(remainingSeconds % 60);

          let timeMessage = "";
          if (remainingDays > 0) {
            timeMessage = `${remainingDays}d ${remainingHours}h`;
          } else if (remainingHours > 0) {
            timeMessage = `${remainingHours}h ${remainingMinutes}m`;
          } else if (remainingMinutes > 0) {
            timeMessage = `${remainingMinutes}m ${remainingSecs}s`;
          } else {
            timeMessage = `${remainingSecs}s`;
          }

          this.overtakeCooldownTimeSpan.textContent = timeMessage;
        };

        // Initial update
        updateCooldownDisplay();

        // Update every second to show countdown
        this.cooldownUpdateInterval = window.setInterval(
          updateCooldownDisplay,
          1000
        );
      } else {
        // Not on cooldown - hide cooldown message
        this.overtakeCooldownDiv.style.display = "none";

        // CAPTURE BUTTON - only requires this gate to be undefended
        this.captureButton.style.display = "block";
        const hasCaptureResources = (player?.alloy ?? 0) >= 10;
        this.captureButton.disabled = !hasCaptureResources;
        if (!hasCaptureResources) {
          this.captureButton.title = `Requires 10 Alloy (you have ${
            player?.alloy ?? 0
          } alloy)`;
        } else {
          this.captureButton.title =
            "Capture this gate only (destination gate stays with current owner)";
        }

        // OVERTAKE BUTTON - requires BOTH gates to be undefended
        if (!isDestinationUndefended) {
          // Destination gate is defended - can't overtake but can still capture
          this.overtakeButton.style.display = "block";
          this.overtakeButton.disabled = true;
          this.overtakeButton.title = `Cannot overtake tunnel: destination gate has ${destinationDefenseCount} defense platform(s). Both ends must be undefended. Use Capture instead to take only this gate.`;
        } else {
          // Both gates undefended - can overtake
          this.overtakeButton.style.display = "block";
          const hasOvertakeResources =
            (player?.energy ?? 0) >= 3 && (player?.science ?? 0) >= 10;
          this.overtakeButton.disabled = !hasOvertakeResources;
          if (!hasOvertakeResources) {
            this.overtakeButton.title = `Requires 3 Energy and 10 Science (you have ${
              player?.energy ?? 0
            } energy, ${player?.science ?? 0} science)`;
          } else {
            this.overtakeButton.title =
              "Overtake entire tunnel: take both gates and start powering it with your species";
          }
        }
      }
    } else {
      // Either not owned by another player, or this gate is defended
      this.captureButton.style.display = "none";
      this.overtakeButton.style.display = "none";
      this.overtakeCooldownDiv.style.display = "none";
      if (defenseCount > 0) {
        this.captureButton.title = `Cannot capture: gate has ${defenseCount} defense platform(s)`;
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

    // Defense count - show when there are defenses on this gate OR destination gate
    if (defenseCount > 0 || destinationDefenseCount > 0) {
      this.defenseRow.style.display = "flex";
      if (defenseCount > 0 && destinationDefenseCount > 0) {
        this.defenseCountElement.textContent = `🛡️ ${defenseCount} (Destination: ${destinationDefenseCount})`;
      } else if (defenseCount > 0) {
        this.defenseCountElement.textContent = `🛡️ ${defenseCount} platform${
          defenseCount !== 1 ? "s" : ""
        }`;
      } else {
        this.defenseCountElement.textContent = `🛡️ Destination: ${destinationDefenseCount} platform${
          destinationDefenseCount !== 1 ? "s" : ""
        }`;
      }
    } else {
      this.defenseRow.style.display = "none";
      this.defenseCountElement.textContent = "0";
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
