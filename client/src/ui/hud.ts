import {
  Player,
  StarSystem,
  SystemState,
  Ship,
  ConstellationNode,
  SearchResult,
  DAYS_PER_YEAR,
} from "@constellation/shared";
import { BodyDetailView } from "./BodyDetailView.js";
import { GateDetailView } from "./GateDetailView.js";
import { ShipDetailView } from "./ShipDetailView.js";
import { ConstellationSystemDetailView } from "./ConstellationSystemDetailView.js";

export class HUDManager {
  private player: Player | null = null;
  private system: StarSystem | null = null;
  private currentState: SystemState | null = null;
  private ship: Ship | null = null;
  private selectedObjectId: string | null = null;
  private currentTime: number = 0;
  private gateOwnership: Map<
    string,
    {
      ownerId: string;
      ownerName: string;
      status: string;
      lastOvertakenAt: number;
    }
  > = new Map();
  private tunnelOwnership: Map<
    string,
    {
      tunnelId: string;
      thisGateOwnerId?: string;
      thisGateOwnerName?: string;
      thisGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      thisGateDefenseCount?: number;
      otherGateOwnerId?: string;
      otherGateOwnerName?: string;
      otherGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      otherGateDefenseCount?: number;
      tunnelPoweredByPlayerId?: string | null;
      tunnelPoweredByPlayerName?: string | null;
      overchargedAt?: number | null;
    }
  > = new Map();
  private speciesGetter: ((speciesId: string) => any) | null = null;
  private isConnectedToCapital: boolean = true;

  // Detail views
  private bodyDetailView: BodyDetailView;
  private gateDetailView: GateDetailView;
  private shipDetailView: ShipDetailView;
  private constellationSystemDetailView: ConstellationSystemDetailView;

  // HUD elements
  private navSection: HTMLElement;
  private navHomeButton: HTMLElement;
  private navConstellationButton: HTMLElement;

  private timeSection: HTMLElement;
  private timeDisplay: HTMLElement;
  private timeScaleDisplay: HTMLElement;
  private timeToggleButton: HTMLButtonElement;
  private playersDisplay: HTMLElement;

  // Resource displays
  private resourcesWidget: HTMLElement;
  private energyDisplay: HTMLElement;
  private alloyDisplay: HTMLElement;
  private alloyRateDisplay: HTMLElement;
  private scienceDisplay: HTMLElement;
  private scienceRateDisplay: HTMLElement;
  private alloyBreakdownTooltip: HTMLElement;
  private alloyBreakdownContent: HTMLElement;
  private resourceBreakdownData: Array<{
    systemId: string;
    systemName: string;
    starName: string;
    alloyPerDay: number;
  }> | null = null;

  // Notification toast
  private notificationToast: HTMLElement;
  private notificationMessage: HTMLElement;
  private notificationTimeout: number | null = null;

  // Mineable objects widget
  private mineableObjectsWidget: HTMLElement;
  private mineableCounter: HTMLElement;
  // Helium-3 objects widget
  private helium3ObjectsWidget: HTMLElement;
  private helium3Counter: HTMLElement;
  private mineableObjects: Array<{ id: string; name: string; type: string }> =
    [];
  private currentMineableIndex: number = 0;
  private isCyclingMineable: boolean = false;
  private helium3Objects: Array<{ id: string; name: string; type: string }> =
    [];
  private currentHelium3Index: number = 0;
  private isCyclingHelium3: boolean = false;

  private systemOutline: HTMLElement;
  private outlineList: HTMLElement;

  // Search modal elements
  private searchModal: HTMLElement;
  private searchButton: HTMLElement;
  private searchInput: HTMLInputElement;
  private searchResults: HTMLElement;

  // Discovery modal elements
  private discoveryModal: HTMLElement;
  private discoveryMessage: HTMLElement;
  private discoveryOkButton: HTMLElement;

  // Overcharge confirmation modal elements
  private overchargeModal: HTMLElement;
  private overchargeConfirmButton: HTMLElement;
  private overchargeCancelButton: HTMLElement;
  private pendingOverchargeTunnelId: string | null = null;

  // Player profile modal elements
  private playerProfileModal: HTMLElement;
  private playerProfileName: HTMLElement;
  private playerProfileStars: HTMLElement;
  private playerProfileCloseButton: HTMLElement;
  private relationshipStatusDisplay: HTMLElement;
  private incomingProposalNotice: HTMLElement;
  private outgoingProposalNotice: HTMLElement;
  private relationshipActions: HTMLElement;
  private proposeFriendlyButton: HTMLElement;
  private declareWarButton: HTMLElement;
  private acceptProposalButton: HTMLElement;
  private rejectProposalButton: HTMLElement;
  private currentProfilePlayerId: string | null = null;
  private currentProfileRelationship: "neutral" | "friendly" | "at_war" = "neutral";
  private currentIncomingProposal: { id: string; fromPlayerId: string } | null = null;
  private currentOutgoingProposal: { id: string; toPlayerId: string } | null = null;

  // Species info modal elements
  private speciesInfoModal: HTMLElement;
  private speciesButton: HTMLElement;
  private speciesNameDisplay: HTMLElement;
  private speciesInfoName: HTMLElement;
  private speciesInfoHomeworld: HTMLElement;
  private speciesInfoBodyType: HTMLElement;
  private speciesInfoSkinColor: HTMLElement;
  private speciesInfoEyeColor: HTMLElement;
  private speciesInfoHeight: HTMLElement;
  private speciesInfoBuild: HTMLElement;
  private speciesInfoTraits: HTMLElement;
  private speciesInfoDescription: HTMLElement;
  private speciesInfoCloseButton: HTMLElement;

  private isPaused = false;
  private isTimeToggleLoading = false;
  private lastButtonState: { isPaused: boolean; isLoading: boolean } | null =
    null;
  private metPlayers: {
    id: string;
    name: string;
    speciesId: string;
    speciesName: string;
  }[] = [];
  private networkClient: any = null; // Reference to network client for requesting stats
  private shouldShowSpeciesModal = false; // Track whether to show species modal on next response
  private isInConstellationView = false; // Track if we're in constellation view (to hide mineable widget)

  // Event handler references for cleanup
  private navHomeHandler: () => void;
  private navConstellationHandler: () => void;
  private timeToggleHandler: () => void;
  private searchButtonHandler: () => void;
  private searchInputHandler: (e: Event) => void;
  private searchKeydownHandler: (e: KeyboardEvent) => void;

  // Callbacks
  public onNavigateHome: (() => void) | null = null;
  public onNavigateConstellation: (() => void) | null = null;
  public onTimeToggle: (() => void) | null = null;
  public onSelectObject: ((objectId: string) => void) | null = null;
  public onSearch: ((query: string) => void) | null = null;
  public onSearchResultClick:
    | ((systemId: string, objectId: string) => void)
    | null = null;
  public onGateTravel: ((gateId: string) => void) | null = null;
  public onGateFortify: ((gateId: string) => void) | null = null;
  public onGateAttack: ((gateId: string) => void) | null = null;
  public onGateCapture: ((gateId: string) => void) | null = null;
  public onGateOvertake: ((gateId: string) => void) | null = null;
  public onGateDebugConnect: ((gateId: string) => void) | null = null;
  public onGetGateDefenseCount: ((gateId: string) => number) | null = null;
  public onTunnelPowerOff: ((tunnelId: string) => void) | null = null;
  public onTunnelPowerOn: ((tunnelId: string) => void) | null = null;
  public onTunnelOvertake: ((tunnelId: string) => void) | null = null;
  public onTunnelOvercharge: ((tunnelId: string) => void) | null = null;
  public onGetGateResourceFlow:
    | ((gateId: string) =>
        | {
            energyFlow: number;
            alloyFlow: number;
            scienceFlow: number;
            isBlockaded: boolean;
            blockadeOwnerName?: string;
          }
        | undefined)
    | null = null;
  public onProposeRelationship:
    | ((targetPlayerId: string, relationshipType: "friendly") => void)
    | null = null;
  public onRespondToProposal:
    | ((proposalId: string, accept: boolean) => void)
    | null = null;
  public onDeclareWar: ((targetPlayerId: string) => void) | null = null;
  public onEstablishMining: ((celestialBodyId: string) => void) | null = null;
  public onEstablishHelium3: ((celestialBodyId: string) => void) | null = null;
  public onLaunchDysonSwarm: ((starId: string) => void) | null = null;
  public onEstablishColony:
    | ((
        planetId: string,
        specialization: "balanced" | "research" | "industrial"
      ) => void)
    | null = null;
  public onInvadeColony: ((planetId: string) => void) | null = null;
  public onRemoveColony: ((planetId: string) => void) | null = null;
  public onUpdateColonySpecialization:
    | ((
        colonyId: string,
        specialization: "balanced" | "research" | "industrial"
      ) => void)
    | null = null;

  constructor() {
    // Navigation
    this.navSection = document.querySelector(".hud-top-left")!;
    this.navHomeButton = document.getElementById("nav-home")!;
    this.navConstellationButton = document.getElementById("nav-constellation")!;

    // Time controls
    this.timeSection = document.querySelector(".hud-top-right")!;
    this.timeDisplay = document.getElementById("time-display")!;
    this.timeScaleDisplay = document.getElementById("time-scale")!;
    this.timeToggleButton = document.getElementById(
      "time-toggle"
    ) as HTMLButtonElement;
    this.playersDisplay = document.getElementById("players-display")!;

    // Resource displays
    this.resourcesWidget = document.getElementById("resources-widget")!;
    this.energyDisplay = document.getElementById("energy-display")!;
    this.alloyDisplay = document.getElementById("alloy-display")!;
    this.alloyRateDisplay = document.getElementById("alloy-rate")!;
    this.scienceDisplay = document.getElementById("science-display")!;
    this.scienceRateDisplay = document.getElementById("science-rate")!;
    this.alloyBreakdownTooltip = document.getElementById(
      "alloy-breakdown-tooltip"
    )!;
    this.alloyBreakdownContent = document.getElementById(
      "alloy-breakdown-content"
    )!;

    // Notification toast
    this.notificationToast = document.getElementById("notification-toast")!;
    this.notificationMessage = document.getElementById("notification-message")!;

    // Mineable objects widget
    this.mineableObjectsWidget = document.getElementById(
      "mineable-objects-widget"
    )!;
    this.mineableCounter = document.getElementById("mineable-counter")!;

    // Helium-3 objects widget
    this.helium3ObjectsWidget = document.getElementById(
      "helium3-objects-widget"
    )!;
    this.helium3Counter = document.getElementById("helium3-counter")!;

    // System outline
    this.systemOutline = document.getElementById("system-outline")!;
    this.outlineList = document.getElementById("outline-list")!;

    // Search modal
    this.searchModal = document.getElementById("search-modal")!;
    this.searchButton = document.getElementById("search-button")!;
    this.searchInput = document.getElementById(
      "search-input"
    ) as HTMLInputElement;
    this.searchResults = document.getElementById("search-results")!;

    // Discovery modal
    this.discoveryModal = document.getElementById("discovery-modal")!;
    this.discoveryMessage = document.getElementById("discovery-message")!;
    this.discoveryOkButton = document.getElementById("discovery-ok-button")!;

    // Discovery OK button handler
    this.discoveryOkButton.addEventListener("click", () => {
      this.discoveryModal.classList.add("hidden");
      this.discoveryModal.style.display = "none";
    });

    // Overcharge confirmation modal
    this.overchargeModal = document.getElementById("overcharge-modal")!;
    this.overchargeConfirmButton = document.getElementById(
      "overcharge-confirm-button"
    )!;
    this.overchargeCancelButton = document.getElementById(
      "overcharge-cancel-button"
    )!;

    // Overcharge modal button handlers
    this.overchargeConfirmButton.addEventListener("click", () => {
      if (this.pendingOverchargeTunnelId && this.onTunnelOvercharge) {
        this.onTunnelOvercharge(this.pendingOverchargeTunnelId);
        this.pendingOverchargeTunnelId = null;
      }
      this.overchargeModal.classList.add("hidden");
      this.overchargeModal.style.display = "none";
    });

    this.overchargeCancelButton.addEventListener("click", () => {
      this.pendingOverchargeTunnelId = null;
      this.overchargeModal.classList.add("hidden");
      this.overchargeModal.style.display = "none";
    });

    // Player profile modal
    this.playerProfileModal = document.getElementById("player-profile-modal")!;
    this.playerProfileName = document.getElementById("player-profile-name")!;
    this.playerProfileStars = document.getElementById("player-profile-stars")!;
    this.playerProfileCloseButton = document.getElementById(
      "player-profile-close-button"
    )!;
    this.relationshipStatusDisplay = document.getElementById("relationship-status-display")!;
    this.incomingProposalNotice = document.getElementById("incoming-proposal-notice")!;
    this.outgoingProposalNotice = document.getElementById("outgoing-proposal-notice")!;
    this.relationshipActions = document.getElementById("relationship-actions")!;
    this.proposeFriendlyButton = document.getElementById("propose-friendly-button")!;
    this.declareWarButton = document.getElementById("declare-war-button")!;
    this.acceptProposalButton = document.getElementById("accept-proposal-button")!;
    this.rejectProposalButton = document.getElementById("reject-proposal-button")!;

    // Species info modal elements
    this.speciesInfoModal = document.getElementById("species-info-modal")!;
    this.speciesButton = document.getElementById("species-button")!;
    this.speciesNameDisplay = document.getElementById("species-name-display")!;
    this.speciesInfoName = document.getElementById("species-info-name")!;
    this.speciesInfoHomeworld = document.getElementById(
      "species-info-homeworld"
    )!;
    this.speciesInfoBodyType = document.getElementById(
      "species-info-body-type"
    )!;
    this.speciesInfoSkinColor = document.getElementById(
      "species-info-skin-color"
    )!;
    this.speciesInfoEyeColor = document.getElementById(
      "species-info-eye-color"
    )!;
    this.speciesInfoHeight = document.getElementById("species-info-height")!;
    this.speciesInfoBuild = document.getElementById("species-info-build")!;
    this.speciesInfoTraits = document.getElementById("species-info-traits")!;
    this.speciesInfoDescription = document.getElementById(
      "species-info-description"
    )!;
    this.speciesInfoCloseButton = document.getElementById(
      "species-info-close-button"
    )!;

    // Player profile close button handler
    this.playerProfileCloseButton.addEventListener("click", () => {
      this.closePlayerProfileModal();
    });

    // Close player profile modal when clicking outside
    this.playerProfileModal.addEventListener("click", (e) => {
      if (e.target === this.playerProfileModal) {
        this.closePlayerProfileModal();
      }
    });

    // Relationship action button handlers
    this.proposeFriendlyButton.addEventListener("click", () => {
      if (this.currentProfilePlayerId && this.onProposeRelationship) {
        this.onProposeRelationship(this.currentProfilePlayerId, "friendly");
      }
    });

    this.declareWarButton.addEventListener("click", () => {
      if (this.currentProfilePlayerId && this.onDeclareWar) {
        this.onDeclareWar(this.currentProfilePlayerId);
      }
    });

    this.acceptProposalButton.addEventListener("click", () => {
      if (this.currentIncomingProposal && this.onRespondToProposal) {
        this.onRespondToProposal(this.currentIncomingProposal.id, true);
      }
    });

    this.rejectProposalButton.addEventListener("click", () => {
      if (this.currentIncomingProposal && this.onRespondToProposal) {
        this.onRespondToProposal(this.currentIncomingProposal.id, false);
      }
    });

    // Species button handler
    this.speciesButton.addEventListener("click", () => {
      this.showSpeciesInfo();
    });

    // Species info close button handler
    this.speciesInfoCloseButton.addEventListener("click", () => {
      this.closeSpeciesInfoModal();
    });

    // Close species info modal when clicking outside
    this.speciesInfoModal.addEventListener("click", (e) => {
      if (e.target === this.speciesInfoModal) {
        this.closeSpeciesInfoModal();
      }
    });

    // Initialize detail views
    this.bodyDetailView = new BodyDetailView();
    this.bodyDetailView.setPlayerGetter((playerId) => this.getPlayerById(playerId));
    this.gateDetailView = new GateDetailView();
    this.shipDetailView = new ShipDetailView();
    this.constellationSystemDetailView = new ConstellationSystemDetailView();

    // Time getter will be set later by main game (needs scene's interpolated time)

    // Setup gate detail view callbacks
    this.gateDetailView.onTravelClick = (gateId: string) => {
      if (this.onGateTravel) {
        this.onGateTravel(gateId);
      }
    };

    this.gateDetailView.onFortifyClick = (gateId: string) => {
      if (this.onGateFortify) {
        this.onGateFortify(gateId);
      }
    };

    this.gateDetailView.onAttackClick = (gateId: string) => {
      if (this.onGateAttack) {
        this.onGateAttack(gateId);
      }
    };

    this.gateDetailView.onCaptureClick = (gateId: string) => {
      if (this.onGateCapture) {
        this.onGateCapture(gateId);
      }
    };

    this.gateDetailView.onOvertakeClick = (gateId: string) => {
      if (this.onGateOvertake) {
        this.onGateOvertake(gateId);
      }
    };

    this.gateDetailView.onPowerOffTunnel = (tunnelId: string) => {
      if (this.onTunnelPowerOff) {
        this.onTunnelPowerOff(tunnelId);
      }
    };

    this.gateDetailView.onPowerOnTunnel = (tunnelId: string) => {
      if (this.onTunnelPowerOn) {
        this.onTunnelPowerOn(tunnelId);
      }
    };
    
    this.gateDetailView.onTunnelOvertake = (tunnelId: string) => {
      if (this.onTunnelOvertake) {
        this.onTunnelOvertake(tunnelId);
      }
    };

    this.gateDetailView.onOverchargeTunnel = (tunnelId: string) => {
      // Show the confirmation modal
      this.pendingOverchargeTunnelId = tunnelId;
      this.overchargeModal.classList.remove("hidden");
      this.overchargeModal.style.display = "flex";
    };

    this.gateDetailView.onDebugConnectClick = (gateId: string) => {
      if (this.onGateDebugConnect) {
        this.onGateDebugConnect(gateId);
      }
    };

    // Create event handler references
    this.navHomeHandler = () => {
      if (this.onNavigateHome) {
        this.onNavigateHome();
      }
    };

    this.navConstellationHandler = () => {
      if (this.onNavigateConstellation) {
        this.onNavigateConstellation();
      }
    };

    this.timeToggleHandler = () => {
      if (this.onTimeToggle) {
        this.onTimeToggle();
      }
    };

    this.searchButtonHandler = () => {
      this.openSearchModal();
    };

    this.searchInputHandler = (e: Event) => {
      const query = (e.target as HTMLInputElement).value.trim();
      if (query && this.onSearch) {
        this.onSearch(query);
      } else if (!query) {
        // Clear results if query is empty
        this.searchResults.innerHTML = "";
      }
    };

    this.searchKeydownHandler = (e: KeyboardEvent) => {
      // Stop all keyboard events from bubbling up when search modal is open
      e.stopPropagation();

      if (e.key === "Escape") {
        this.closeSearchModal();
      }
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.navHomeButton.addEventListener("click", this.navHomeHandler);
    this.navConstellationButton.addEventListener(
      "click",
      this.navConstellationHandler
    );
    this.timeToggleButton.addEventListener("click", this.timeToggleHandler);
    this.searchButton.addEventListener("click", this.searchButtonHandler);
    this.searchInput.addEventListener("input", this.searchInputHandler);
    this.searchModal.addEventListener("keydown", this.searchKeydownHandler);

    // Close search modal when clicking outside content
    this.searchModal.addEventListener("click", (e) => {
      if (e.target === this.searchModal) {
        this.closeSearchModal();
      }
    });

    // Mineable objects widget click handlers
    this.mineableObjectsWidget.addEventListener("click", (e) => {
      console.log("[Mining Badge] Click event fired", e);
      this.cycleToNextMineableObject();
    });

    this.mineableObjectsWidget.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.cycleToPreviousMineableObject();
    });

    // Helium-3 objects widget click handlers
    this.helium3ObjectsWidget.addEventListener("click", (e) => {
      console.log("[Helium-3 Badge] Click event fired", e);
      this.cycleToNextHelium3Object();
    });

    this.helium3ObjectsWidget.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.cycleToPreviousHelium3Object();
    });

    // Alloy rate breakdown tooltip
    this.setupAlloyBreakdownTooltip();
  }

  private setupAlloyBreakdownTooltip(): void {
    let hideTimeout: number | null = null;

    const showTooltip = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }

      if (this.resourceBreakdownData && this.resourceBreakdownData.length > 0) {
        this.showAlloyBreakdown();
      } else {
        // Request breakdown from server
        if (this.networkClient) {
          this.networkClient.requestResourceBreakdown();
        }
      }
    };

    const scheduleHide = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      hideTimeout = window.setTimeout(() => {
        this.hideAlloyBreakdown();
        hideTimeout = null;
      }, 150);
    };

    // Show tooltip on hover over alloy rate
    this.alloyRateDisplay.addEventListener("mouseenter", showTooltip);

    // Hide tooltip when leaving the rate display area
    this.alloyRateDisplay.addEventListener("mouseleave", scheduleHide);

    // Keep tooltip visible when hovering over it
    this.alloyBreakdownTooltip.addEventListener("mouseenter", () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    // Hide tooltip when leaving tooltip area
    this.alloyBreakdownTooltip.addEventListener("mouseleave", scheduleHide);
  }

  private showAlloyBreakdown(): void {
    if (
      !this.resourceBreakdownData ||
      this.resourceBreakdownData.length === 0
    ) {
      return;
    }

    // Clear previous content
    this.alloyBreakdownContent.innerHTML = "";

    // Add each system
    for (const system of this.resourceBreakdownData) {
      if (system.alloyPerDay === 0) continue; // Skip systems with no income

      const systemDiv = document.createElement("div");
      systemDiv.style.cssText =
        "cursor: pointer; padding: 4px 6px; border-radius: 3px; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center; gap: 8px;";

      systemDiv.innerHTML = `
        <div style="color: #e2e8f0; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ⭐ ${system.starName}
        </div>
        <div style="color: ${
          system.alloyPerDay >= 0 ? "#10b981" : "#ef4444"
        }; font-size: 11px; font-weight: bold; white-space: nowrap;">
          ${system.alloyPerDay > 0 ? "+" : ""}${system.alloyPerDay.toFixed(2)}
        </div>
      `;

      systemDiv.addEventListener("mouseenter", () => {
        systemDiv.style.background = "rgba(148, 163, 184, 0.15)";
      });

      systemDiv.addEventListener("mouseleave", () => {
        systemDiv.style.background = "transparent";
      });

      systemDiv.addEventListener("click", () => {
        this.navigateToSystem(system.systemId);
        this.hideAlloyBreakdown();
      });

      this.alloyBreakdownContent.appendChild(systemDiv);
    }

    // Position tooltip near the alloy rate display
    const rect = this.alloyRateDisplay.getBoundingClientRect();
    this.alloyBreakdownTooltip.style.left = `${rect.left}px`;
    this.alloyBreakdownTooltip.style.top = `${rect.bottom + 5}px`;
    this.alloyBreakdownTooltip.style.display = "block";
  }

  private hideAlloyBreakdown(): void {
    this.alloyBreakdownTooltip.style.display = "none";
  }

  private navigateToSystem(systemId: string): void {
    if (this.onSearchResultClick) {
      // Use empty objectId to just navigate to system without selecting a specific object
      this.onSearchResultClick(systemId, "");
    }
  }

  private navigateToSystemAndObject(systemId: string, objectId: string): void {
    if (this.onSearchResultClick) {
      this.onSearchResultClick(systemId, objectId);
    }
  }

  public updateResourceBreakdown(
    breakdown: Array<{
      systemId: string;
      systemName: string;
      starName: string;
      alloyPerDay: number;
    }>
  ): void {
    this.resourceBreakdownData = breakdown;
    // If tooltip is currently visible, update it
    if (this.alloyBreakdownTooltip.style.display === "block") {
      this.showAlloyBreakdown();
    }
  }

  showGameHUD(): void {
    this.navSection.classList.add("visible");
    this.timeSection.classList.add("visible");
    this.searchButton.classList.add("visible");
    this.resourcesWidget.classList.remove("hidden");
  }

  hideGameHUD(): void {
    this.navSection.classList.remove("visible");
    this.timeSection.classList.remove("visible");
    this.searchButton.classList.remove("visible");
    this.resourcesWidget.classList.add("hidden");
  }

  /**
   * Apply a color theme based on the star color
   */
  private applyStarTheme(starColor: string | undefined): void {
    if (!starColor) {
      starColor = "#0f0"; // Default to green if no color provided
    }

    // Parse the hex color to RGB
    let rgb = this.hexToRgb(starColor);
    if (!rgb) return;

    // Calculate brightness (perceived luminance using standard formula)
    const brightness = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) / 255;

    // If star is too dark (brown dwarfs, dim stars), brighten the UI color
    // Minimum brightness threshold: 0.85 (85%)
    const minBrightness = 0.5;
    if (brightness < minBrightness) {
      // Calculate how much we need to boost
      const boostFactor = minBrightness / brightness;
      rgb = {
        r: Math.min(255, Math.floor(rgb.r * boostFactor)),
        g: Math.min(255, Math.floor(rgb.g * boostFactor)),
        b: Math.min(255, Math.floor(rgb.b * boostFactor)),
      };
    }

    // Apply the color as CSS variables
    const root = document.documentElement;

    // Primary color at full brightness (use boosted RGB, not original hex)
    root.style.setProperty(
      "--primary-color",
      `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    );

    // Dimmed version (75% brightness)
    const dim = this.adjustBrightness(rgb, 0.75);
    root.style.setProperty(
      "--primary-color-dim",
      `rgb(${dim.r}, ${dim.g}, ${dim.b})`
    );

    // Dark backgrounds with alpha
    root.style.setProperty(
      "--primary-color-dark",
      `rgba(${Math.floor(rgb.r * 0.2)}, ${Math.floor(
        rgb.g * 0.2
      )}, ${Math.floor(rgb.b * 0.2)}, 0.8)`
    );
    root.style.setProperty(
      "--primary-color-darker",
      `rgba(${Math.floor(rgb.r * 0.4)}, ${Math.floor(
        rgb.g * 0.4
      )}, ${Math.floor(rgb.b * 0.4)}, 0.9)`
    );
    root.style.setProperty(
      "--primary-color-darkest",
      `rgb(${Math.floor(rgb.r * 0.1)}, ${Math.floor(rgb.g * 0.1)}, ${Math.floor(
        rgb.b * 0.1
      )})`
    );

    // Hover states
    root.style.setProperty(
      "--primary-color-hover",
      `rgba(${Math.floor(rgb.r * 0.5)}, ${Math.floor(
        rgb.g * 0.5
      )}, ${Math.floor(rgb.b * 0.5)}, 0.4)`
    );
    root.style.setProperty(
      "--primary-color-hover-solid",
      `rgba(${Math.floor(rgb.r * 0.5)}, ${Math.floor(
        rgb.g * 0.5
      )}, ${Math.floor(rgb.b * 0.5)}, 0.9)`
    );

    // Selected/active states (dimmer for better text readability)
    root.style.setProperty(
      "--primary-color-selected",
      `rgba(${Math.floor(rgb.r * 0.4)}, ${Math.floor(
        rgb.g * 0.4
      )}, ${Math.floor(rgb.b * 0.4)}, 0.5)`
    );
    root.style.setProperty(
      "--primary-color-active",
      `rgba(${Math.floor(rgb.r * 0.5)}, ${Math.floor(
        rgb.g * 0.5
      )}, ${Math.floor(rgb.b * 0.5)}, 0.9)`
    );

    // Scrollbar track
    root.style.setProperty(
      "--primary-color-scrollbar-track",
      `rgba(${Math.floor(rgb.r * 0.2)}, ${Math.floor(
        rgb.g * 0.2
      )}, ${Math.floor(rgb.b * 0.2)}, 0.5)`
    );
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    // Remove # if present
    hex = hex.replace("#", "");

    // Parse hex values
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    } else if (hex.length === 3) {
      return {
        r: parseInt(hex.substring(0, 1) + hex.substring(0, 1), 16),
        g: parseInt(hex.substring(1, 2) + hex.substring(1, 2), 16),
        b: parseInt(hex.substring(2, 3) + hex.substring(2, 3), 16),
      };
    }

    return null;
  }

  /**
   * Adjust RGB brightness by a factor
   */
  private adjustBrightness(
    rgb: { r: number; g: number; b: number },
    factor: number
  ): { r: number; g: number; b: number } {
    return {
      r: Math.min(255, Math.floor(rgb.r * factor)),
      g: Math.min(255, Math.floor(rgb.g * factor)),
      b: Math.min(255, Math.floor(rgb.b * factor)),
    };
  }

  showError(message: string): void {
    // Use notification system instead of old lobby error message
    this.showNotification(message, 5000);
  }

  showGameOver(reason: string, onAction: () => void): void {
    const modal = document.getElementById("game-over-modal");
    const message = document.getElementById("game-over-message");
    const button = document.getElementById("game-over-ok-button");

    if (modal && message && button) {
      message.textContent = reason;
      modal.classList.remove("hidden");
      modal.style.display = "flex";

      button.onclick = () => {
        modal.classList.add("hidden");
        modal.style.display = "none";
        onAction();
      };
    }
  }

  clearError(): void {
    // No-op: notifications auto-dismiss
  }

  setPlayer(player: Player): void {
    this.player = player;
    // Don't auto-hide auth modal here - let main.ts control when to hide it
    // This allows the lobby screen to stay visible on page reload
    // Update body detail view with home planet reference and player ID
    this.bodyDetailView.setHomePlanet(this.player, this.system);
    this.bodyDetailView.setCurrentPlayerId(player.id);
    // Update resource displays
    this.updateResourceDisplays();
    // Request species info to update the species button name
    if (this.player.speciesId && this.networkClient) {
      this.networkClient.requestSpeciesInfo(this.player.speciesId);
    }
  }

  /**
   * Set whether the current system is connected to the player's capital
   */
  setConnectedToCapital(isConnected: boolean): void {
    this.isConnectedToCapital = isConnected;
    this.bodyDetailView.setConnectedToCapital(isConnected);
  }

  private updateResourceDisplays(): void {
    if (!this.player) return;

    // Floor energy to 2 decimal places (round down, not up)
    const energyFloored = Math.floor(this.player.energy * 100) / 100;
    this.energyDisplay.textContent = energyFloored.toFixed(2);

    // Floor alloy to 2 decimal places (round down, not up)
    const alloyFloored = Math.floor(this.player.alloy * 100) / 100;

    // Floor science to 2 decimal places
    const scienceFloored = Math.floor(this.player.science * 100) / 100;
    this.alloyDisplay.textContent = alloyFloored.toFixed(2);

    // Display science
    this.scienceDisplay.textContent = scienceFloored.toFixed(2);

    // Display alloy income rate from mining operations
    if (this.player.alloyPerDay !== undefined) {
      const ratePerDay = this.player.alloyPerDay;

      // Format with + or - sign and 2 decimal places
      const formattedRate =
        (ratePerDay >= 0 ? "+" : "") + ratePerDay.toFixed(2);
      this.alloyRateDisplay.textContent = formattedRate + "/d";

      // Color based on positive/negative
      this.alloyRateDisplay.style.color =
        ratePerDay >= 0 ? "#10b981" : "#ef4444";
    } else {
      // If no rate data yet, clear the display
      this.alloyRateDisplay.textContent = "";
    }

    // Display science income rate from colonies
    if (this.player.sciencePerDay !== undefined) {
      const scienceRate = this.player.sciencePerDay;

      // Format with + or - sign and 2 decimal places
      const formattedRate =
        (scienceRate >= 0 ? "+" : "") + scienceRate.toFixed(2);
      this.scienceRateDisplay.textContent = formattedRate + "/d";

      // Color based on positive/negative
      this.scienceRateDisplay.style.color =
        scienceRate >= 0 ? "#10b981" : "#ef4444";
    } else {
      // If no rate data yet, clear the display
      this.scienceRateDisplay.textContent = "";
    }
  }

  setGateOwnership(
    gateId: string,
    ownerId: string,
    ownerName: string,
    status: string,
    lastOvertakenAt?: number
  ): void {
    this.gateOwnership.set(gateId, {
      ownerId,
      ownerName,
      status,
      lastOvertakenAt: lastOvertakenAt || 0,
    });

    // Update the outliner to reflect the new ownership
    this.updateGateInOutliner(gateId, status);
  }

  /**
   * Update a specific gate's appearance in the outliner
   */
  private updateGateInOutliner(gateId: string, status: string): void {
    // Find the gate item in the outliner
    const gateItem = this.outlineList.querySelector(
      `.outline-item.gate[data-object-id="${gateId}"]`
    ) as HTMLElement;

    if (!gateItem) return;

    // Determine new color and status symbol
    let gateColor = "#a855f7"; // Purple default
    let statusSymbol = "◈";

    switch (status) {
      case "owned_by_self":
        gateColor = "#fbbf24"; // Orange for owned by self
        statusSymbol = "⚡";
        break;
      case "neutral":
        gateColor = "#9ca3af"; // Gray for neutral
        statusSymbol = "●";
        break;
      case "aggressive":
        gateColor = "#ef4444"; // Red for aggressive
        statusSymbol = "▲";
        break;
      case "friendly":
        gateColor = "#10b981"; // Green for friendly
        statusSymbol = "✓";
        break;
      case "unexplored":
        gateColor = "#a855f7"; // Purple for unexplored
        statusSymbol = "◈";
        break;
    }

    // Update the gate item's color
    gateItem.style.color = gateColor;

    // Get the actual gate object to ensure we have the correct name
    const gate = this.system?.gates?.find((g) => g.id === gateId);
    let gateName = "???";

    // If we found the gate and player has explored it, show the real name
    if (gate) {
      const isExplored =
        this.player?.exploredGateIds?.includes(gateId) ?? false;
      if (isExplored) {
        gateName = gate.name;
      } else {
        // Try to preserve existing name from current text if not explored
        const currentText = gateItem.textContent || "";
        const gateNameMatch = currentText.match(/[◈⚡●▲✓⚠]\s+(.+)/);
        gateName = gateNameMatch ? gateNameMatch[1] : "???";
      }
    }

    gateItem.textContent = `${statusSymbol} ${gateName}`;
  }

  clearGateOwnership(): void {
    this.gateOwnership.clear();
  }

  updateTunnelOwnership(
    tunnelOwnerships: Array<{
      gateId: string;
      tunnelId: string;
      thisGateOwnerId?: string;
      thisGateOwnerName?: string;
      thisGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      thisGateDefenseCount?: number;
      otherGateOwnerId?: string;
      otherGateOwnerName?: string;
      otherGateStatus?: "owned_by_self" | "neutral" | "friendly" | "aggressive";
      otherGateDefenseCount?: number;
      tunnelPoweredByPlayerId?: string | null;
      tunnelPoweredByPlayerName?: string | null;
      overchargedAt?: number | null;
    }>
  ): void {
    for (const ownership of tunnelOwnerships) {
      this.tunnelOwnership.set(ownership.gateId, ownership);
    }
  }

  setSystem(
    system: StarSystem,
    isRefresh: boolean = false,
    fromConstellationView: boolean = false
  ): void {
    const isSystemChange = this.system?.id !== system.id;
    this.system = system;

    // Set current system on body detail view for mining checks
    this.bodyDetailView.setCurrentSystem(system);

    // Only hide panels and repopulate outline when actually changing systems
    // OR when coming from constellation view (to ensure theme is applied)
    if (isSystemChange || !isRefresh || fromConstellationView) {
      // CRITICAL: Hide all panels when changing systems
      // This prevents detail panels from the previous system from remaining visible
      this.hideDetailPanels();

      // Apply theme FIRST so outline elements are created with the correct colors
      this.applyStarTheme(system.star.color);
      this.populateSystemOutline();

      // Restore selection after repopulating outline
      if (this.selectedObjectId) {
        this.updateSelectedInOutline(this.selectedObjectId);
      }
    }

    // Update body detail view with home planet reference
    this.bodyDetailView.setHomePlanet(this.player, this.system);

    // Update mineable objects widget
    this.updateMineableObjectsWidget();
    // Update Helium-3 objects widget
    this.updateHelium3ObjectsWidget();

    // Enable transitions after elements are rendered (next frame)
    // This prevents the green flash on initial load
    requestAnimationFrame(() => {
      document.body.classList.remove("no-theme-transition");
    });
  }

  setShip(ship: Ship): void {
    this.ship = ship;
  }

  hideOutline(): void {
    this.systemOutline.classList.add("hidden");
    // Also hide detail panels during transitions
    this.hideDetailPanels();
    
    // Immediately hide mineable objects widget (no animation)
    this.mineableObjectsWidget.classList.remove("animate-in", "animate-out");
    this.mineableObjectsWidget.classList.add("hidden");
    this.mineableObjects = [];
    this.currentMineableIndex = 0;
    this.isCyclingMineable = false;
    
    // Immediately hide Helium-3 objects widget (no animation)
    this.helium3ObjectsWidget.classList.remove("animate-in", "animate-out");
    this.helium3ObjectsWidget.classList.add("hidden");
    this.helium3Objects = [];
    this.currentHelium3Index = 0;
    this.isCyclingHelium3 = false;
    
    // Reset theme to default green when leaving system view
    this.applyStarTheme("#0f0");
  }

  /**
   * Clear system reference and hide all widgets (for returning to lobby)
   */
  clearSystem(): void {
    this.system = null;
    this.player = null;
    
    // Call update methods which will see !this.system and hide widgets properly
    this.updateMineableObjectsWidget();
    this.updateHelium3ObjectsWidget();
    
    // Hide outline and detail panels
    this.systemOutline.classList.add("hidden");
    this.hideDetailPanels();
  }

  /**
   * Set constellation view state (used to hide mineable widget)
   */
  setConstellationViewState(isInConstellation: boolean): void {
    this.isInConstellationView = isInConstellation;
    // If entering constellation view, immediately hide both widgets
    if (isInConstellation) {
      this.mineableObjectsWidget.classList.remove("animate-in", "animate-out");
      this.mineableObjectsWidget.classList.add("hidden");
      this.helium3ObjectsWidget.classList.remove("animate-in", "animate-out");
      this.helium3ObjectsWidget.classList.add("hidden");
    }
    // If exiting constellation view, update widgets based on current system
    else {
      this.updateMineableObjectsWidget();
      this.updateHelium3ObjectsWidget();
    }
  }

  showOutline(): void {
    this.systemOutline.classList.remove("hidden");
  }

  hideDetailPanels(): void {
    // CRITICAL: Reset selected object ID FIRST to prevent race conditions
    this.selectedObjectId = null;

    // Then hide all detail panels
    this.bodyDetailView.hide();
    this.gateDetailView.hide();
    this.shipDetailView.hide();
    this.constellationSystemDetailView.hide();
  }

  private populateSystemOutline(): void {
    if (!this.system) return;

    // Save current asteroid belt and moon indices before clearing
    const savedAsteroidIndices = new Map<string, number>();
    const savedMoonIndices = new Map<string, number>();

    const existingBelts = this.outlineList.querySelectorAll(
      ".outline-item.asteroid-belt"
    );
    existingBelts.forEach((item) => {
      const beltId = (item as HTMLElement).dataset.beltId;
      const asteroidIndex = (item as HTMLElement).dataset.asteroidIndex;
      if (beltId && asteroidIndex) {
        savedAsteroidIndices.set(beltId, parseInt(asteroidIndex));
      }
    });

    const existingMoons =
      this.outlineList.querySelectorAll(".outline-item.moon");
    existingMoons.forEach((item) => {
      const planetId = (item as HTMLElement).dataset.planetId;
      const moonIndex = (item as HTMLElement).dataset.moonIndex;
      if (planetId && moonIndex) {
        savedMoonIndices.set(planetId, parseInt(moonIndex));
      }
    });

    // Clear existing list
    this.outlineList.innerHTML = "";

    // Helper function to add planets and asteroid belts for a star
    const addStarWithOrbitals = (
      star: any,
      planets: any[],
      asteroidBelts: any[]
    ) => {
      // Add star item
      const starItem = document.createElement("div");
      starItem.className = "outline-item star";
      starItem.textContent = `★ ${star.name}`;
      starItem.dataset.objectId = star.id;
      // Apply the star's actual color to the outline item
      if (star.color) {
        starItem.style.color = star.color;
      }
      starItem.addEventListener("click", () => {
        if (this.onSelectObject) {
          this.onSelectObject(star.id);
        }
      });
      this.outlineList.appendChild(starItem);

      // Create mixed list of planets and asteroid belts sorted by distance from star
      const orbitalObjects: Array<{
        type: "planet" | "asteroidBelt";
        distance: number;
        data: any;
        asteroidIndex?: number;
      }> = [];

      // Add planets for this star
      planets.forEach((planet) => {
        const distance = planet.orbitalElements?.semiMajorAxis || 0;
        orbitalObjects.push({ type: "planet", distance, data: planet });
      });

      // Add asteroid belts for this star (using average of inner and outer radius)
      asteroidBelts.forEach((belt) => {
        const distance = (belt.innerRadius + belt.outerRadius) / 2;
        orbitalObjects.push({
          type: "asteroidBelt",
          distance,
          data: belt,
          asteroidIndex: 0,
        });
      });

      // Sort by distance
      orbitalObjects.sort((a, b) => a.distance - b.distance);

      // Add sorted items to outline
      let planetIndex = 0;
      orbitalObjects.forEach((obj) => {
        if (obj.type === "planet") {
          planetIndex++;
          const planet = obj.data;
          const planetItem = document.createElement("div");
          planetItem.className = "outline-item planet";
          const planetType = planet.planetType ? ` - ${planet.planetType}` : "";
          planetItem.textContent = `   ${planetIndex}. ${planet.name}${planetType}`;
          planetItem.dataset.objectId = planet.id;

          // Color habitable planets green
          if (planet.habitability !== undefined && planet.habitability >= 0.6) {
            planetItem.style.color = "#00ff00"; // Green for habitable planets
          }

          planetItem.addEventListener("click", () => {
            if (this.onSelectObject) {
              this.onSelectObject(planet.id);
            }
          });
          this.outlineList.appendChild(planetItem);

          // Add moons similar to asteroid belt behavior
          if (planet.moons && planet.moons.length > 0) {
            if (planet.moons.length === 1) {
              // Single moon: show its name directly
              const moon = planet.moons[0];
              const moonItem = document.createElement("div");
              moonItem.className = "outline-item moon";
              moonItem.textContent = `  └ ${moon.name}`;
              moonItem.dataset.objectId = moon.id;
              moonItem.addEventListener("click", () => {
                if (this.onSelectObject) {
                  this.onSelectObject(moon.id);
                }
              });
              this.outlineList.appendChild(moonItem);
            } else {
              // Multiple moons: show "Moons - #" and cycle through them
              const moonItem = document.createElement("div");
              moonItem.className = "outline-item moon";
              moonItem.textContent = `  └ Moons - ${planet.moons.length}`;
              moonItem.dataset.planetId = planet.id;
              // Restore saved moon index or default to 0
              const savedIndex = savedMoonIndices.get(planet.id) || 0;
              moonItem.dataset.moonIndex = savedIndex.toString();
              // Update display if index is not 0
              if (savedIndex > 0) {
                moonItem.textContent = `  └ Moons - ${savedIndex + 1}/${
                  planet.moons.length
                }`;
              }
              moonItem.addEventListener("click", () => {
                // Cycle through moons (forward)
                const currentIndex = parseInt(
                  moonItem.dataset.moonIndex || "0"
                );
                const moons = planet.moons;

                if (moons && moons.length > 0) {
                  const moon = moons[currentIndex];
                  if (this.onSelectObject) {
                    this.onSelectObject(moon.id);
                  }

                  // Update index for next click
                  const nextIndex = (currentIndex + 1) % moons.length;
                  moonItem.dataset.moonIndex = nextIndex.toString();

                  // Update display to show current moon
                  moonItem.textContent = `  └ Moons - ${currentIndex + 1}/${
                    moons.length
                  }`;
                }
              });

              // Right-click to cycle backwards
              moonItem.addEventListener("contextmenu", (e) => {
                e.preventDefault(); // Prevent default context menu

                // Cycle through moons (backward)
                const currentIndex = parseInt(
                  moonItem.dataset.moonIndex || "0"
                );
                const moons = planet.moons;

                if (moons && moons.length > 0) {
                  // Go back one (wrap around if at beginning)
                  const prevIndex =
                    (currentIndex - 1 + moons.length) % moons.length;
                  const moon = moons[prevIndex];

                  if (this.onSelectObject) {
                    this.onSelectObject(moon.id);
                  }

                  // Update index
                  moonItem.dataset.moonIndex = prevIndex.toString();

                  // Update display to show current moon
                  moonItem.textContent = `  └ Moons - ${prevIndex + 1}/${
                    moons.length
                  }`;
                }
              });

              this.outlineList.appendChild(moonItem);
            }
          }
        } else if (obj.type === "asteroidBelt") {
          const belt = obj.data;
          const beltItem = document.createElement("div");
          beltItem.className = "outline-item asteroid-belt";
          beltItem.textContent = `   ◦ ${belt.name} - ${belt.asteroidCount}`;
          beltItem.dataset.beltId = belt.id;
          // Restore saved asteroid index or default to 0
          const savedIndex = savedAsteroidIndices.get(belt.id) || 0;
          beltItem.dataset.asteroidIndex = savedIndex.toString();
          // Update display if index is not 0
          if (savedIndex > 0 && belt.asteroids && belt.asteroids.length > 0) {
            beltItem.textContent = `   ◦ ${belt.name} - ${savedIndex + 1}/${
              belt.asteroids.length
            }`;
          }
          beltItem.addEventListener("click", () => {
            // Cycle through asteroids in the belt (forward)
            const currentIndex = parseInt(
              beltItem.dataset.asteroidIndex || "0"
            );
            const asteroids = belt.asteroids;

            if (asteroids && asteroids.length > 0) {
              const asteroid = asteroids[currentIndex];
              if (this.onSelectObject) {
                this.onSelectObject(asteroid.id);
              }

              // Update index for next click
              const nextIndex = (currentIndex + 1) % asteroids.length;
              beltItem.dataset.asteroidIndex = nextIndex.toString();

              // Update display to show current asteroid
              beltItem.textContent = `   ◦ ${belt.name} - ${currentIndex + 1}/${
                asteroids.length
              }`;
            }
          });

          // Right-click to cycle backwards
          beltItem.addEventListener("contextmenu", (e) => {
            e.preventDefault(); // Prevent default context menu

            // Cycle through asteroids in the belt (backward)
            const currentIndex = parseInt(
              beltItem.dataset.asteroidIndex || "0"
            );
            const asteroids = belt.asteroids;

            if (asteroids && asteroids.length > 0) {
              // Go back one (wrap around if at beginning)
              const prevIndex =
                (currentIndex - 1 + asteroids.length) % asteroids.length;
              const asteroid = asteroids[prevIndex];

              if (this.onSelectObject) {
                this.onSelectObject(asteroid.id);
              }

              // Update index
              beltItem.dataset.asteroidIndex = prevIndex.toString();

              // Update display to show current asteroid
              beltItem.textContent = `   ◦ ${belt.name} - ${prevIndex + 1}/${
                asteroids.length
              }`;
            }
          });

          this.outlineList.appendChild(beltItem);
        }
      });
    };

    // Group planets and asteroid belts by parent star
    const planetsByStar = new Map<string, any[]>();
    const asteroidBeltsByStar = new Map<string, any[]>();

    // Group planets by parentId
    this.system.planets.forEach((planet) => {
      const parentId = planet.parentId || this.system!.star.id;
      if (!planetsByStar.has(parentId)) {
        planetsByStar.set(parentId, []);
      }
      planetsByStar.get(parentId)!.push(planet);
    });

    // Group asteroid belts by parentId
    if (this.system.asteroidBelts) {
      this.system.asteroidBelts.forEach((belt) => {
        const parentId = belt.parentId || this.system!.star.id;
        if (!asteroidBeltsByStar.has(parentId)) {
          asteroidBeltsByStar.set(parentId, []);
        }
        asteroidBeltsByStar.get(parentId)!.push(belt);
      });
    }

    // Add primary star first with its planets and belts
    const primaryPlanets = planetsByStar.get(this.system.star.id) || [];
    const primaryBelts = asteroidBeltsByStar.get(this.system.star.id) || [];
    addStarWithOrbitals(this.system.star, primaryPlanets, primaryBelts);

    // Add companion stars with their planets and belts
    if (this.system.companionStars && this.system.companionStars.length > 0) {
      this.system.companionStars.forEach((companionStar) => {
        const companionPlanets = planetsByStar.get(companionStar.id) || [];
        const companionBelts = asteroidBeltsByStar.get(companionStar.id) || [];
        addStarWithOrbitals(companionStar, companionPlanets, companionBelts);
      });
    }

    // Add gates (gates are system-wide, not star-specific)
    if (this.system.gates && this.system.gates.length > 0) {
      this.system.gates.forEach((gate) => {
        const gateItem = document.createElement("div");
        gateItem.className = "outline-item gate";

        // Check if gate is explored by current player
        const isExploredBySelf =
          this.player?.exploredGateIds?.includes(gate.id) ?? false;

        // Get gate ownership to determine color and display
        const ownership = this.gateOwnership.get(gate.id);
        let gateColor = "#a855f7"; // Purple for unexplored (default)
        let status = "◈"; // Unexplored symbol
        let gateName = "???";

        // If gate has an owner, show diplomatic stance color even if not explored by us
        if (ownership) {
          switch (ownership.status) {
            case "owned_by_self":
              gateColor = "#fbbf24"; // Orange for owned by self
              status = "⚡";
              break;
            case "neutral":
              gateColor = "#9ca3af"; // Gray for neutral
              status = "●";
              break;
            case "friendly":
              gateColor = "#10b981"; // Green for friendly
              status = "✓";
              break;
            case "aggressive":
              gateColor = "#ef4444"; // Red for aggressive
              status = "⚠";
              break;
          }

          // Only show the name if we've explored it ourselves
          if (isExploredBySelf) {
            gateName = gate.name;
          } else {
            // Not explored by us - keep it as ???
            gateName = "???";
          }
        } else if (isExploredBySelf) {
          // Explored by us, no ownership info (shouldn't happen)
          status = "⚡";
          gateName = gate.name;
          gateColor = "#fbbf24";
        }
        // else: truly unexplored (no owner, not explored by us) - keep defaults

        gateItem.style.color = gateColor;
        gateItem.textContent = `${status} ${gateName}`;
        gateItem.dataset.objectId = gate.id;
        gateItem.addEventListener("click", () => {
          if (this.onSelectObject) {
            this.onSelectObject(gate.id);
          }
        });
        this.outlineList.appendChild(gateItem);
      });
    }

    // Show the outline panel
    this.systemOutline.classList.remove("hidden");
  }

  updateSelectedInOutline(objectId: string): void {
    // Check if the item is already selected to avoid unnecessary DOM manipulation
    const selectedItem = this.outlineList.querySelector(
      `[data-object-id="${objectId}"]`
    );
    if (selectedItem && selectedItem.classList.contains("selected")) {
      // Already selected, no need to update
      return;
    }

    // Remove previous selection
    const items = this.outlineList.querySelectorAll(".outline-item");
    items.forEach((item) => item.classList.remove("selected"));

    // Highlight current selection
    if (selectedItem) {
      selectedItem.classList.add("selected");
    }
  }

  updateTime(currentTime: number, isPaused: boolean, timeScale: number): void {
    this.currentTime = currentTime;
    const pauseStateChanged = this.isPaused !== isPaused;
    this.isPaused = isPaused;

    // Clear loading state when server confirms
    if (this.isTimeToggleLoading) {
      this.isTimeToggleLoading = false;
      this.updateTimeToggleButtonIfNeeded();
    } else if (pauseStateChanged) {
      // Only update button if pause state changed
      this.updateTimeToggleButtonIfNeeded();
    }

    // Convert to years, days, and hours (skip minutes - too fast at 10000x scale)
    const totalDays = currentTime / 86400;
    const years = Math.floor(totalDays / DAYS_PER_YEAR);
    const days = Math.floor(totalDays % DAYS_PER_YEAR);
    const hours = Math.floor((currentTime % 86400) / 3600);

    // Format: show years if >= 1, otherwise just days and hours
    if (years > 0) {
      this.timeDisplay.textContent = `${years}y ${days}d ${hours}h`;
    } else {
      this.timeDisplay.textContent = `${days}d ${hours}h`;
    }
    this.timeScaleDisplay.textContent = `${timeScale.toFixed(0)}x`;
  }

  private updateTimeToggleButtonIfNeeded(): void {
    // Only update if state actually changed
    if (
      !this.lastButtonState ||
      this.lastButtonState.isPaused !== this.isPaused ||
      this.lastButtonState.isLoading !== this.isTimeToggleLoading
    ) {
      this.lastButtonState = {
        isPaused: this.isPaused,
        isLoading: this.isTimeToggleLoading,
      };

      if (this.isTimeToggleLoading) {
        this.timeToggleButton.innerHTML = '<span class="spinner"></span>';
        this.timeToggleButton.disabled = true;
      } else {
        this.timeToggleButton.textContent = this.isPaused ? "Resume" : "Pause";
        this.timeToggleButton.disabled = false;
      }
    }
  }

  setTimeToggleLoading(loading: boolean): void {
    this.isTimeToggleLoading = loading;
    this.updateTimeToggleButtonIfNeeded();
  }

  updateObjectDetails(objectId: string): void {
    if (!this.system || !this.currentState) {
      return;
    }

    // Hide ALL detail panels before showing a new one if selecting a different object
    // This ensures only one detail panel is visible at a time
    if (this.selectedObjectId !== objectId) {
      this.bodyDetailView.hide(false);
      this.gateDetailView.hide();
      this.shipDetailView.hide();
      this.constellationSystemDetailView.hide();
    }

    // Update the selected object ID
    this.selectedObjectId = objectId;

    // Update outline selection
    this.updateSelectedInOutline(objectId);

    // Check if it's a gate
    const gate = this.system.gates?.find((g) => g.id === objectId);
    if (gate) {
      const ownerInfo = this.gateOwnership.get(gate.id);
      const tunnelOwnershipData = this.tunnelOwnership.get(gate.id);

      // ALWAYS use scene's defense count as single source of truth
      // The scene tracks actual rendered platforms and handles duplicates correctly
      const defenseCount = this.onGetGateDefenseCount
        ? this.onGetGateDefenseCount(gate.id)
        : 0;

      // Get destination defense count from tunnel ownership if available,
      // but we can't get it from scene since destination gate is in another system
      const destinationDefenseCount =
        tunnelOwnershipData?.otherGateDefenseCount ?? 0;

      const resourceFlow = this.onGetGateResourceFlow
        ? this.onGetGateResourceFlow(gate.id)
        : undefined;

      // Build tunnel information from tunnelOwnership data
      let tunnelInfo:
        | {
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
        | undefined;

      // ALWAYS create tunnelInfo so the section is always shown
      if (tunnelOwnershipData) {
        // Determine if player can travel or has full tunnel power
        const playerOwnsThis =
          tunnelOwnershipData.thisGateOwnerId === this.player?.id;
        const playerOwnsOther =
          tunnelOwnershipData.otherGateOwnerId === this.player?.id;

        // Get species name if tunnel is powered by current player
        let tunnelPoweredBySpeciesName = null;
        if (tunnelOwnershipData.tunnelPoweredByPlayerId === this.player?.id) {
          tunnelPoweredBySpeciesName =
            this.speciesNameDisplay.textContent || null;
        }

        tunnelInfo = {
          gateAOwnerName:
            tunnelOwnershipData.thisGateOwnerName || "Uncontrolled",
          gateBOwnerName:
            tunnelOwnershipData.otherGateOwnerName || "Uncontrolled",
          gateAStatus: tunnelOwnershipData.thisGateStatus,
          gateBStatus: tunnelOwnershipData.otherGateStatus,
          tunnelPoweredByPlayerId: tunnelOwnershipData.tunnelPoweredByPlayerId,
          tunnelPoweredByPlayerName:
            tunnelOwnershipData.tunnelPoweredByPlayerName,
          tunnelPoweredBySpeciesName: tunnelPoweredBySpeciesName,
          tunnelId: tunnelOwnershipData.tunnelId,
          canTravel: playerOwnsThis || playerOwnsOther,
          hasTunnelPower:
            tunnelOwnershipData.tunnelPoweredByPlayerId === this.player?.id,
          overchargeTimeRemaining: this.calculateOverchargeCooldown(
            tunnelOwnershipData.overchargedAt
          ),
        };
      } else {
        // No tunnel ownership data yet - show default values
        tunnelInfo = {
          gateAOwnerName: "Uncontrolled",
          gateBOwnerName: "Uncontrolled",
          gateAStatus: undefined,
          gateBStatus: undefined,
          tunnelPoweredByPlayerId: null,
          tunnelPoweredByPlayerName: null,
          tunnelPoweredBySpeciesName: null,
          tunnelId: undefined,
          canTravel: false,
          hasTunnelPower: false,
          overchargeTimeRemaining: null,
        };
      }

      this.gateDetailView.show(
        gate,
        this.player,
        this.system,
        this.currentState,
        ownerInfo,
        defenseCount,
        this.currentState.currentTime,
        resourceFlow,
        destinationDefenseCount,
        tunnelInfo
      );
      return;
    }

    // Find celestial body in system (star, planet, or asteroid)
    let body = null;
    let bodyState = null;

    if (this.system.star.id === objectId) {
      body = this.system.star;
      bodyState = this.currentState.bodies.find((b) => b.id === objectId);
    } else if (
      this.system.companionStars &&
      this.system.companionStars.some((cs) => cs.id === objectId)
    ) {
      // Check companion stars
      body = this.system.companionStars.find((cs) => cs.id === objectId);
      if (body) {
        bodyState = this.currentState.bodies.find((b) => b.id === objectId);
      }
    } else {
      // Check planets
      body = this.system.planets.find((p) => p.id === objectId);
      if (body) {
        bodyState = this.currentState.bodies.find((b) => b.id === objectId);
      } else {
        // Check moons
        body = this.system.moons.find((m) => m.id === objectId);
        if (body) {
          bodyState = this.currentState.moons.find((m) => m.id === objectId);
        } else {
          // Check asteroids
          for (const belt of this.system.asteroidBelts) {
            const asteroid = belt.asteroids.find((a) => a.id === objectId);
            if (asteroid) {
              body = asteroid;
              bodyState = this.currentState.asteroids.find(
                (a) => a.id === objectId
              );
              break;
            }
          }
        }
      }
    }

    if (body && bodyState) {
      this.bodyDetailView.show(body, bodyState, this.currentState);
      return;
    }

    // Check if it's a ship
    const shipState = this.currentState.ships.find((s) => s.id === objectId);
    if (shipState && this.ship && this.system) {
      this.shipDetailView.show(this.ship, this.currentState, this.system);
      return;
    }
  }

  updateState(state: SystemState): void {
    this.currentState = state;
    // Update mineable objects widget when state changes (e.g., mining operations established)
    this.updateMineableObjectsWidget();
    // Update Helium-3 objects widget when state changes
    this.updateHelium3ObjectsWidget();
  }

  /**
   * Show constellation system details (when a system is selected in constellation view)
   */
  showConstellationSystemDetails(node: ConstellationNode): void {
    // CRITICAL: Reset selected object ID FIRST to prevent showing multiple panels
    this.selectedObjectId = null;

    // Hide all other detail views BEFORE showing constellation details
    this.bodyDetailView.hide();
    this.gateDetailView.hide();
    this.shipDetailView.hide();

    // Finally, show system info in constellation system detail view
    this.constellationSystemDetailView.show(node);
  }

  /**
   * Open the search modal
   */
  openSearchModal(): void {
    this.searchModal.classList.remove("hidden");
    this.searchInput.value = "";
    this.searchResults.innerHTML = "";
    this.searchInput.focus();
  }

  /**
   * Close the search modal
   */
  closeSearchModal(): void {
    this.searchModal.classList.add("hidden");
  }

  /**
   * Check if search modal is currently open
   */
  isSearchModalOpen(): boolean {
    return !this.searchModal.classList.contains("hidden");
  }

  /**
   * Display search results
   */
  displaySearchResults(results: SearchResult[]): void {
    this.searchResults.innerHTML = "";

    if (results.length === 0) {
      this.searchResults.innerHTML =
        '<div style="color: var(--primary-color-dim); text-align: center; padding: 20px;">No results found</div>';
      return;
    }

    results.forEach((result) => {
      const item = document.createElement("div");
      item.className = "search-result-item";

      const name = document.createElement("div");
      name.className = "search-result-name";
      name.textContent = result.objectName;

      const details = document.createElement("div");
      details.className = "search-result-details";
      details.textContent = `${result.starName} - ${result.objectType}`;

      item.appendChild(name);
      item.appendChild(details);

      item.addEventListener("click", () => {
        if (this.onSearchResultClick) {
          this.onSearchResultClick(result.systemId, result.objectId);
        }
        this.closeSearchModal();
      });

      this.searchResults.appendChild(item);
    });
  }

  /**
   * Cleanup method to prevent memory leaks
   * Removes all event listeners
   */
  dispose(): void {
    // Remove event listeners
    this.navHomeButton.removeEventListener("click", this.navHomeHandler);
    this.navConstellationButton.removeEventListener(
      "click",
      this.navConstellationHandler
    );
    this.timeToggleButton.removeEventListener("click", this.timeToggleHandler);

    // Clear callbacks
    this.onNavigateHome = null;
    this.onNavigateConstellation = null;
    this.onTimeToggle = null;
    this.onSelectObject = null;

    // Clear references
    this.player = null;
    this.system = null;
    this.currentState = null;

    console.log("HUDManager disposed - all event listeners removed");
  }

  /**
   * Set up the callback for when a planet's seed is changed in debug mode
   * This allows real-time iteration on planet appearances
   */
  setupDebugSeedCallback(
    callback: (planetId: string, newSeed: number) => void
  ): void {
    this.bodyDetailView.setOnSeedChange((seed: number) => {
      // Get the current body from bodyDetailView (we stored it)
      const body = (this.bodyDetailView as any).currentBody;
      if (body && body.id) {
        callback(body.id, seed);
      }
    });

    // Set up mining callback
    this.bodyDetailView.onEstablishMining = (celestialBodyId: string) => {
      if (this.onEstablishMining) {
        this.onEstablishMining(celestialBodyId);
      }
    };

    this.bodyDetailView.onEstablishHelium3 = (celestialBodyId: string) => {
      if (this.onEstablishHelium3) {
        this.onEstablishHelium3(celestialBodyId);
      }
    };

    this.bodyDetailView.onLaunchDysonSwarm = (starId: string) => {
      if (this.onLaunchDysonSwarm) {
        this.onLaunchDysonSwarm(starId);
      }
    };

    this.bodyDetailView.onEstablishColony = (
      planetId: string,
      specialization: string
    ) => {
      if (this.onEstablishColony) {
        this.onEstablishColony(
          planetId,
          specialization as "balanced" | "research" | "industrial"
        );
      }
    };

    this.bodyDetailView.onInvadeColony = (planetId: string) => {
      if (this.onInvadeColony) {
        this.onInvadeColony(planetId);
      }
    };

    this.bodyDetailView.onRemoveColony = (planetId: string) => {
      if (this.onRemoveColony) {
        this.onRemoveColony(planetId);
      }
    };

    this.bodyDetailView.onUpdateColonySpecialization = (
      colonyId: string,
      specialization: string
    ) => {
      if (this.onUpdateColonySpecialization) {
        this.onUpdateColonySpecialization(
          colonyId,
          specialization as "balanced" | "research" | "industrial"
        );
      }
    };
  }

  showPlayerDiscovery(
    discoveryType: "discovered" | "wasDiscovered",
    playerNames: string[],
    systemName: string
  ): void {
    if (playerNames.length === 0) return;

    let message = "";

    if (discoveryType === "discovered") {
      // You discovered another player's civilization
      if (playerNames.length === 1) {
        message = `<div style="margin-bottom: 15px;">You discovered star-faring civilization <strong>${playerNames[0]}</strong></div>`;
        message += `<div>They connected to you in <strong>${systemName}</strong></div>`;
      } else if (playerNames.length === 2) {
        message = `<div style="margin-bottom: 15px;">You discovered star-faring civilizations <strong>${playerNames[0]}</strong> and <strong>${playerNames[1]}</strong></div>`;
        message += `<div>They connected to you in <strong>${systemName}</strong></div>`;
      } else {
        const lastPlayer = playerNames[playerNames.length - 1];
        const otherPlayers = playerNames.slice(0, -1).join(", ");
        message = `<div style="margin-bottom: 15px;">You discovered star-faring civilizations <strong>${otherPlayers}</strong>, and <strong>${lastPlayer}</strong></div>`;
        message += `<div>They connected to you in <strong>${systemName}</strong></div>`;
      }
    } else {
      // You were discovered by another player
      if (playerNames.length === 1) {
        message = `<div style="margin-bottom: 15px;">You were discovered by star-faring civilization <strong>${playerNames[0]}</strong></div>`;
        message += `<div>They connected to you in <strong>${systemName}</strong></div>`;
      } else {
        // Multiple players discovered you at once (rare but possible)
        const lastPlayer = playerNames[playerNames.length - 1];
        const otherPlayers = playerNames.slice(0, -1).join(", ");
        message = `<div style="margin-bottom: 15px;">You were discovered by star-faring civilizations <strong>${otherPlayers}</strong>, and <strong>${lastPlayer}</strong></div>`;
        message += `<div>They connected to you in <strong>${systemName}</strong></div>`;
      }
    }

    this.discoveryMessage.innerHTML = message;
    this.discoveryModal.classList.remove("hidden");
    this.discoveryModal.style.display = "flex";
  }

  showGateOvertakeNotification(
    newOwnerName: string,
    gateName: string,
    systemName: string
  ): void {
    const message =
      `<div style="margin-bottom: 15px;">⚠️ Gate Overtaken!</div>` +
      `<div style="margin-bottom: 15px;"><strong>${newOwnerName}</strong> has overtaken your gate <strong>${gateName}</strong></div>` +
      `<div>in system <strong>${systemName}</strong></div>`;

    this.discoveryMessage.innerHTML = message;
    this.discoveryModal.classList.remove("hidden");
    this.discoveryModal.style.display = "flex";
  }

  updatePlayersDisplay(
    metPlayers: {
      id: string;
      name: string;
      speciesId: string;
      speciesName: string;
    }[],
    totalPlayers: number
  ): void {
    this.metPlayers = metPlayers;
    const unmetCount = totalPlayers - metPlayers.length - 1; // -1 for self

    // Clear existing content
    this.playersDisplay.innerHTML = "";

    // Create a container for the players text
    const playersText = document.createElement("span");
    playersText.textContent = "Players: ";
    this.playersDisplay.appendChild(playersText);

    if (metPlayers.length === 0) {
      const statusText = document.createElement("span");
      statusText.textContent = unmetCount > 0 ? `${unmetCount} unmet` : "alone";
      this.playersDisplay.appendChild(statusText);
    } else {
      // Add clickable player names
      metPlayers.forEach((player, index) => {
        const playerLink = document.createElement("span");
        playerLink.textContent = player.name;
        playerLink.style.cursor = "pointer";
        playerLink.style.textDecoration = "underline";
        playerLink.style.color = "var(--primary-color)";
        playerLink.addEventListener("click", () => {
          this.openPlayerProfileModal(player);
        });
        playerLink.addEventListener("mouseenter", () => {
          playerLink.style.color = "var(--primary-color-dim)";
        });
        playerLink.addEventListener("mouseleave", () => {
          playerLink.style.color = "var(--primary-color)";
        });
        this.playersDisplay.appendChild(playerLink);

        // Add separators
        if (index < metPlayers.length - 1) {
          const separator = document.createElement("span");
          separator.textContent = ", ";
          this.playersDisplay.appendChild(separator);
        }
      });

      // Add unmet count if any
      if (unmetCount > 0) {
        const andText = document.createElement("span");
        andText.textContent = ` and ${unmetCount} unmet`;
        this.playersDisplay.appendChild(andText);
      }
    }
  }

  private openPlayerProfileModal(player: { id: string; name: string }): void {
    this.playerProfileName.textContent = player.name;
    this.currentProfilePlayerId = player.id;

    // Show loading state
    this.playerProfileStars.textContent = "Loading...";

    this.playerProfileModal.classList.remove("hidden");
    this.playerProfileModal.style.display = "flex";

    // Request player stats from server
    if (this.networkClient) {
      this.networkClient.requestPlayerStats(player.id);
    }
  }

  updatePlayerProfileStats(
    playerId: string,
    playerName: string,
    starsDiscovered: number,
    currentRelationship?: "neutral" | "friendly" | "at_war"
  ): void {
    // Update the modal if it's currently showing this player
    if (
      !this.playerProfileModal.classList.contains("hidden") &&
      this.playerProfileName.textContent === playerName
    ) {
      this.playerProfileStars.textContent = starsDiscovered.toString();

      // Update relationship display
      if (currentRelationship) {
        this.currentProfileRelationship = currentRelationship;
        this.updateRelationshipDisplay();
      }
    }
  }

  updatePlayerRelationshipStatus(
    playerId: string,
    relationship: "neutral" | "friendly" | "at_war",
    incomingProposal?: { id: string; fromPlayerId: string } | null,
    outgoingProposal?: { id: string; toPlayerId: string } | null
  ): void {
    // Update stored proposal state
    if (incomingProposal !== undefined) {
      this.currentIncomingProposal = incomingProposal || null;
    }
    if (outgoingProposal !== undefined) {
      this.currentOutgoingProposal = outgoingProposal || null;
    }

    // Update the modal if it's currently showing this player
    if (
      !this.playerProfileModal.classList.contains("hidden") &&
      this.currentProfilePlayerId === playerId
    ) {
      this.currentProfileRelationship = relationship;
      this.updateRelationshipDisplay();
    }
  }

  private updateRelationshipDisplay(): void {
    // Update relationship status text
    const relationshipLabels = {
      neutral: "Neutral",
      friendly: "Friendly ✓",
      at_war: "At War ⚔",
    };
    this.relationshipStatusDisplay.textContent = 
      relationshipLabels[this.currentProfileRelationship];
    this.relationshipStatusDisplay.style.color = 
      this.currentProfileRelationship === "friendly" ? "#10b981" :
      this.currentProfileRelationship === "at_war" ? "#ef4444" : "#9ca3af";

    // Show/hide incoming proposal notice
    if (this.currentIncomingProposal) {
      this.incomingProposalNotice.style.display = "block";
    } else {
      this.incomingProposalNotice.style.display = "none";
    }

    // Show/hide outgoing proposal notice
    if (this.currentOutgoingProposal) {
      this.outgoingProposalNotice.style.display = "block";
    } else {
      this.outgoingProposalNotice.style.display = "none";
    }

    // Update action buttons visibility and state
    const canProposerelationship = 
      this.currentProfileRelationship === "neutral" && 
      !this.currentIncomingProposal && 
      !this.currentOutgoingProposal;
    
    const canDeclareWar = 
      this.currentProfileRelationship !== "at_war";

    this.proposeFriendlyButton.style.display = canProposerelationship ? "block" : "none";
    this.declareWarButton.style.display = canDeclareWar ? "block" : "none";

    // Hide actions section if no actions available
    if (!canProposerelationship && !canDeclareWar) {
      this.relationshipActions.style.display = "none";
    } else {
      this.relationshipActions.style.display = "block";
    }
  }

  setNetworkClient(networkClient: any): void {
    this.networkClient = networkClient;

    // Check for debug mode and setup resource click handlers
    // This must be called AFTER network client is set
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.has("debug_mode");
    console.log("Debug mode enabled:", debugMode);
    if (debugMode) {
      console.log("Setting up debug resource handlers...");
      this.setupDebugResourceHandlers();
    }
  }

  setSpeciesGetter(getter: (speciesId: string) => any): void {
    this.speciesGetter = getter;
    // Pass the getter to BodyDetailView
    this.bodyDetailView.setSpeciesGetter(getter, this.networkClient);
  }

  /**
   * Helper to get a player by ID from current player or met players
   */
  public getPlayerById(playerId: string): {
    id: string;
    name: string;
    speciesId?: string;
    speciesName?: string;
  } | null {
    if (this.player && this.player.id === playerId) {
      // Need to get my own species name from display name or cache
      const speciesName = this.speciesNameDisplay.textContent || "Unknown";
      return {
        id: this.player.id,
        name: this.player.name,
        speciesId: this.player.speciesId,
        speciesName: speciesName !== "Species" ? speciesName : "Unknown",
      };
    }
    return this.metPlayers.find((p) => p.id === playerId) || null;
  }

  /**
   * Set the function to get current interpolated game time
   */
  setGameTimeGetter(getter: () => number): void {
    this.gateDetailView.setCurrentTimeGetter(getter);
  }

  private closePlayerProfileModal(): void {
    this.playerProfileModal.classList.add("hidden");
    this.playerProfileModal.style.display = "none";
    this.currentProfilePlayerId = null;
  }

  showSpeciesInfo(): void {
    if (!this.player || !this.player.speciesId) {
      this.showNotification("No species information available", 2000);
      return;
    }

    // Set flag to show modal when response arrives
    this.shouldShowSpeciesModal = true;

    // Request species info from server
    if (this.networkClient) {
      this.networkClient.requestSpeciesInfo(this.player.speciesId);
    }
  }

  displaySpeciesInfo(species: any): void {
    // Update button with species name
    this.speciesNameDisplay.textContent = species.name;

    // Set species data
    this.speciesInfoName.textContent = species.name;
    this.speciesInfoHomeworld.textContent = species.homeworld;
    this.speciesInfoBodyType.textContent =
      species.appearance.bodyType.charAt(0).toUpperCase() +
      species.appearance.bodyType.slice(1);

    // Set appearance descriptions
    this.speciesInfoSkinColor.textContent = species.appearance.skinColor;
    this.speciesInfoEyeColor.textContent = species.appearance.eyeColor;

    // Set height and build
    this.speciesInfoHeight.textContent =
      species.appearance.height.charAt(0).toUpperCase() +
      species.appearance.height.slice(1);
    this.speciesInfoBuild.textContent =
      species.appearance.build.charAt(0).toUpperCase() +
      species.appearance.build.slice(1);

    // Set traits as badges
    this.speciesInfoTraits.innerHTML = "";
    species.traits.forEach((trait: string) => {
      const badge = document.createElement("span");
      badge.style.cssText =
        "display: inline-block; padding: 4px 10px; background: rgba(139, 92, 246, 0.2); border: 1px solid #8b5cf6; border-radius: 12px; font-size: 12px; color: #c4b5fd;";
      badge.textContent = trait
        .split("_")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      this.speciesInfoTraits.appendChild(badge);
    });

    // Set description
    this.speciesInfoDescription.textContent = species.description;

    // Show modal only if flag is set (i.e., user clicked the button)
    if (this.shouldShowSpeciesModal) {
      this.speciesInfoModal.classList.remove("hidden");
      this.speciesInfoModal.style.display = "flex";
      this.shouldShowSpeciesModal = false; // Reset flag
    }
  }

  private closeSpeciesInfoModal(): void {
    this.speciesInfoModal.classList.add("hidden");
    this.speciesInfoModal.style.display = "none";
  }

  /**
   * Shows a temporary notification message under the resources widget
   * @param message The message to display
   * @param duration Duration in milliseconds (default 3000)
   */
  showNotification(message: string, duration: number = 3000): void {
    // Clear any existing timeout
    if (this.notificationTimeout !== null) {
      clearTimeout(this.notificationTimeout);
    }

    // Set message and show toast
    this.notificationMessage.textContent = message;
    this.notificationToast.style.display = "block";

    // Auto-hide after duration
    this.notificationTimeout = window.setTimeout(() => {
      this.notificationToast.style.display = "none";
      this.notificationTimeout = null;
    }, duration);
  }

  getPlayerName(): string {
    // Player name is now managed by lobby
    return localStorage.getItem("playerName") || "Anonymous Explorer";
  }

  /**
   * Set up click handlers for resources in debug mode
   */
  private setupDebugResourceHandlers(): void {
    console.log("Setting up debug resource handlers");
    console.log("Energy display:", this.energyDisplay);
    console.log("Alloy display:", this.alloyDisplay);
    console.log("Network client:", this.networkClient);

    // Make energy display clickable
    this.energyDisplay.style.cursor = "pointer";
    this.energyDisplay.title = "Click to add +10 energy (debug mode)";
    this.energyDisplay.addEventListener("click", () => {
      console.log("Energy clicked! Network client:", this.networkClient);
      if (this.networkClient) {
        console.log("Sending debugAddResource message for energy");
        this.networkClient.debugAddResource("energy", 10);
      } else {
        console.error("Network client not available!");
      }
    });

    // Make alloy display clickable
    this.alloyDisplay.style.cursor = "pointer";
    this.alloyDisplay.title = "Click to add +10 alloy (debug mode)";
    this.alloyDisplay.addEventListener("click", () => {
      console.log("Alloy clicked! Network client:", this.networkClient);
      if (this.networkClient) {
        console.log("Sending debugAddResource message for alloy");
        this.networkClient.debugAddResource("alloy", 10);
      } else {
        console.error("Network client not available!");
      }
    });

    // Make science display clickable
    this.scienceDisplay.style.cursor = "pointer";
    this.scienceDisplay.title = "Click to add +10 science (debug mode)";
    this.scienceDisplay.addEventListener("click", () => {
      console.log("Science clicked! Network client:", this.networkClient);
      if (this.networkClient) {
        console.log("Sending debugAddResource message for science");
        this.networkClient.debugAddResource("science", 10);
      } else {
        console.error("Network client not available!");
      }
    });

    console.log("Debug resource handlers set up successfully");
  }

  /**
   * Get all mineable objects in the current system
   * Reusable function that can be extended to change what counts as "mineable"
   */
  private getMineableObjectsInSystem(): Array<{
    id: string;
    name: string;
    type: string;
  }> {
    if (!this.system) return [];

    const mineable: Array<{ id: string; name: string; type: string }> = [];

    // Check all asteroids in asteroid belts
    if (this.system.asteroidBelts) {
      for (const belt of this.system.asteroidBelts) {
        for (const asteroid of belt.asteroids) {
          // An object is mineable if it's metal composition
          if (asteroid.composition === "metal") {
            // Check if it's already being mined
            const alreadyMining = this.system.miningOperations?.some(
              (op) => op.celestialBodyId === asteroid.id
            );
            if (!alreadyMining) {
              mineable.push({
                id: asteroid.id,
                name: asteroid.name,
                type: "asteroid",
              });
            }
          }
        }
      }
    }

    // Check all moons
    if (this.system.moons) {
      for (const moon of this.system.moons) {
        // An object is mineable if it's metal composition
        if (moon.composition === "metal") {
          // Check if it's already being mined
          const alreadyMining = this.system.miningOperations?.some(
            (op) => op.celestialBodyId === moon.id
          );
          if (!alreadyMining) {
            mineable.push({
              id: moon.id,
              name: moon.name,
              type: "moon",
            });
          }
        }
      }
    }

    return mineable;
  }

  /**
   * Get all Helium-3 objects in the current system
   */
  private getHelium3ObjectsInSystem(): Array<{
    id: string;
    name: string;
    type: string;
  }> {
    if (!this.system) return [];

    const helium3Objects: Array<{ id: string; name: string; type: string }> = [];

    // Check all planets
    if (this.system.planets) {
      for (const planet of this.system.planets) {
        if (planet.hasHelium3) {
          // Check if it's already extracting Helium-3
          const alreadyExtracting = this.system.helium3Operations?.some(
            (op) => op.celestialBodyId === planet.id
          );
          if (!alreadyExtracting) {
            helium3Objects.push({
              id: planet.id,
              name: planet.name,
              type: "planet",
            });
          }
        }
      }
    }

    // Check all moons
    if (this.system.moons) {
      for (const moon of this.system.moons) {
        if (moon.hasHelium3) {
          // Check if it's already extracting Helium-3
          const alreadyExtracting = this.system.helium3Operations?.some(
            (op) => op.celestialBodyId === moon.id
          );
          if (!alreadyExtracting) {
            helium3Objects.push({
              id: moon.id,
              name: moon.name,
              type: "moon",
            });
          }
        }
      }
    }

    return helium3Objects;
  }

  /**
   * Update the mineable objects widget based on the current system
   */
  updateMineableObjectsWidget(): void {
    // Don't show mineable widget in constellation view or lobby
    if (this.isInConstellationView || !this.system) {
      this.mineableObjectsWidget.classList.remove("animate-in", "animate-out");
      this.mineableObjectsWidget.classList.add("hidden");
      return;
    }

    const newMineableObjects = this.getMineableObjectsInSystem();
    
    // CRITICAL: If no mineable objects exist, hide with animation if widget was visible
    if (newMineableObjects.length === 0) {
      const wasVisible = !this.mineableObjectsWidget.classList.contains("hidden");
      
      this.mineableObjects = [];
      this.currentMineableIndex = 0;
      this.isCyclingMineable = false;
      
      if (wasVisible) {
        // Animate out before hiding
        this.mineableObjectsWidget.classList.remove("animate-in");
        this.mineableObjectsWidget.classList.add("animate-out");
        setTimeout(() => {
          this.mineableObjectsWidget.classList.add("hidden");
          this.mineableObjectsWidget.classList.remove("animate-out");
        }, 300); // Duration of exit animation
      } else {
        // Already hidden, just ensure it stays hidden
        this.mineableObjectsWidget.classList.remove("animate-in", "animate-out");
        this.mineableObjectsWidget.classList.add("hidden");
      }
      return;
    }

    // Check if the list of mineable objects has actually changed
    const listChanged =
      newMineableObjects.length !== this.mineableObjects.length ||
      !newMineableObjects.every(
        (obj, i) => obj.id === this.mineableObjects[i]?.id
      );

    // Debug logging
    if (listChanged && this.isCyclingMineable) {
      console.log(
        `[Mining Badge] Widget updated mid-cycle! Old: ${this.mineableObjects.length}, New: ${newMineableObjects.length}, Index: ${this.currentMineableIndex}`
      );
    }

    // Only reset cycling state if the list has changed
    if (listChanged) {
      this.mineableObjects = newMineableObjects;

      // If we were cycling and the list changed, adjust the index
      if (this.isCyclingMineable) {
        // Clamp the index to the new list size
        this.currentMineableIndex = Math.min(
          this.currentMineableIndex,
          Math.max(0, this.mineableObjects.length - 1)
        );

        // If the list is now empty, reset cycling state
        if (this.mineableObjects.length === 0) {
          this.currentMineableIndex = 0;
          this.isCyclingMineable = false;
        }
      } else {
        this.currentMineableIndex = 0;
      }
    }

    // At this point, we know mineableObjects.length > 0 (early return above handles empty case)
    // Check if this is the first time showing (was hidden before)
    const wasHidden = this.mineableObjectsWidget.classList.contains("hidden");

    // Update counter BEFORE showing widget to prevent "0" flash
    this.updateMineableCounter();
    this.mineableObjectsWidget.classList.remove("hidden");

    // Add animation class if badge was just revealed
    if (wasHidden) {
      this.mineableObjectsWidget.classList.add("animate-in");
      // Remove animation class after it completes so it can be reused
      setTimeout(() => {
        this.mineableObjectsWidget.classList.remove("animate-in");
      }, 1400); // 900ms delay + 500ms animation
    }
  }

  /**
   * Update the counter display on the mineable objects widget
   */
  private updateMineableCounter(): void {
    // Safety check: never show counter if list is empty
    if (this.mineableObjects.length === 0) {
      return;
    }
    
    if (this.isCyclingMineable && this.mineableObjects.length > 0) {
      // Show "X/Y" format when cycling
      this.mineableCounter.textContent = `${this.currentMineableIndex + 1}/${
        this.mineableObjects.length
      }`;
    } else {
      // Show total count when not cycling
      this.mineableCounter.textContent = this.mineableObjects.length.toString();
    }
  }

  /**
   * Cycle to the next mineable object
   */
  private cycleToNextMineableObject(): void {
    if (this.mineableObjects.length === 0) {
      console.warn("[Mining Badge] No mineable objects available");
      return;
    }

    // Mark that we're cycling
    if (!this.isCyclingMineable) {
      this.isCyclingMineable = true;
      this.currentMineableIndex = 0;
    } else {
      // Move to next object
      this.currentMineableIndex =
        (this.currentMineableIndex + 1) % this.mineableObjects.length;
    }

    // Update the counter
    this.updateMineableCounter();

    // Select the object
    const selectedObject = this.mineableObjects[this.currentMineableIndex];
    console.log(
      `[Mining Badge] Selecting mineable object ${
        this.currentMineableIndex + 1
      }/${this.mineableObjects.length}:`,
      selectedObject
    );
    if (this.onSelectObject) {
      this.onSelectObject(selectedObject.id);
    }
  }

  /**
   * Cycle to the previous mineable object
   */
  private cycleToPreviousMineableObject(): void {
    if (this.mineableObjects.length === 0) return;

    // Mark that we're cycling
    if (!this.isCyclingMineable) {
      this.isCyclingMineable = true;
      this.currentMineableIndex = 0;
    } else {
      // Move to previous object (wrap around)
      this.currentMineableIndex =
        (this.currentMineableIndex - 1 + this.mineableObjects.length) %
        this.mineableObjects.length;
    }

    // Update the counter
    this.updateMineableCounter();

    // Select the object
    const selectedObject = this.mineableObjects[this.currentMineableIndex];
    if (this.onSelectObject) {
      this.onSelectObject(selectedObject.id);
    }
  }

  /**
   * Update the Helium-3 objects widget based on the current system
   */
  updateHelium3ObjectsWidget(): void {
    // Don't show Helium-3 widget in constellation view or lobby
    if (this.isInConstellationView || !this.system) {
      this.helium3ObjectsWidget.classList.remove("animate-in", "animate-out");
      this.helium3ObjectsWidget.classList.add("hidden");
      return;
    }

    const newHelium3Objects = this.getHelium3ObjectsInSystem();
    
    // CRITICAL: If no Helium-3 objects exist, hide with animation if widget was visible
    if (newHelium3Objects.length === 0) {
      const wasVisible = !this.helium3ObjectsWidget.classList.contains("hidden");
      
      this.helium3Objects = [];
      this.currentHelium3Index = 0;
      this.isCyclingHelium3 = false;
      
      if (wasVisible) {
        // Animate out before hiding
        this.helium3ObjectsWidget.classList.remove("animate-in");
        this.helium3ObjectsWidget.classList.add("animate-out");
        setTimeout(() => {
          this.helium3ObjectsWidget.classList.add("hidden");
          this.helium3ObjectsWidget.classList.remove("animate-out");
        }, 300); // Duration of exit animation
      } else {
        // Already hidden, just ensure it stays hidden
        this.helium3ObjectsWidget.classList.remove("animate-in", "animate-out");
        this.helium3ObjectsWidget.classList.add("hidden");
      }
      return;
    }

    // Check if the list has changed
    const listChanged =
      newHelium3Objects.length !== this.helium3Objects.length ||
      !newHelium3Objects.every(
        (obj, i) => obj.id === this.helium3Objects[i]?.id
      );

    if (listChanged) {
      this.helium3Objects = newHelium3Objects;

      if (this.isCyclingHelium3) {
        this.currentHelium3Index = Math.min(
          this.currentHelium3Index,
          Math.max(0, this.helium3Objects.length - 1)
        );

        if (this.helium3Objects.length === 0) {
          this.currentHelium3Index = 0;
          this.isCyclingHelium3 = false;
        }
      } else {
        this.currentHelium3Index = 0;
      }
    }

    // At this point, we know helium3Objects.length > 0 (early return above handles empty case)
    const wasHidden = this.helium3ObjectsWidget.classList.contains("hidden");

    // Update counter BEFORE showing widget to prevent "0" flash
    this.updateHelium3Counter();
    this.helium3ObjectsWidget.classList.remove("hidden");

    if (wasHidden) {
      this.helium3ObjectsWidget.classList.add("animate-in");
      setTimeout(() => {
        this.helium3ObjectsWidget.classList.remove("animate-in");
      }, 1400);
    }
  }

  /**
   * Update the counter display on the Helium-3 objects widget
   */
  private updateHelium3Counter(): void {
    // Safety check: never show counter if list is empty
    if (this.helium3Objects.length === 0) {
      return;
    }
    
    if (this.isCyclingHelium3 && this.helium3Objects.length > 0) {
      this.helium3Counter.textContent = `${this.currentHelium3Index + 1}/${
        this.helium3Objects.length
      }`;
    } else {
      this.helium3Counter.textContent = this.helium3Objects.length.toString();
    }
  }

  /**
   * Cycle to the next Helium-3 object
   */
  private cycleToNextHelium3Object(): void {
    if (this.helium3Objects.length === 0) {
      console.warn("[Helium-3 Badge] No Helium-3 objects available");
      return;
    }

    if (!this.isCyclingHelium3) {
      this.isCyclingHelium3 = true;
      this.currentHelium3Index = 0;
    } else {
      this.currentHelium3Index =
        (this.currentHelium3Index + 1) % this.helium3Objects.length;
    }

    this.updateHelium3Counter();

    const selectedObject = this.helium3Objects[this.currentHelium3Index];
    console.log(
      `[Helium-3 Badge] Selecting Helium-3 object ${
        this.currentHelium3Index + 1
      }/${this.helium3Objects.length}:`,
      selectedObject
    );
    if (this.onSelectObject) {
      this.onSelectObject(selectedObject.id);
    }
  }

  /**
   * Cycle to the previous Helium-3 object
   */
  private cycleToPreviousHelium3Object(): void {
    if (this.helium3Objects.length === 0) return;

    if (!this.isCyclingHelium3) {
      this.isCyclingHelium3 = true;
      this.currentHelium3Index = 0;
    } else {
      this.currentHelium3Index =
        (this.currentHelium3Index - 1 + this.helium3Objects.length) %
        this.helium3Objects.length;
    }

    this.updateHelium3Counter();

    const selectedObject = this.helium3Objects[this.currentHelium3Index];
    if (this.onSelectObject) {
      this.onSelectObject(selectedObject.id);
    }
  }

  private calculateOverchargeCooldown(
    overchargedAt?: number | null
  ): string | null {
    if (!overchargedAt || overchargedAt === 0) {
      return null;
    }

    const COOLDOWN_PERIOD = 1 * 365 * 86400; // 1 year in seconds
    const timeSinceOvercharge = this.currentTime - overchargedAt;

    if (timeSinceOvercharge >= COOLDOWN_PERIOD) {
      return null; // Cooldown expired
    }

    const remainingSeconds = COOLDOWN_PERIOD - timeSinceOvercharge;
    const remainingYears = (remainingSeconds / (365 * 86400)).toFixed(1);

    return `${remainingYears} years`;
  }
}
