import {
  Player,
  StarSystem,
  SystemState,
  Ship,
  ConstellationNode,
  SearchResult,
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
  private gateOwnership: Map<
    string,
    { ownerId: string; ownerName: string; status: string }
  > = new Map();

  // Detail views
  private bodyDetailView: BodyDetailView;
  private gateDetailView: GateDetailView;
  private shipDetailView: ShipDetailView;
  private constellationSystemDetailView: ConstellationSystemDetailView;

  // HUD elements
  private navSection: HTMLElement;
  private navHomeButton: HTMLElement;
  private navSystemButton: HTMLElement;
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

  // Notification toast
  private notificationToast: HTMLElement;
  private notificationMessage: HTMLElement;
  private notificationTimeout: number | null = null;

  // Mineable objects widget
  private mineableObjectsWidget: HTMLElement;
  private mineableCounter: HTMLElement;
  private mineableObjects: Array<{ id: string; name: string; type: string }> =
    [];
  private currentMineableIndex: number = 0;
  private isCyclingMineable: boolean = false;

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

  // Player profile modal elements
  private playerProfileModal: HTMLElement;
  private playerProfileName: HTMLElement;
  private playerProfileStars: HTMLElement;
  private playerProfileCloseButton: HTMLElement;
  private stanceButtons: NodeListOf<HTMLButtonElement>;
  private currentProfilePlayerId: string | null = null;

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
  private metPlayers: { id: string; name: string }[] = [];
  private networkClient: any = null; // Reference to network client for requesting stats
  private shouldShowSpeciesModal = false; // Track whether to show species modal on next response
  private isInConstellationView = false; // Track if we're in constellation view (to hide mineable widget)

  // Event handler references for cleanup
  private navHomeHandler: () => void;
  private navSystemHandler: () => void;
  private navConstellationHandler: () => void;
  private timeToggleHandler: () => void;
  private searchButtonHandler: () => void;
  private searchInputHandler: (e: Event) => void;
  private searchKeydownHandler: (e: KeyboardEvent) => void;

  // Callbacks
  public onNavigateHome: (() => void) | null = null;
  public onNavigateSystem: (() => void) | null = null;
  public onNavigateConstellation: (() => void) | null = null;
  public onTimeToggle: (() => void) | null = null;
  public onSelectObject: ((objectId: string) => void) | null = null;
  public onSearch: ((query: string) => void) | null = null;
  public onSearchResultClick:
    | ((systemId: string, objectId: string) => void)
    | null = null;
  public onGateTravel: ((gateId: string) => void) | null = null;
  public onSetPlayerStance:
    | ((
        targetPlayerId: string,
        stance: "neutral" | "friendly" | "aggressive"
      ) => void)
    | null = null;
  public onEstablishMining: ((celestialBodyId: string) => void) | null = null;
  public onLaunchDysonSwarm: ((starId: string) => void) | null = null;
  public onEstablishColony:
    | ((
        planetId: string,
        specialization: "balanced" | "research" | "industrial"
      ) => void)
    | null = null;
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
    this.navSystemButton = document.getElementById("nav-system")!;
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

    // Notification toast
    this.notificationToast = document.getElementById("notification-toast")!;
    this.notificationMessage = document.getElementById("notification-message")!;

    // Mineable objects widget
    this.mineableObjectsWidget = document.getElementById(
      "mineable-objects-widget"
    )!;
    this.mineableCounter = document.getElementById("mineable-counter")!;

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

    // Player profile modal
    this.playerProfileModal = document.getElementById("player-profile-modal")!;
    this.playerProfileName = document.getElementById("player-profile-name")!;
    this.playerProfileStars = document.getElementById("player-profile-stars")!;
    this.playerProfileCloseButton = document.getElementById(
      "player-profile-close-button"
    )!;

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
    this.stanceButtons = document.querySelectorAll(".stance-button")!;

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

    // Stance button handlers
    this.stanceButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const stance = button.getAttribute("data-stance") as
          | "neutral"
          | "friendly"
          | "aggressive";
        if (stance && this.currentProfilePlayerId && this.onSetPlayerStance) {
          this.onSetPlayerStance(this.currentProfilePlayerId, stance);
          this.updateStanceButtonHighlight(stance);
        }
      });
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
    this.gateDetailView = new GateDetailView();
    this.shipDetailView = new ShipDetailView();
    this.constellationSystemDetailView = new ConstellationSystemDetailView();

    // Setup gate detail view callback
    this.gateDetailView.onTravelClick = (gateId: string) => {
      if (this.onGateTravel) {
        this.onGateTravel(gateId);
      }
    };

    // Create event handler references
    this.navHomeHandler = () => {
      if (this.onNavigateHome) {
        this.onNavigateHome();
      }
    };

    this.navSystemHandler = () => {
      if (this.onNavigateSystem) {
        this.onNavigateSystem();
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
    this.navSystemButton.addEventListener("click", this.navSystemHandler);
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

  clearError(): void {
    // No-op: notifications auto-dismiss
  }

  setPlayer(player: Player): void {
    this.player = player;
    // Don't auto-hide auth modal here - let main.ts control when to hide it
    // This allows the lobby screen to stay visible on page reload
    // Update body detail view with home planet reference
    this.bodyDetailView.setHomePlanet(this.player, this.system);
    // Update resource displays
    this.updateResourceDisplays();
    // Request species info to update the species button name
    if (this.player.speciesId && this.networkClient) {
      this.networkClient.requestSpeciesInfo(this.player.speciesId);
    }
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
    status: string
  ): void {
    this.gateOwnership.set(gateId, { ownerId, ownerName, status });
  }

  clearGateOwnership(): void {
    this.gateOwnership.clear();
  }

  setSystem(system: StarSystem): void {
    this.system = system;

    // Set current system on body detail view for mining checks
    this.bodyDetailView.setCurrentSystem(system);

    // CRITICAL: Hide all panels when changing systems
    // This prevents detail panels from the previous system from remaining visible
    this.hideDetailPanels();

    // Apply theme FIRST so outline elements are created with the correct colors
    this.applyStarTheme(system.star.color);
    this.populateSystemOutline();

    // Update body detail view with home planet reference
    this.bodyDetailView.setHomePlanet(this.player, this.system);

    // Update mineable objects widget
    this.updateMineableObjectsWidget();

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
    // Hide mineable objects widget
    this.mineableObjectsWidget.classList.add("hidden");
    this.mineableObjects = [];
    this.currentMineableIndex = 0;
    this.isCyclingMineable = false;
    // Reset theme to default green when leaving system view
    this.applyStarTheme("#0f0");
  }

  /**
   * Set constellation view state (used to hide mineable widget)
   */
  setConstellationViewState(isInConstellation: boolean): void {
    this.isInConstellationView = isInConstellation;
    // If entering constellation view, hide mineable widget
    if (isInConstellation) {
      this.mineableObjectsWidget.classList.add("hidden");
    }
    // If exiting constellation view, update mineable widget based on current system
    else {
      this.updateMineableObjectsWidget();
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
    // Remove previous selection
    const items = this.outlineList.querySelectorAll(".outline-item");
    items.forEach((item) => item.classList.remove("selected"));

    // Highlight current selection
    const selectedItem = this.outlineList.querySelector(
      `[data-object-id="${objectId}"]`
    );
    if (selectedItem) {
      selectedItem.classList.add("selected");
    }
  }

  updateTime(currentTime: number, isPaused: boolean, timeScale: number): void {
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

    // Convert to days and hours (skip minutes - too fast at 10000x scale)
    const days = Math.floor(currentTime / 86400);
    const hours = Math.floor((currentTime % 86400) / 3600);

    this.timeDisplay.textContent = `${days}d ${hours}h`;
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

    // CRITICAL: Check if the same object is already selected FIRST
    // If it is, do nothing to avoid flickering the UI
    if (this.selectedObjectId === objectId) {
      return;
    }

    // CRITICAL: Hide ALL detail panels before showing a new one
    // This ensures only one detail panel is visible at a time
    // Even if multiple calls happen rapidly, only the last one will show its panel
    this.bodyDetailView.hide(false);
    this.gateDetailView.hide();
    this.shipDetailView.hide();
    this.constellationSystemDetailView.hide();

    // Update the selected object ID
    this.selectedObjectId = objectId;

    // Update outline selection
    this.updateSelectedInOutline(objectId);

    // Check if it's a gate
    const gate = this.system.gates?.find((g) => g.id === objectId);
    if (gate) {
      const ownerInfo = this.gateOwnership.get(gate.id);
      this.gateDetailView.show(
        gate,
        this.player,
        this.system,
        this.currentState,
        ownerInfo
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
    this.navSystemButton.removeEventListener("click", this.navSystemHandler);
    this.navConstellationButton.removeEventListener(
      "click",
      this.navConstellationHandler
    );
    this.timeToggleButton.removeEventListener("click", this.timeToggleHandler);

    // Clear callbacks
    this.onNavigateHome = null;
    this.onNavigateSystem = null;
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

  updatePlayersDisplay(
    metPlayers: { id: string; name: string }[],
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
      statusText.textContent =
        unmetCount > 0 ? `${unmetCount} unmet` : "alone";
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
    currentStance?: "neutral" | "friendly" | "aggressive"
  ): void {
    // Update the modal if it's currently showing this player
    if (
      !this.playerProfileModal.classList.contains("hidden") &&
      this.playerProfileName.textContent === playerName
    ) {
      this.playerProfileStars.textContent = starsDiscovered.toString();

      // Update stance button highlight
      if (currentStance) {
        this.updateStanceButtonHighlight(currentStance);
      }
    }
  }

  private updateStanceButtonHighlight(
    stance: "neutral" | "friendly" | "aggressive"
  ): void {
    this.stanceButtons.forEach((button) => {
      const buttonStance = button.getAttribute("data-stance");
      if (buttonStance === stance) {
        button.style.border = "2px solid #fff";
        button.style.fontWeight = "bold";
      } else {
        button.style.border = "1px solid rgba(255, 255, 255, 0.2)";
        button.style.fontWeight = "normal";
      }
    });
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

    // Set appearance colors
    this.speciesInfoSkinColor.style.backgroundColor =
      species.appearance.skinColor;
    this.speciesInfoEyeColor.style.backgroundColor =
      species.appearance.eyeColor;

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
   * Update the mineable objects widget based on the current system
   */
  updateMineableObjectsWidget(): void {
    // Don't show mineable widget in constellation view
    if (this.isInConstellationView) {
      this.mineableObjectsWidget.classList.add("hidden");
      return;
    }

    const newMineableObjects = this.getMineableObjectsInSystem();

    // Check if the list of mineable objects has actually changed
    const listChanged =
      newMineableObjects.length !== this.mineableObjects.length ||
      !newMineableObjects.every(
        (obj, i) => obj.id === this.mineableObjects[i]?.id
      );

    // Debug logging
    if (listChanged && this.isCyclingMineable) {
      console.log(`[Mining Badge] Widget updated mid-cycle! Old: ${this.mineableObjects.length}, New: ${newMineableObjects.length}, Index: ${this.currentMineableIndex}`);
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

    if (this.mineableObjects.length > 0) {
      // Check if this is the first time showing (was hidden before)
      const wasHidden = this.mineableObjectsWidget.classList.contains("hidden");

      this.mineableObjectsWidget.classList.remove("hidden");
      this.updateMineableCounter();

      // Add animation class if badge was just revealed
      if (wasHidden) {
        this.mineableObjectsWidget.classList.add("animate-in");
        // Remove animation class after it completes so it can be reused
        setTimeout(() => {
          this.mineableObjectsWidget.classList.remove("animate-in");
        }, 1400); // 900ms delay + 500ms animation
      }
    } else {
      // Animate out before hiding
      const isVisible =
        !this.mineableObjectsWidget.classList.contains("hidden");
      if (isVisible) {
        this.mineableObjectsWidget.classList.add("animate-out");
        setTimeout(() => {
          this.mineableObjectsWidget.classList.add("hidden");
          this.mineableObjectsWidget.classList.remove("animate-out");
        }, 300); // Duration of exit animation
      } else {
        this.mineableObjectsWidget.classList.add("hidden");
      }
    }
  }

  /**
   * Update the counter display on the mineable objects widget
   */
  private updateMineableCounter(): void {
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
    console.log(`[Mining Badge] Selecting mineable object ${this.currentMineableIndex + 1}/${this.mineableObjects.length}:`, selectedObject);
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
}
