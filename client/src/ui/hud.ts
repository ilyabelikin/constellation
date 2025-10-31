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

  // Detail views
  private bodyDetailView: BodyDetailView;
  private gateDetailView: GateDetailView;
  private shipDetailView: ShipDetailView;
  private constellationSystemDetailView: ConstellationSystemDetailView;

  // HUD elements
  private authModal: HTMLElement;
  private errorMessage: HTMLElement;
  private galaxyNameInput: HTMLInputElement;
  private galaxyTimeDisplay: HTMLElement;
  private exploreGalaxyButton: HTMLElement;
  private resetGalaxyButton: HTMLElement;

  private navSection: HTMLElement;
  private navHomeButton: HTMLElement;
  private navSystemButton: HTMLElement;
  private navConstellationButton: HTMLElement;

  private timeSection: HTMLElement;
  private timeDisplay: HTMLElement;
  private timeScaleDisplay: HTMLElement;
  private timeToggleButton: HTMLElement;

  private systemOutline: HTMLElement;
  private outlineList: HTMLElement;

  // Search modal elements
  private searchModal: HTMLElement;
  private searchButton: HTMLElement;
  private searchInput: HTMLInputElement;
  private searchResults: HTMLElement;

  private isPaused = false;

  // Event handler references for cleanup
  private exploreGalaxyHandler: () => void;
  private resetGalaxyHandler: () => void;
  private navHomeHandler: () => void;
  private navSystemHandler: () => void;
  private navConstellationHandler: () => void;
  private timeToggleHandler: () => void;
  private searchButtonHandler: () => void;
  private searchInputHandler: (e: Event) => void;
  private searchKeydownHandler: (e: KeyboardEvent) => void;

  // Callbacks
  public onExploreGalaxy: ((name: string) => void) | null = null;
  public onResetGalaxy: ((name: string) => void) | null = null;
  public onNavigateHome: (() => void) | null = null;
  public onNavigateSystem: (() => void) | null = null;
  public onNavigateConstellation: (() => void) | null = null;
  public onTimeToggle: (() => void) | null = null;
  public onSelectObject: ((objectId: string) => void) | null = null;
  public onSearch: ((query: string) => void) | null = null;
  public onSearchResultClick:
    | ((systemId: string, objectId: string) => void)
    | null = null;

  constructor() {
    // Auth modal
    this.authModal = document.getElementById("auth-modal")!;
    this.errorMessage = document.getElementById("error-message")!;
    this.galaxyNameInput = document.getElementById(
      "galaxy-name"
    ) as HTMLInputElement;
    this.galaxyTimeDisplay = document.getElementById("galaxy-time-display")!;
    this.exploreGalaxyButton = document.getElementById("explore-galaxy")!;
    this.resetGalaxyButton = document.getElementById("reset-galaxy")!;

    // Navigation
    this.navSection = document.querySelector(".hud-top-left")!;
    this.navHomeButton = document.getElementById("nav-home")!;
    this.navSystemButton = document.getElementById("nav-system")!;
    this.navConstellationButton = document.getElementById("nav-constellation")!;

    // Time controls
    this.timeSection = document.querySelector(".hud-top-right")!;
    this.timeDisplay = document.getElementById("time-display")!;
    this.timeScaleDisplay = document.getElementById("time-scale")!;
    this.timeToggleButton = document.getElementById("time-toggle")!;

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

    // Initialize detail views
    this.bodyDetailView = new BodyDetailView();
    this.gateDetailView = new GateDetailView();
    this.shipDetailView = new ShipDetailView();
    this.constellationSystemDetailView = new ConstellationSystemDetailView();

    // Create event handler references
    this.exploreGalaxyHandler = () => {
      const name = this.galaxyNameInput.value.trim() || "the Milky Way";
      if (this.onExploreGalaxy) {
        this.onExploreGalaxy(name);
      }
    };

    this.resetGalaxyHandler = () => {
      const name = this.galaxyNameInput.value.trim() || "the Milky Way";
      if (this.onResetGalaxy) {
        this.onResetGalaxy(name);
      }
    };

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
    this.exploreGalaxyButton.addEventListener(
      "click",
      this.exploreGalaxyHandler
    );
    this.resetGalaxyButton.addEventListener("click", this.resetGalaxyHandler);
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
  }

  hideAuthModal(): void {
    this.authModal.classList.add("hidden");
    // Show game HUD elements when player joins
    this.showGameHUD();
  }

  showGameHUD(): void {
    this.navSection.classList.add("visible");
    this.timeSection.classList.add("visible");
    this.searchButton.classList.add("visible");
  }

  hideGameHUD(): void {
    this.navSection.classList.remove("visible");
    this.timeSection.classList.remove("visible");
    this.searchButton.classList.remove("visible");
  }

  updateGalaxyTime(
    galaxyName: string,
    exists: boolean,
    currentTime: number
  ): void {
    if (!exists) {
      this.galaxyTimeDisplay.textContent = `New galaxy will be created`;
    } else {
      // Convert time to days and hours
      const days = Math.floor(currentTime / 86400);
      const hours = Math.floor((currentTime % 86400) / 3600);
      this.galaxyTimeDisplay.textContent = `Local time: ${days}d ${hours}h`;
    }
  }

  clearGalaxyTime(): void {
    this.galaxyTimeDisplay.textContent = "";
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
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove("hidden");
  }

  clearError(): void {
    this.errorMessage.classList.add("hidden");
  }

  setPlayer(player: Player): void {
    this.player = player;
    this.hideAuthModal();
    // Update body detail view with home planet reference
    this.bodyDetailView.setHomePlanet(this.player, this.system);
  }

  setSystem(system: StarSystem): void {
    this.system = system;

    // CRITICAL: Hide all panels when changing systems
    // This prevents detail panels from the previous system from remaining visible
    this.hideDetailPanels();

    // Apply theme FIRST so outline elements are created with the correct colors
    this.applyStarTheme(system.star.color);
    this.populateSystemOutline();

    // Update body detail view with home planet reference
    this.bodyDetailView.setHomePlanet(this.player, this.system);

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
    // Reset theme to default green when leaving system view
    this.applyStarTheme("#0f0");
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
              moonItem.dataset.moonIndex = "0"; // Track which moon to show next
              moonItem.addEventListener("click", () => {
                // Cycle through moons
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
              this.outlineList.appendChild(moonItem);
            }
          }
        } else if (obj.type === "asteroidBelt") {
          const belt = obj.data;
          const beltItem = document.createElement("div");
          beltItem.className = "outline-item asteroid-belt";
          beltItem.textContent = `   ◦ ${belt.name} - ${belt.asteroidCount}`;
          beltItem.dataset.beltId = belt.id;
          beltItem.dataset.asteroidIndex = "0"; // Track which asteroid to show next
          beltItem.addEventListener("click", () => {
            // Cycle through asteroids in the belt
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

        // Check if gate is explored
        const isExplored =
          this.player?.exploredGateIds?.includes(gate.id) ?? false;
        const status = isExplored ? "⚡" : "◈";
        const gateName = isExplored ? gate.name : "???";

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
    this.isPaused = isPaused;

    // Convert to days and hours (skip minutes - too fast at 10000x scale)
    const days = Math.floor(currentTime / 86400);
    const hours = Math.floor((currentTime % 86400) / 3600);

    this.timeDisplay.textContent = `${days}d ${hours}h`;
    this.timeScaleDisplay.textContent = `${timeScale.toFixed(0)}x`;
    this.timeToggleButton.textContent = isPaused ? "Resume" : "Pause";
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
      this.gateDetailView.show(
        gate,
        this.player,
        this.system,
        this.currentState
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
    this.exploreGalaxyButton.removeEventListener(
      "click",
      this.exploreGalaxyHandler
    );
    this.resetGalaxyButton.removeEventListener(
      "click",
      this.resetGalaxyHandler
    );
    this.navHomeButton.removeEventListener("click", this.navHomeHandler);
    this.navSystemButton.removeEventListener("click", this.navSystemHandler);
    this.navConstellationButton.removeEventListener(
      "click",
      this.navConstellationHandler
    );
    this.timeToggleButton.removeEventListener("click", this.timeToggleHandler);

    // Clear callbacks
    this.onExploreGalaxy = null;
    this.onResetGalaxy = null;
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
  }
}
