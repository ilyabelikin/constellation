import { Player, StarSystem, SystemState } from "@constellation/shared";
import { BodyDetailView } from "./BodyDetailView.js";
import { GateDetailView } from "./GateDetailView.js";

export class HUDManager {
  private player: Player | null = null;
  private system: StarSystem | null = null;
  private currentState: SystemState | null = null;

  // Detail views
  private bodyDetailView: BodyDetailView;
  private gateDetailView: GateDetailView;

  // HUD elements
  private authModal: HTMLElement;
  private errorMessage: HTMLElement;
  private galaxyNameInput: HTMLInputElement;
  private exploreGalaxyButton: HTMLElement;
  private resetGalaxyButton: HTMLElement;

  private navHomeButton: HTMLElement;
  private navSystemButton: HTMLElement;
  private navConstellationButton: HTMLElement;

  private timeDisplay: HTMLElement;
  private timeScaleDisplay: HTMLElement;
  private timeToggleButton: HTMLElement;

  private systemOutline: HTMLElement;
  private outlineList: HTMLElement;

  private isPaused = false;

  // Event handler references for cleanup
  private exploreGalaxyHandler: () => void;
  private resetGalaxyHandler: () => void;
  private navHomeHandler: () => void;
  private navSystemHandler: () => void;
  private timeToggleHandler: () => void;

  // Callbacks
  public onExploreGalaxy: ((name: string) => void) | null = null;
  public onResetGalaxy: ((name: string) => void) | null = null;
  public onNavigateHome: (() => void) | null = null;
  public onNavigateSystem: (() => void) | null = null;
  public onTimeToggle: (() => void) | null = null;
  public onSelectObject: ((objectId: string) => void) | null = null;

  constructor() {
    // Auth modal
    this.authModal = document.getElementById("auth-modal")!;
    this.errorMessage = document.getElementById("error-message")!;
    this.galaxyNameInput = document.getElementById(
      "galaxy-name"
    ) as HTMLInputElement;
    this.exploreGalaxyButton = document.getElementById("explore-galaxy")!;
    this.resetGalaxyButton = document.getElementById("reset-galaxy")!;

    // Navigation
    this.navHomeButton = document.getElementById("nav-home")!;
    this.navSystemButton = document.getElementById("nav-system")!;
    this.navConstellationButton = document.getElementById("nav-constellation")!;

    // Time controls
    this.timeDisplay = document.getElementById("time-display")!;
    this.timeScaleDisplay = document.getElementById("time-scale")!;
    this.timeToggleButton = document.getElementById("time-toggle")!;

    // System outline
    this.systemOutline = document.getElementById("system-outline")!;
    this.outlineList = document.getElementById("outline-list")!;

    // Initialize detail views
    this.bodyDetailView = new BodyDetailView();
    this.gateDetailView = new GateDetailView();

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

    this.timeToggleHandler = () => {
      if (this.onTimeToggle) {
        this.onTimeToggle();
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
    this.timeToggleButton.addEventListener("click", this.timeToggleHandler);
  }

  hideAuthModal(): void {
    this.authModal.classList.add("hidden");
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
  }

  setSystem(system: StarSystem): void {
    this.system = system;
    this.populateSystemOutline();
  }

  hideOutline(): void {
    this.systemOutline.classList.add("hidden");
    // Also hide detail panels during transitions
    this.bodyDetailView.hide();
    this.gateDetailView.hide();
  }

  showOutline(): void {
    this.systemOutline.classList.remove("hidden");
  }

  private populateSystemOutline(): void {
    if (!this.system) return;

    // Clear existing list
    this.outlineList.innerHTML = "";

    // Add star first
    const starItem = document.createElement("div");
    starItem.className = "outline-item star";
    starItem.textContent = `★ ${this.system.star.name}`;
    starItem.dataset.objectId = this.system.star.id;
    starItem.addEventListener("click", () => {
      if (this.onSelectObject) {
        this.onSelectObject(this.system!.star.id);
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

    // Add planets
    this.system.planets.forEach((planet) => {
      const distance = planet.orbitalElements?.semiMajorAxis || 0;
      orbitalObjects.push({ type: "planet", distance, data: planet });
    });

    // Add asteroid belts (using average of inner and outer radius)
    if (this.system.asteroidBelts) {
      this.system.asteroidBelts.forEach((belt) => {
        const distance = (belt.innerRadius + belt.outerRadius) / 2;
        // Add belt itself plus asteroids with tracking for cycling
        orbitalObjects.push({
          type: "asteroidBelt",
          distance,
          data: belt,
          asteroidIndex: 0,
        });
      });
    }

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
        planetItem.textContent = `${planetIndex}. ${planet.name}${planetType}`;
        planetItem.dataset.objectId = planet.id;
        planetItem.addEventListener("click", () => {
          if (this.onSelectObject) {
            this.onSelectObject(planet.id);
          }
        });
        this.outlineList.appendChild(planetItem);
      } else if (obj.type === "asteroidBelt") {
        const belt = obj.data;
        const beltItem = document.createElement("div");
        beltItem.className = "outline-item asteroid-belt";
        beltItem.textContent = `◦ ${belt.name} - ${belt.asteroidCount}`;
        beltItem.dataset.beltId = belt.id;
        beltItem.dataset.asteroidIndex = "0"; // Track which asteroid to show next
        beltItem.addEventListener("click", () => {
          // Cycle through asteroids in the belt
          const currentIndex = parseInt(beltItem.dataset.asteroidIndex || "0");
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
            beltItem.textContent = `◦ ${belt.name} - ${currentIndex + 1}/${
              asteroids.length
            }`;
          }
        });
        this.outlineList.appendChild(beltItem);
      }
    });

    // Add gates
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

    // Update outline selection
    this.updateSelectedInOutline(objectId);

    // Hide all detail panels first
    this.bodyDetailView.hide();
    this.gateDetailView.hide();

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
    } else {
      // Check planets
      body = this.system.planets.find((p) => p.id === objectId);
      if (body) {
        bodyState = this.currentState.bodies.find((b) => b.id === objectId);
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

    if (body && bodyState) {
      this.bodyDetailView.show(body, bodyState, this.currentState);
      return;
    }

    // Check if it's a ship (TODO: create ShipDetailView later)
    const shipState = this.currentState.ships.find((s) => s.id === objectId);
    if (shipState) {
      // For now, use body detail view for ships (can be refactored later)
      console.log("Ship details not yet implemented with separate view");
    }
  }

  updateState(state: SystemState): void {
    this.currentState = state;
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
    this.timeToggleButton.removeEventListener("click", this.timeToggleHandler);

    // Clear callbacks
    this.onExploreGalaxy = null;
    this.onResetGalaxy = null;
    this.onNavigateHome = null;
    this.onNavigateSystem = null;
    this.onTimeToggle = null;
    this.onSelectObject = null;

    // Clear references
    this.player = null;
    this.system = null;
    this.currentState = null;

    console.log("HUDManager disposed - all event listeners removed");
  }
}
