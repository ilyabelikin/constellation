import {
  Player,
  StarSystem,
  SystemState,
  ASTRONOMICAL_UNIT,
  DEFENSE_PLATFORM_CONFIG,
  ATTACK_SHIP_CONFIG,
  formatCost,
  GAME_COSTS,
} from "@constellation/shared";
import { setButtonLoading, clearButtonLoading } from "./ButtonLoadingState.js";

/**
 * Manages the detail view for star gates
 */
export class GateDetailView {
  private panel: HTMLElement;
  private nameElement: HTMLElement;
  private destinationElement: HTMLElement;
  private distanceElement: HTMLElement;
  private periodElement: HTMLElement;
  private ownerRow: HTMLElement;
  private ownerElement: HTMLElement;
  private tunnelControlRow: HTMLElement;
  private gateAOwnerElement: HTMLElement;
  private gateBOwnerElement: HTMLElement;
  private tunnelPowerElement: HTMLElement;
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
  // Track tunnel power state to avoid unnecessary button recreation
  private lastTunnelPowerState: {
    tunnelId?: string;
    hasTunnelPower?: boolean;
    tunnelPoweredByPlayerId?: string | null;
    playerOwnsEitherGate?: boolean;
  } = {};
  public onTravelClick?: (gateId: string) => void;
  public onFortifyClick?: (gateId: string) => void;
  public onAttackClick?: (gateId: string) => void;
  public onCaptureClick?: (gateId: string) => void;
  public onOvertakeClick?: (gateId: string) => void;
  public onDebugConnectClick?: (gateId: string) => void;
  public onPowerOffTunnel?: (tunnelId: string) => void;
  public onPowerOnTunnel?: (tunnelId: string) => void;
  public onTunnelOvertake?: (tunnelId: string) => void;
  public onOverchargeTunnel?: (tunnelId: string) => void;

  constructor() {
    this.panel = document.getElementById("gate-details-panel")!;
    this.nameElement = document.getElementById("gate-detail-name")!;
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

    // Setup button click handlers
    this.travelButton.addEventListener("click", () => {
      if (this.currentGateId && this.onTravelClick) {
        setButtonLoading(this.travelButton, "Traveling...");
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
        setButtonLoading(this.fortifyButton, "Fortifying...");
        this.onFortifyClick(this.currentGateId);
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
        setButtonLoading(this.attackButton, "Attacking...");
        this.onAttackClick(this.currentGateId);
      }
      return false; // Additional safety to prevent event propagation
    });

    this.captureButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling
      if (
        this.currentGateId &&
        this.onCaptureClick &&
        !this.captureButton.disabled
      ) {
        console.log(
          "[GateDetailView] Capture button clicked for gate:",
          this.currentGateId
        );
        setButtonLoading(this.captureButton, "Capturing...");
        this.onCaptureClick(this.currentGateId);
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
        setButtonLoading(this.overtakeButton, "Overtaking...");
        this.onOvertakeClick(this.currentGateId);
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
      tunnelPoweredByPlayerId?: string | null;
      tunnelPoweredByPlayerName?: string | null;
      tunnelPoweredBySpeciesName?: string | null;
      tunnelId?: string;
      canTravel?: boolean;
      hasTunnelPower?: boolean;
      overchargeTimeRemaining?: string | null;
    }
  ): void {
    this.panel.classList.remove("hidden");
    this.currentGateId = gate.id;

    // Floor player resources to 2 decimal places (same as HUD display)
    const playerEnergy = Math.floor((player?.energy ?? 0) * 100) / 100;
    const playerAlloy = Math.floor((player?.alloy ?? 0) * 100) / 100;
    const playerScience = Math.floor((player?.science ?? 0) * 100) / 100;

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

      // Gate A (this side) owner with defense count
      const gateAColor = this.getStatusColor(tunnelInfo.gateAStatus);
      const gateAOwnerText = tunnelInfo.gateAOwnerName || "Uncontrolled";
      const gateADefenseText = defenseCount > 0 ? `, 🛡️ ${defenseCount}` : "";
      this.gateAOwnerElement.textContent = gateAOwnerText + gateADefenseText;
      this.gateAOwnerElement.style.color = gateAColor;

      // Gate B (other side) owner with defense count
      const gateBColor = this.getStatusColor(tunnelInfo.gateBStatus);
      const gateBOwnerText = tunnelInfo.gateBOwnerName || "Uncontrolled";
      const gateBDefenseText =
        destinationDefenseCount > 0 ? `, 🛡️ ${destinationDefenseCount}` : "";
      this.gateBOwnerElement.textContent = gateBOwnerText + gateBDefenseText;
      this.gateBOwnerElement.style.color = gateBColor;

      // Check if tunnel power state has changed to avoid unnecessary button recreation
      const playerOwnsEitherGate =
        tunnelInfo.gateAStatus === "owned_by_self" ||
        tunnelInfo.gateBStatus === "owned_by_self";

      const tunnelPowerStateChanged =
        this.lastTunnelPowerState.tunnelId !== tunnelInfo.tunnelId ||
        this.lastTunnelPowerState.hasTunnelPower !==
          tunnelInfo.hasTunnelPower ||
        this.lastTunnelPowerState.tunnelPoweredByPlayerId !==
          tunnelInfo.tunnelPoweredByPlayerId ||
        this.lastTunnelPowerState.playerOwnsEitherGate !== playerOwnsEitherGate;

      // Update last tunnel power state
      this.lastTunnelPowerState = {
        tunnelId: tunnelInfo.tunnelId,
        hasTunnelPower: tunnelInfo.hasTunnelPower,
        tunnelPoweredByPlayerId: tunnelInfo.tunnelPoweredByPlayerId,
        playerOwnsEitherGate: playerOwnsEitherGate,
      };

      // Only recreate buttons if tunnel power state has changed
      // This prevents constant recreation during frequent state updates
      if (tunnelPowerStateChanged) {
        console.log(
          "[GateDetailView] Tunnel power state changed, recreating buttons"
        );

        // Tunnel power status - show which player powers the tunnel
        // Power is independent of gate control
        // Use neutral color - colors are ONLY for gate ownership
        if (
          tunnelInfo.tunnelPoweredByPlayerId &&
          tunnelInfo.tunnelPoweredByPlayerName
        ) {
          // Check if it's the current player
          if (tunnelInfo.hasTunnelPower) {
            // Check if player can afford overcharge (10 energy + 10 science)
            const canAffordOvercharge =
              player && player.energy >= 10 && player.science >= 10;
            const isOnCooldown =
              tunnelInfo.overchargeTimeRemaining !== null &&
              tunnelInfo.overchargeTimeRemaining !== undefined;
            const overchargeDisabled = !canAffordOvercharge || isOnCooldown;
            const overchargeTooltip = !canAffordOvercharge
              ? "Requires 10 Energy + 10 Science"
              : isOnCooldown
              ? `Cooldown: ${tunnelInfo.overchargeTimeRemaining}`
              : "Overcharge tunnel (10 Energy + 10 Science)";

            const speciesName =
              tunnelInfo.tunnelPoweredBySpeciesName || "Your Species";
            this.tunnelPowerElement.innerHTML = `${speciesName}
            <button id="power-off-tunnel-btn" style="margin-left: 8px; padding: 2px 6px; font-size: 0.75em; cursor: pointer; background: #ef4444; color: white; border: none; border-radius: 3px;">✕ Power Off</button>
            <button id="overcharge-tunnel-btn" 
              style="margin-left: 4px; padding: 2px 6px; font-size: 0.75em; cursor: ${
                overchargeDisabled ? "not-allowed" : "pointer"
              }; background: ${
              overchargeDisabled ? "#6b7280" : "#dc2626"
            }; color: white; border: none; border-radius: 3px; font-weight: bold; opacity: ${
              overchargeDisabled ? "0.5" : "1"
            };"
              title="${overchargeTooltip}"
              ${overchargeDisabled ? "disabled" : ""}>💥 Overcharge</button>`;
          } else {
            // Check if player can afford overtake
            const ENERGY_COST = GAME_COSTS.TUNNEL_OVERTAKE.energy;
            const SCIENCE_COST = GAME_COSTS.TUNNEL_OVERTAKE.science;
            const canAffordOvertake =
              player &&
              player.energy >= ENERGY_COST &&
              player.science >= SCIENCE_COST;
            const overtakeTooltip = !canAffordOvertake
              ? `Requires ${ENERGY_COST} Energy + ${SCIENCE_COST} Science`
              : `Take over tunnel power (${ENERGY_COST} Energy + ${SCIENCE_COST} Science)`;

            this.tunnelPowerElement.innerHTML = `⚡ Powered by ${tunnelInfo.tunnelPoweredByPlayerName}
            <button id="overtake-tunnel-btn" 
              style="margin-left: 8px; padding: 2px 6px; font-size: 0.75em; cursor: ${
                canAffordOvertake ? "pointer" : "not-allowed"
              }; background: ${
              canAffordOvertake ? "#fbbf24" : "#6b7280"
            }; color: #000; border: none; border-radius: 3px; font-weight: bold; opacity: ${
              canAffordOvertake ? "1" : "0.5"
            };"
              title="${overtakeTooltip}"
              ${canAffordOvertake ? "" : "disabled"}>🏳️ Overtake</button>`;
          }
          // Always use neutral white/light color for tunnel power text
          this.tunnelPowerElement.style.color = "#e5e7eb";

          // Add event listeners for tunnel buttons
          setTimeout(() => {
            // Power Off button (only if player has tunnel power)
            if (tunnelInfo.hasTunnelPower) {
              const powerOffBtn = document.getElementById(
                "power-off-tunnel-btn"
              );
              if (powerOffBtn && tunnelInfo.tunnelId) {
                const tunnelId = tunnelInfo.tunnelId;
                // Remove any existing listeners by cloning and replacing
                const newPowerOffBtn = powerOffBtn.cloneNode(true);
                powerOffBtn.parentNode?.replaceChild(
                  newPowerOffBtn,
                  powerOffBtn
                );

                (newPowerOffBtn as HTMLButtonElement).addEventListener(
                  "click",
                  (event) => {
                    console.log(
                      "[GateDetailView] Power Off button CLICKED (before checks)",
                      tunnelId,
                      "callback exists:",
                      !!this.onPowerOffTunnel,
                      "disabled:",
                      (newPowerOffBtn as HTMLButtonElement).disabled
                    );
                    event.stopPropagation(); // Prevent event bubbling
                    event.preventDefault(); // Prevent any default behavior
                    if (
                      this.onPowerOffTunnel &&
                      !(newPowerOffBtn as HTMLButtonElement).disabled
                    ) {
                      console.log(
                        "[GateDetailView] Power Off button clicked for tunnel:",
                        tunnelId
                      );
                      // Temporarily disable to prevent double-clicks
                      (newPowerOffBtn as HTMLButtonElement).disabled = true;
                      this.onPowerOffTunnel(tunnelId);
                      // Re-enable after a short delay
                      setTimeout(() => {
                        (newPowerOffBtn as HTMLButtonElement).disabled = false;
                      }, 1000);
                    }
                  }
                );
              }

              // Overcharge button
              const overchargeBtn = document.getElementById(
                "overcharge-tunnel-btn"
              );
              if (
                overchargeBtn &&
                tunnelInfo.tunnelId &&
                !overchargeBtn.hasAttribute("disabled")
              ) {
                const tunnelId = tunnelInfo.tunnelId;
                // Remove any existing listeners by cloning and replacing
                const newOverchargeBtn = overchargeBtn.cloneNode(true);
                overchargeBtn.parentNode?.replaceChild(
                  newOverchargeBtn,
                  overchargeBtn
                );

                (newOverchargeBtn as HTMLButtonElement).addEventListener(
                  "click",
                  (event) => {
                    event.stopPropagation(); // Prevent event bubbling
                    event.preventDefault(); // Prevent any default behavior
                    if (
                      this.onOverchargeTunnel &&
                      !(newOverchargeBtn as HTMLButtonElement).disabled
                    ) {
                      console.log(
                        "[GateDetailView] Overcharge button clicked for tunnel:",
                        tunnelId
                      );
                      // Temporarily disable to prevent double-clicks
                      (newOverchargeBtn as HTMLButtonElement).disabled = true;
                      this.onOverchargeTunnel(tunnelId);
                      // Re-enable after a short delay
                      setTimeout(() => {
                        (newOverchargeBtn as HTMLButtonElement).disabled =
                          false;
                      }, 2000);
                    }
                  }
                );
              }
            } else {
              // Overtake tunnel button (only if someone else has tunnel power)
              const overtakeBtn = document.getElementById(
                "overtake-tunnel-btn"
              );
              if (
                overtakeBtn &&
                tunnelInfo.tunnelId &&
                !overtakeBtn.hasAttribute("disabled")
              ) {
                const tunnelId = tunnelInfo.tunnelId;
                // Remove any existing listeners by cloning and replacing
                const newOvertakeBtn = overtakeBtn.cloneNode(true);
                overtakeBtn.parentNode?.replaceChild(
                  newOvertakeBtn,
                  overtakeBtn
                );

                (newOvertakeBtn as HTMLButtonElement).addEventListener(
                  "click",
                  (event) => {
                    event.stopPropagation(); // Prevent event bubbling
                    event.preventDefault(); // Prevent any default behavior
                    if (
                      this.onTunnelOvertake &&
                      !(newOvertakeBtn as HTMLButtonElement).disabled
                    ) {
                      console.log(
                        "[GateDetailView] Tunnel Overtake button clicked for tunnel:",
                        tunnelId
                      );
                      // Temporarily disable to prevent double-clicks
                      (newOvertakeBtn as HTMLButtonElement).disabled = true;
                      this.onTunnelOvertake(tunnelId);
                      // Re-enable after a short delay
                      setTimeout(() => {
                        (newOvertakeBtn as HTMLButtonElement).disabled = false;
                      }, 2000);
                    }
                  }
                );
              }
            }
          }, 0);
        } else {
          // Unpowered - check if tunnel was previously opened or never opened
          const bothGatesHaveOwners =
            tunnelInfo.gateAOwnerName &&
            tunnelInfo.gateAOwnerName !== "Uncontrolled" &&
            tunnelInfo.gateBOwnerName &&
            tunnelInfo.gateBOwnerName !== "Uncontrolled";

          if (bothGatesHaveOwners) {
            // Tunnel was opened before but is now powered off
            if (playerOwnsEitherGate && tunnelInfo.tunnelId) {
              // Player owns at least one gate - show power on button
              this.tunnelPowerElement.innerHTML = `⚪ Deactivated 
              <button id="power-on-tunnel-btn" style="margin-left: 8px; padding: 2px 6px; font-size: 0.75em; cursor: pointer; background: #10b981; color: white; border: none; border-radius: 3px;">⚡ Power On</button>`;
              this.tunnelPowerElement.style.color = "#9ca3af";

              // Add event listener for power on button
              setTimeout(() => {
                const powerOnBtn = document.getElementById(
                  "power-on-tunnel-btn"
                );
                if (powerOnBtn && tunnelInfo.tunnelId) {
                  const tunnelId = tunnelInfo.tunnelId;
                  // Remove any existing listeners by cloning and replacing
                  const newPowerOnBtn = powerOnBtn.cloneNode(true);
                  powerOnBtn.parentNode?.replaceChild(
                    newPowerOnBtn,
                    powerOnBtn
                  );

                  (newPowerOnBtn as HTMLButtonElement).addEventListener(
                    "click",
                    (event) => {
                      event.stopPropagation(); // Prevent event bubbling
                      event.preventDefault(); // Prevent any default behavior
                      if (
                        this.onPowerOnTunnel &&
                        !(newPowerOnBtn as HTMLButtonElement).disabled
                      ) {
                        console.log(
                          "[GateDetailView] Power On button clicked for tunnel:",
                          tunnelId
                        );
                        // Temporarily disable to prevent double-clicks
                        (newPowerOnBtn as HTMLButtonElement).disabled = true;
                        this.onPowerOnTunnel(tunnelId);
                        // Re-enable after a short delay
                        setTimeout(() => {
                          (newPowerOnBtn as HTMLButtonElement).disabled = false;
                        }, 1000);
                      }
                    }
                  );
                }
              }, 0);
            } else {
              // Someone else owns the gates
              this.tunnelPowerElement.textContent = `⚪ Deactivated (Open to activate)`;
              this.tunnelPowerElement.style.color = "#9ca3af";
            }
          } else {
            // Tunnel never opened - first time
            this.tunnelPowerElement.textContent = `⚪ Unpowered (Travel through to open)`;
            this.tunnelPowerElement.style.color = "#9ca3af";
          }
        }
      } // End of if (tunnelPowerStateChanged)
    } else {
      this.tunnelControlRow.style.display = "none";
    }

    // Determine display based on ownership and exploration
    let travelCost = 0; // Cost in energy

    // Hide owner row - tunnel control provides all ownership information
    this.ownerRow.style.display = "none";

    // Set gate name
    if (!isExploredBySelf && ownerInfo) {
      // Gate owned by someone else but not explored by us yet
      this.nameElement.textContent = "???";
      travelCost = 0;
    } else if (!isExploredBySelf) {
      // Truly unexplored - no owner, not explored by us
      // Opening a tunnel costs 1 energy (tunnel has gates at both ends)
      this.nameElement.textContent = "???";
      travelCost = GAME_COSTS.TUNNEL_POWER_ON.energy;
    } else {
      // Explored by us
      this.nameElement.textContent = gate.name;
      travelCost = 0;
    }

    // Check if tunnel is deactivated (powered off) - applies regardless of exploration
    // Reopening/activating a deactivated tunnel costs 1 energy
    const isTunnelPowered = tunnelInfo && tunnelInfo.tunnelPoweredByPlayerId;
    const bothGatesHaveOwners =
      tunnelInfo &&
      tunnelInfo.gateAOwnerName &&
      tunnelInfo.gateAOwnerName !== "Uncontrolled" &&
      tunnelInfo.gateBOwnerName &&
      tunnelInfo.gateBOwnerName !== "Uncontrolled";

    // If tunnel was previously opened (both gates have owners) but is now powered off,
    // it costs energy to reactivate it
    if (!isTunnelPowered && bothGatesHaveOwners && isExploredBySelf) {
      travelCost = GAME_COSTS.TUNNEL_POWER_ON.energy;
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
      // Check if tunnel is powered (active) or deactivated
      const isTunnelPowered = tunnelInfo && tunnelInfo.tunnelPoweredByPlayerId;
      const isUnexplored = !(
        player?.exploredGateIds?.includes(gate.id) ?? false
      );

      // If tunnel is deactivated (not powered), show "Open" button for reactivation
      // If tunnel is powered and explored, show "Travel"
      // If tunnel is powered but unexplored by player, show "Open"
      const buttonLabel = isUnexplored || !isTunnelPowered ? "Open" : "Travel";

      // Update travel/open button text with cost
      this.travelButton.style.display = "block";
      if (travelCost > 0) {
        this.travelButton.textContent = `⚡ ${buttonLabel} (${travelCost} Energy)`;
      } else {
        this.travelButton.textContent = `${buttonLabel} (Free)`;
      }

      // Check if player has enough energy
      const hasEnoughEnergy = playerEnergy >= travelCost;
      this.travelButton.disabled = !hasEnoughEnergy;

      if (!hasEnoughEnergy && travelCost > 0) {
        this.travelButton.title = `Requires ${travelCost} Energy (you have ${playerEnergy.toFixed(
          2
        )})`;
      } else {
        this.travelButton.title = "";
      }
    }

    // Military buttons: Fortify and Attack
    // Show Fortify button if player owns the gate
    const playerOwnsGate = gateStatus === "owned_by_self";
    if (playerOwnsGate) {
      this.fortifyButton.style.display = "block";
      const fortifyCost = DEFENSE_PLATFORM_CONFIG.cost;
      const canFortify =
        playerEnergy >= fortifyCost.energy &&
        playerAlloy >= fortifyCost.alloy &&
        playerScience >= fortifyCost.science;
      this.fortifyButton.disabled = !canFortify;
      // Update button text with actual costs using formatCost
      this.fortifyButton.textContent = `🛡️ Fortify ${formatCost(fortifyCost)}`;
      if (!canFortify) {
        this.fortifyButton.title = `Requires ${formatCost(fortifyCost, {
          showParentheses: false,
        })} (you have ${playerEnergy.toFixed(2)} ⚡, ${playerAlloy.toFixed(
          2
        )} ⛏, ${playerScience.toFixed(2)} 🔬)`;
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
      const attackCost = ATTACK_SHIP_CONFIG.cost;
      const hasResources =
        playerEnergy >= attackCost.energy &&
        playerAlloy >= attackCost.alloy &&
        playerScience >= attackCost.science;
      this.attackButton.disabled = !hasResources;
      // Update button text with actual costs using formatCost
      this.attackButton.textContent = `⚔️ Attack ${formatCost(attackCost)}`;
      if (!hasResources) {
        this.attackButton.title = `Requires ${formatCost(attackCost, {
          showParentheses: false,
        })} (you have ${playerEnergy.toFixed(2)} ⚡, ${playerAlloy.toFixed(
          2
        )} ⛏, ${playerScience.toFixed(2)} 🔬)`;
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
          const now = this.currentTimeGetter
            ? this.currentTimeGetter()
            : currentState.currentTime;
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
        const captureCost = GAME_COSTS.GATE_CAPTURE;
        const hasCaptureResources =
          playerEnergy >= captureCost.energy &&
          playerAlloy >= captureCost.alloy &&
          playerScience >= captureCost.science;
        this.captureButton.disabled = !hasCaptureResources;
        // Update button text with costs from config
        this.captureButton.textContent = `🚩 Capture Gate ${formatCost(
          captureCost
        )}`;
        if (!hasCaptureResources) {
          this.captureButton.title = `Requires ${formatCost(captureCost, {
            showParentheses: false,
          })} (you have ${playerEnergy.toFixed(2)} ⚡, ${playerAlloy.toFixed(
            2
          )} ⛏, ${playerScience.toFixed(2)} 🔬)`;
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
          const overtakeCost = GAME_COSTS.TUNNEL_OVERTAKE;
          const hasOvertakeResources =
            playerEnergy >= overtakeCost.energy &&
            playerAlloy >= overtakeCost.alloy &&
            playerScience >= overtakeCost.science;
          this.overtakeButton.disabled = !hasOvertakeResources;
          // Update button text with costs from config
          this.overtakeButton.textContent = `🏳️ Overtake Tunnel ${formatCost(
            overtakeCost
          )}`;
          if (!hasOvertakeResources) {
            this.overtakeButton.title = `Requires ${formatCost(overtakeCost, {
              showParentheses: false,
            })} (you have ${playerEnergy.toFixed(2)} ⚡, ${playerAlloy.toFixed(
              2
            )} ⛏, ${playerScience.toFixed(2)} 🔬)`;
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

    // Display resource flow information
    if (resourceFlow) {
      const hasFlow =
        resourceFlow.energyFlow > 0 ||
        resourceFlow.alloyFlow > 0 ||
        resourceFlow.scienceFlow > 0;

      if (hasFlow) {
        this.blockadeRow.style.display = "flex";
        const flowingResources = [];
        if (resourceFlow.energyFlow > 0) {
          flowingResources.push(`${resourceFlow.energyFlow.toFixed(2)} ⚡`);
        }
        if (resourceFlow.alloyFlow > 0) {
          flowingResources.push(`${resourceFlow.alloyFlow.toFixed(2)} ⛏`);
        }
        if (resourceFlow.scienceFlow > 0) {
          flowingResources.push(`${resourceFlow.scienceFlow.toFixed(2)} 🔬`);
        }
        const flowText = flowingResources.join(", ");

        if (resourceFlow.isBlockaded) {
          // Show blocked resources
          this.blockadeRow.style.color = "#ff6b6b"; // Red for blockade
          const blockadeName = resourceFlow.blockadeOwnerName || "Unknown";
          this.blockadeInfoElement.textContent = `⚠️ BLOCKADE: ${blockadeName} blocking ${flowText}/day`;
        } else {
          // Show flowing resources
          this.blockadeRow.style.color = "#66ff66"; // Green for active flow
          this.blockadeInfoElement.textContent = `✓ Resources flowing: ${flowText}/day`;
        }
      } else {
        // No resource flow
        this.blockadeRow.style.display = "none";
      }
    } else {
      // No resource flow data available
      this.blockadeRow.style.display = "none";
    }

    // Show Debug Connect button for unexplored gates (only in debug mode)
    const isUnexplored = !isExploredBySelf && !ownerInfo;
    if (this.isDebugMode && isUnexplored) {
      this.debugConnectButton.style.display = "block";
      this.debugConnectButton.title =
        "Connect this gate to another civilization's unexplored gate";
    } else {
      this.debugConnectButton.style.display = "none";
    }

    // Defense counts are now displayed inline with gate ownership in tunnel control section

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
    // Reset tunnel power state so buttons are recreated when showing a new gate
    this.lastTunnelPowerState = {};
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

  /**
   * Clear all button loading states
   * Called when system data is refreshed or an action completes
   */
  clearAllLoadingStates(): void {
    clearButtonLoading(this.travelButton);
    clearButtonLoading(this.fortifyButton);
    clearButtonLoading(this.attackButton);
    clearButtonLoading(this.captureButton);
    clearButtonLoading(this.overtakeButton);
  }
}
