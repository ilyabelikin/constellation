import {
  SystemState,
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
  LifeLevel,
  CivilizationLevel,
} from "@constellation/shared";

/**
 * Manages the detail view for celestial bodies (stars, planets, moons, asteroids)
 */
export class BodyDetailView {
  private panel: HTMLElement;
  private nameElement: HTMLElement;
  private typeElement: HTMLElement;
  private massElement: HTMLElement;
  private radiusElement: HTMLElement;
  private distanceElement: HTMLElement;
  private velocityElement: HTMLElement;
  private lifeElement: HTMLElement | null;
  private habitabilityElement: HTMLElement | null;
  private compositionElement: HTMLElement | null;
  private shapeElement: HTMLElement | null;
  private debugSeedContainer: HTMLElement | null = null;
  private debugSeedSlider: HTMLInputElement | null = null;
  private debugSeedValue: HTMLElement | null = null;
  private isDebugMode: boolean = false;
  private currentBody: any = null;
  private currentBodyId: string | null = null;
  private userModifiedSeed: boolean = false; // Track if user has changed the slider
  private onSeedChange: ((seed: number) => void) | null = null;

  constructor() {
    this.panel = document.getElementById("body-details-panel")!;
    this.nameElement = document.getElementById("body-detail-name")!;
    this.typeElement = document.getElementById("body-detail-type")!;
    this.massElement = document.getElementById("body-detail-mass")!;
    this.radiusElement = document.getElementById("body-detail-radius")!;
    this.distanceElement = document.getElementById("body-detail-distance")!;
    this.velocityElement = document.getElementById("body-detail-velocity")!;
    this.lifeElement = document.getElementById("body-detail-life");
    this.habitabilityElement = document.getElementById(
      "body-detail-habitability"
    );
    this.compositionElement = document.getElementById(
      "body-detail-composition"
    );
    this.shapeElement = document.getElementById("body-detail-shape");

    // Check for debug mode via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    this.isDebugMode = urlParams.has("debug_mode");

    if (this.isDebugMode) {
      this.createDebugControls();
    }
  }

  /**
   * Set callback for when seed changes
   */
  setOnSeedChange(callback: (seed: number) => void): void {
    this.onSeedChange = callback;
  }

  /**
   * Create debug controls for seed adjustment
   */
  private createDebugControls(): void {
    // Create container for debug controls
    this.debugSeedContainer = document.createElement("div");
    this.debugSeedContainer.style.marginTop = "15px";
    this.debugSeedContainer.style.paddingTop = "15px";
    this.debugSeedContainer.style.borderTop =
      "1px solid var(--primary-color-dim)";

    // Title
    const title = document.createElement("div");
    title.style.color = "var(--primary-color-dim)";
    title.style.marginBottom = "8px";
    title.style.fontSize = "11px";
    title.textContent = "🔧 DEBUG: Visual Seed";

    // Slider container
    const sliderContainer = document.createElement("div");
    sliderContainer.style.display = "flex";
    sliderContainer.style.alignItems = "center";
    sliderContainer.style.gap = "8px";

    // Slider
    this.debugSeedSlider = document.createElement("input");
    this.debugSeedSlider.type = "range";
    this.debugSeedSlider.min = "0";
    this.debugSeedSlider.max = "10000";
    this.debugSeedSlider.value = "0";
    this.debugSeedSlider.style.flex = "1";
    this.debugSeedSlider.style.cursor = "pointer";

    // Value display
    this.debugSeedValue = document.createElement("span");
    this.debugSeedValue.style.color = "var(--primary-color)";
    this.debugSeedValue.style.fontSize = "12px";
    this.debugSeedValue.style.minWidth = "50px";
    this.debugSeedValue.textContent = "0";

    // Event listener
    this.debugSeedSlider.addEventListener("input", (e) => {
      // Mark that user has modified the seed FIRST (before any callbacks)
      this.userModifiedSeed = true;

      const seed = parseInt((e.target as HTMLInputElement).value);
      if (this.debugSeedValue) {
        this.debugSeedValue.textContent = seed.toString();
      }

      if (this.onSeedChange && this.currentBody) {
        this.onSeedChange(seed);
      }
    });

    sliderContainer.appendChild(this.debugSeedSlider);
    sliderContainer.appendChild(this.debugSeedValue);

    this.debugSeedContainer.appendChild(title);
    this.debugSeedContainer.appendChild(sliderContainer);

    // Append to panel (will be shown/hidden based on body type)
    this.panel.appendChild(this.debugSeedContainer);
    this.debugSeedContainer.style.display = "none";
  }

  /**
   * Show the celestial body detail panel with the given information
   */
  show(body: any, bodyState: any, currentState: SystemState): void {
    this.panel.classList.remove("hidden");
    this.currentBody = body;

    this.nameElement.textContent = body.name;
    this.typeElement.textContent =
      body.starType || body.planetType || body.type;
    this.massElement.textContent = this.formatMass(body.mass);
    this.radiusElement.textContent = this.formatDistance(body.radius);

    // Show composition and shape properties for asteroids and moons
    if (body.type === "asteroid" || body.type === "moon") {
      if (this.compositionElement) {
        this.compositionElement.style.display = "block";
        this.compositionElement.textContent = `Composition: ${this.formatComposition(
          body.composition
        )}`;
      }
      if (this.shapeElement) {
        this.shapeElement.style.display = "block";
        this.shapeElement.textContent = `Shape: ${this.formatShape(
          body.shape
        )}`;
      }
    } else {
      // Hide composition/shape properties for other body types
      if (this.compositionElement) {
        this.compositionElement.style.display = "none";
      }
      if (this.shapeElement) {
        this.shapeElement.style.display = "none";
      }
    }

    // Calculate distance from parent
    if (body.parentId) {
      const parentState = currentState.bodies.find(
        (b) => b.id === body.parentId
      );
      if (parentState) {
        const dx = bodyState.position.x - parentState.position.x;
        const dy = bodyState.position.y - parentState.position.y;
        const dz = bodyState.position.z - parentState.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        this.distanceElement.textContent = this.formatDistance(distance);
      }
    } else {
      this.distanceElement.textContent = "0 m (center)";
    }

    // Calculate velocity magnitude
    const velocity = Math.sqrt(
      bodyState.velocity.x ** 2 +
        bodyState.velocity.y ** 2 +
        bodyState.velocity.z ** 2
    );
    this.velocityElement.textContent = `${(velocity / 1000).toFixed(2)} km/s`;

    // Show life level if planet has life (only for planets)
    if (
      body.type === "planet" &&
      body.lifeLevel &&
      body.lifeLevel !== LifeLevel.NONE
    ) {
      if (this.lifeElement) {
        this.lifeElement.style.display = "block";
        let lifeText = `Life: ${this.formatLifeLevel(body.lifeLevel)}`;

        // Add civilization level for intelligent life
        if (
          body.lifeLevel === LifeLevel.INTELLIGENT &&
          body.civilizationLevel
        ) {
          lifeText += ` (${this.formatCivilizationLevel(
            body.civilizationLevel
          )})`;
        }

        this.lifeElement.textContent = lifeText;
      }
    } else {
      if (this.lifeElement) {
        this.lifeElement.style.display = "none";
      }
    }

    // Show habitability status (only for planets)
    if (body.type === "planet" && body.habitability !== undefined) {
      if (this.habitabilityElement) {
        this.habitabilityElement.style.display = "block";
        if (body.habitability >= 0.6) {
          this.habitabilityElement.textContent = `✓ Habitable (${(
            body.habitability * 100
          ).toFixed(0)}%)`;
        } else {
          this.habitabilityElement.textContent = `✗ Uninhabitable (${(
            body.habitability * 100
          ).toFixed(0)}%)`;
        }
      }
    } else {
      if (this.habitabilityElement) {
        this.habitabilityElement.style.display = "none";
      }
    }

    // Show/hide debug controls for planets in debug mode
    if (this.isDebugMode && this.debugSeedContainer && this.debugSeedSlider) {
      if (body.type === "planet") {
        this.debugSeedContainer.style.display = "block";

        // Check if this is a different planet
        const isDifferentPlanet = this.currentBodyId !== body.id;

        // Only reset the slider if:
        // 1. It's a different planet, OR
        // 2. It's the first time showing this planet (userModifiedSeed is false)
        const shouldResetSlider = isDifferentPlanet || !this.userModifiedSeed;

        if (shouldResetSlider) {
          // If switching to a different planet, reset the modification flag
          if (isDifferentPlanet) {
            this.userModifiedSeed = false;
          }

          // Convert planet ID to initial seed value
          const initialSeed =
            body.id
              .split("")
              .reduce(
                (acc: number, char: string) => acc + char.charCodeAt(0),
                0
              ) % 10001;

          // Only update if the value is actually different (avoid triggering input events)
          const currentSliderValue = parseInt(this.debugSeedSlider.value);
          if (currentSliderValue !== initialSeed) {
            this.debugSeedSlider.value = initialSeed.toString();
            if (this.debugSeedValue) {
              this.debugSeedValue.textContent = initialSeed.toString();
            }
          }
        }
        // If same planet AND user has modified the seed, keep the current slider value

        // Update current body ID
        this.currentBodyId = body.id;
      } else {
        this.debugSeedContainer.style.display = "none";
        this.currentBodyId = null;
        this.userModifiedSeed = false;
      }
    }
  }

  /**
   * Hide the detail panel
   * @param clearSelection - If true, clear the current selection (default true)
   */
  hide(clearSelection: boolean = true): void {
    this.panel.classList.add("hidden");

    // Only clear selection if explicitly requested
    if (clearSelection) {
      this.currentBody = null;
      this.currentBodyId = null;
      this.userModifiedSeed = false;
    }
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

  private formatComposition(composition?: string): string {
    if (!composition) return "Unknown";

    const compositions: { [key: string]: string } = {
      water: "Water Ice (H₂O)",
      metal: "Metallic (Fe, Ni)",
      silica: "Silicate Rock (SiO₂)",
    };

    return compositions[composition] || composition;
  }

  private formatShape(shape?: string): string {
    if (!shape) return "Unknown";

    const shapes: { [key: string]: string } = {
      spherical: "Spherical",
      elliptical: "Elliptical",
      rugged: "Irregular/Rugged",
    };

    return shapes[shape] || shape;
  }

  private formatLifeLevel(lifeLevel: string): string {
    // Capitalize first letter and format nicely
    return lifeLevel.charAt(0).toUpperCase() + lifeLevel.slice(1);
  }

  private formatCivilizationLevel(civilizationLevel: string): string {
    // Capitalize first letter and format nicely
    return (
      civilizationLevel.charAt(0).toUpperCase() + civilizationLevel.slice(1)
    );
  }
}
