import {
  Player,
  StarSystem,
  SystemState,
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
} from "@constellation/shared";

export class HUDManager {
  private player: Player | null = null;
  private system: StarSystem | null = null;
  private currentState: SystemState | null = null;

  // HUD elements
  private authModal: HTMLElement;
  private errorMessage: HTMLElement;
  private galaxyNameInput: HTMLInputElement;
  private exploreGalaxyButton: HTMLElement;

  private navHomeButton: HTMLElement;
  private navSystemButton: HTMLElement;
  private navConstellationButton: HTMLElement;

  private timeDisplay: HTMLElement;
  private timeScaleDisplay: HTMLElement;
  private timeToggleButton: HTMLElement;

  private detailsPanel: HTMLElement;
  private detailName: HTMLElement;
  private detailType: HTMLElement;
  private detailMass: HTMLElement;
  private detailRadius: HTMLElement;
  private detailDistance: HTMLElement;
  private detailVelocity: HTMLElement;

  private systemOutline: HTMLElement;
  private outlineList: HTMLElement;

  private isPaused = false;

  // Callbacks
  public onExploreGalaxy: ((name: string) => void) | null = null;
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

    // Navigation
    this.navHomeButton = document.getElementById("nav-home")!;
    this.navSystemButton = document.getElementById("nav-system")!;
    this.navConstellationButton = document.getElementById("nav-constellation")!;

    // Time controls
    this.timeDisplay = document.getElementById("time-display")!;
    this.timeScaleDisplay = document.getElementById("time-scale")!;
    this.timeToggleButton = document.getElementById("time-toggle")!;

    // Details panel
    this.detailsPanel = document.getElementById("details-panel")!;
    this.detailName = document.getElementById("detail-name")!;
    this.detailType = document.getElementById("detail-type")!;
    this.detailMass = document.getElementById("detail-mass")!;
    this.detailRadius = document.getElementById("detail-radius")!;
    this.detailDistance = document.getElementById("detail-distance")!;
    this.detailVelocity = document.getElementById("detail-velocity")!;

    // System outline
    this.systemOutline = document.getElementById("system-outline")!;
    this.outlineList = document.getElementById("outline-list")!;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.exploreGalaxyButton.addEventListener("click", () => {
      const name = this.galaxyNameInput.value.trim() || "the Milky Way";
      if (this.onExploreGalaxy) {
        this.onExploreGalaxy(name);
      }
    });

    this.navHomeButton.addEventListener("click", () => {
      if (this.onNavigateHome) {
        this.onNavigateHome();
      }
    });

    this.navSystemButton.addEventListener("click", () => {
      if (this.onNavigateSystem) {
        this.onNavigateSystem();
      }
    });

    this.timeToggleButton.addEventListener("click", () => {
      if (this.onTimeToggle) {
        this.onTimeToggle();
      }
    });
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

    // Add planets
    this.system.planets.forEach((planet, index) => {
      const planetItem = document.createElement("div");
      planetItem.className = "outline-item planet";
      planetItem.textContent = `${index + 1}. ${planet.name}`;
      planetItem.dataset.objectId = planet.id;
      planetItem.addEventListener("click", () => {
        if (this.onSelectObject) {
          this.onSelectObject(planet.id);
        }
      });
      this.outlineList.appendChild(planetItem);
    });

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

    // Convert to days, hours, minutes
    const days = Math.floor(currentTime / 86400);
    const hours = Math.floor((currentTime % 86400) / 3600);
    const minutes = Math.floor((currentTime % 3600) / 60);

    this.timeDisplay.textContent = `${days}d ${hours}h ${minutes}m`;
    this.timeScaleDisplay.textContent = `${timeScale.toFixed(0)}x`;
    this.timeToggleButton.textContent = isPaused ? "Resume" : "Pause";
  }

  updateObjectDetails(objectId: string): void {
    if (!this.system || !this.currentState) {
      return;
    }

    // Update outline selection
    this.updateSelectedInOutline(objectId);

    // Find body in system
    let body = null;
    if (this.system.star.id === objectId) {
      body = this.system.star;
    } else {
      body = this.system.planets.find((p) => p.id === objectId);
    }

    if (!body) {
      // Check if it's a ship
      const shipState = this.currentState.ships.find((s) => s.id === objectId);
      if (shipState) {
        this.displayShipDetails(shipState);
      }
      return;
    }

    // Find body state
    const bodyState = this.currentState.bodies.find((b) => b.id === objectId);
    if (!bodyState) return;

    this.detailsPanel.classList.remove("hidden");
    this.detailName.textContent = body.name;
    this.detailType.textContent = body.type;
    this.detailMass.textContent = this.formatMass(body.mass);
    this.detailRadius.textContent = this.formatDistance(body.radius);

    // Calculate distance from parent
    if (body.parentId) {
      const parentState = this.currentState.bodies.find(
        (b) => b.id === body.parentId
      );
      if (parentState) {
        const dx = bodyState.position.x - parentState.position.x;
        const dy = bodyState.position.y - parentState.position.y;
        const dz = bodyState.position.z - parentState.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        this.detailDistance.textContent = this.formatDistance(distance);
      }
    } else {
      this.detailDistance.textContent = "0 m (center)";
    }

    // Calculate velocity magnitude
    const velocity = Math.sqrt(
      bodyState.velocity.x ** 2 +
        bodyState.velocity.y ** 2 +
        bodyState.velocity.z ** 2
    );
    this.detailVelocity.textContent = `${(velocity / 1000).toFixed(2)} km/s`;
  }

  private displayShipDetails(shipState: any): void {
    this.detailsPanel.classList.remove("hidden");
    this.detailName.textContent = "Your Ship";
    this.detailType.textContent = "ship";
    this.detailMass.textContent = "1000 kg";
    this.detailRadius.textContent = "5 m";

    const distance = Math.sqrt(
      shipState.position.x ** 2 +
        shipState.position.y ** 2 +
        shipState.position.z ** 2
    );
    this.detailDistance.textContent = this.formatDistance(distance);

    const velocity = Math.sqrt(
      shipState.velocity.x ** 2 +
        shipState.velocity.y ** 2 +
        shipState.velocity.z ** 2
    );
    this.detailVelocity.textContent = `${(velocity / 1000).toFixed(2)} km/s`;
  }

  updateState(state: SystemState): void {
    this.currentState = state;
  }

  private formatMass(mass: number): string {
    if (mass > 1e24) {
      return `${(mass / EARTH_MASS).toFixed(2)} Earth masses`;
    } else if (mass > 1e20) {
      return `${(mass / 1e24).toFixed(2)} × 10²⁴ kg`;
    } else {
      return `${mass.toExponential(2)} kg`;
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
}
