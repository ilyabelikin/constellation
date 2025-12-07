import {
  SystemState,
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
  LifeLevel,
  CivilizationLevel,
  Player,
  StarSystem,
  formatLargeNumber,
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

  // Mining elements
  private miningSection: HTMLElement | null;
  private miningStatus: HTMLElement | null;
  private miningRate: HTMLElement | null;
  private miningRemaining: HTMLElement | null;
  private mineButton: HTMLButtonElement | null;
  private currentSystem: StarSystem | null = null;
  public onEstablishMining: ((celestialBodyId: string) => void) | null = null;

  // Dyson Swarm elements
  private dysonSection: HTMLElement | null;
  private dysonStatus: HTMLElement | null;
  private dysonCount: HTMLElement | null;
  private dysonEnergy: HTMLElement | null;
  private dysonButton: HTMLButtonElement | null;
  public onLaunchDysonSwarm: ((starId: string) => void) | null = null;

  // Colony elements
  private colonySection: HTMLElement | null;
  private colonyStatus: HTMLElement | null;
  private colonyStage: HTMLElement | null;
  private colonyPopulation: HTMLElement | null;
  private colonySpecialization: HTMLElement | null;
  private colonyScience: HTMLElement | null;
  private colonyAlloy: HTMLElement | null;
  private colonizeButton: HTMLButtonElement | null;
  private specializationButtons: NodeListOf<HTMLButtonElement> | null;
  public onEstablishColony:
    | ((planetId: string, specialization: string) => void)
    | null = null;
  public onUpdateColonySpecialization:
    | ((colonyId: string, specialization: string) => void)
    | null = null;

  // Home planet reference for relative mass display
  private homePlanetMass: number = EARTH_MASS;
  private homePlanetName: string = "Earth";

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

    // Mining elements
    this.miningSection = document.getElementById("body-mining-section");
    this.miningStatus = document.getElementById("body-mining-status");
    this.miningRate = document.getElementById("body-mining-rate");
    this.miningRemaining = document.getElementById("body-mining-remaining");
    this.mineButton = document.getElementById(
      "body-mine-button"
    ) as HTMLButtonElement;

    // Bind mine button click
    if (this.mineButton) {
      this.mineButton.addEventListener("click", () => {
        if (this.currentBody && this.onEstablishMining) {
          this.onEstablishMining(this.currentBody.id);
        }
      });
    }

    // Dyson Swarm elements
    this.dysonSection = document.getElementById("body-dyson-section");
    this.dysonStatus = document.getElementById("body-dyson-status");
    this.dysonCount = document.getElementById("body-dyson-count");
    this.dysonEnergy = document.getElementById("body-dyson-energy");
    this.dysonButton = document.getElementById(
      "body-dyson-button"
    ) as HTMLButtonElement;

    // Bind dyson button click
    if (this.dysonButton) {
      this.dysonButton.addEventListener("click", () => {
        if (this.currentBody && this.onLaunchDysonSwarm) {
          this.onLaunchDysonSwarm(this.currentBody.id);
        }
      });
    }

    // Colony elements
    this.colonySection = document.getElementById("body-colony-section");
    this.colonyStatus = document.getElementById("body-colony-status");
    this.colonyStage = document.getElementById("body-colony-stage");
    this.colonyPopulation = document.getElementById("body-colony-population");
    this.colonySpecialization = document.getElementById(
      "body-colony-specialization"
    );
    this.colonyScience = document.getElementById("body-colony-science");
    this.colonyAlloy = document.getElementById("body-colony-alloy");
    this.colonizeButton = document.getElementById(
      "body-colonize-button"
    ) as HTMLButtonElement;
    this.specializationButtons = document.querySelectorAll(
      "#body-colony-specialization-buttons button"
    );

    // Bind colonize button click
    if (this.colonizeButton) {
      this.colonizeButton.addEventListener("click", () => {
        if (this.currentBody && this.onEstablishColony) {
          // Default to balanced specialization
          this.onEstablishColony(this.currentBody.id, "balanced");
        }
      });
    }

    // Bind specialization button clicks
    if (this.specializationButtons) {
      this.specializationButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const specialization = button.getAttribute("data-specialization");
          if (
            specialization &&
            this.currentBody &&
            this.onUpdateColonySpecialization
          ) {
            // Find the colony ID for this planet
            const colony = this.currentSystem?.colonies?.find(
              (c) => c.planetId === this.currentBody.id
            );
            if (colony) {
              this.onUpdateColonySpecialization(colony.id, specialization);
            }
          }
        });
      });
    }

    // Check for debug mode via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    this.isDebugMode = urlParams.has("debug_mode");

    if (this.isDebugMode) {
      this.createDebugControls();
    }
  }

  /**
   * Set the current system for mining operation checks
   */
  setCurrentSystem(system: StarSystem | null): void {
    this.currentSystem = system;
  }

  /**
   * Set callback for when seed changes
   */
  setOnSeedChange(callback: (seed: number) => void): void {
    this.onSeedChange = callback;
  }

  /**
   * Set the home planet reference for relative mass display
   */
  setHomePlanet(player: Player | null, system: StarSystem | null): void {
    if (!player || !system) {
      return; // Keep existing values if no player/system
    }

    // Only update if we're in the home system (or if we haven't set it yet)
    if (system.id === player.homeSystemId || this.homePlanetName === "Earth") {
      // Find the home planet in the system
      const homePlanet = system.planets.find(
        (p) => p.id === player.homePlanetId
      );
      if (homePlanet) {
        this.homePlanetMass = homePlanet.mass;
        this.homePlanetName = homePlanet.name;
      }
    }
    // If we're in a different system and already have home planet data, keep it
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

    // Show/hide mining section for asteroids and moons
    if (
      (body.type === "asteroid" || body.type === "moon") &&
      body.composition === "metal"
    ) {
      if (this.miningSection) {
        this.miningSection.style.display = "block";

        // Check if there's already a mining operation on this body
        const existingOperation = this.currentSystem?.miningOperations?.find(
          (op: any) => op.celestialBodyId === body.id
        );

        if (existingOperation) {
          // Show mining status, hide button
          if (this.miningStatus) {
            this.miningStatus.style.display = "block";
            if (this.miningRate) {
              this.miningRate.textContent =
                existingOperation.alloyPerDay.toFixed(2);
            }
            if (this.miningRemaining) {
              const remaining = existingOperation.totalAlloyLimit - existingOperation.alloyMined;
              this.miningRemaining.textContent = remaining.toFixed(1);
            }
          }
          if (this.mineButton) {
            this.mineButton.style.display = "none";
          }
        } else {
          // Hide mining status, show button
          if (this.miningStatus) {
            this.miningStatus.style.display = "none";
          }
          if (this.mineButton) {
            this.mineButton.style.display = "block";
          }
        }
      }
    } else {
      // Hide mining section for non-mineable bodies
      if (this.miningSection) {
        this.miningSection.style.display = "none";
      }
    }

    // Show/hide Dyson Swarm section for stars
    if (body.type === "star") {
      if (this.dysonSection) {
        this.dysonSection.style.display = "block";

        // Count existing Dyson Swarms on this star
        const dysonSwarms =
          this.currentSystem?.megastructures?.filter(
            (ms: any) =>
              ms.type === "dyson_swarm" && ms.celestialBodyId === body.id
          ) || [];

        const swarmCount = dysonSwarms.length;
        const maxSwarms = 30;
        const totalEnergy = swarmCount * 1; // 1 energy per swarm (permanent boost)

        // Always show swarm status for stars
        if (this.dysonStatus) {
          this.dysonStatus.style.display = "block";
          if (this.dysonCount) {
            this.dysonCount.textContent = `${swarmCount}`;
          }
          if (this.dysonEnergy) {
            this.dysonEnergy.textContent =
              totalEnergy > 0 ? `+${totalEnergy}` : `${totalEnergy}`;
          }
        }

        // Hide button if at max capacity
        if (this.dysonButton) {
          if (swarmCount >= maxSwarms) {
            this.dysonButton.style.display = "none";
          } else {
            this.dysonButton.style.display = "block";
            this.dysonButton.textContent = `☀ Launch Dyson Swarm (10 ⛏) [${swarmCount}/${maxSwarms}]`;
          }
        }
      }
    } else {
      // Hide dyson section for non-stars
      if (this.dysonSection) {
        this.dysonSection.style.display = "none";
      }
    }

    // Show/hide Colony section for habitable planets
    if (
      body.type === "planet" &&
      body.habitability !== undefined &&
      body.habitability >= 0.3
    ) {
      if (this.colonySection) {
        this.colonySection.style.display = "block";

        // Check if there's already a colony on this planet
        const existingColony = this.currentSystem?.colonies?.find(
          (col: any) => col.planetId === body.id
        );

        if (existingColony) {
          // Show colony status, hide colonize button
          if (this.colonyStatus) {
            this.colonyStatus.style.display = "block";
            if (this.colonyStage) {
              this.colonyStage.textContent =
                existingColony.stage.charAt(0).toUpperCase() +
                existingColony.stage.slice(1);
            }
            if (this.colonyPopulation) {
              this.colonyPopulation.textContent = formatLargeNumber(
                existingColony.population
              );
            }
            if (this.colonySpecialization) {
              this.colonySpecialization.textContent =
                existingColony.specialization.charAt(0).toUpperCase() +
                existingColony.specialization.slice(1);
            }
            if (this.colonyScience) {
              this.colonyScience.textContent =
                existingColony.sciencePerDay.toFixed(2);
            }
            if (this.colonyAlloy) {
              this.colonyAlloy.textContent =
                existingColony.alloyPerDay.toFixed(2);
            }

            // Highlight current specialization button
            if (this.specializationButtons) {
              this.specializationButtons.forEach((btn) => {
                if (
                  btn.getAttribute("data-specialization") ===
                  existingColony.specialization
                ) {
                  btn.style.background = "#8b5cf6";
                  btn.style.fontWeight = "bold";
                } else {
                  btn.style.background = "";
                  btn.style.fontWeight = "";
                }
              });
            }
          }
          if (this.colonizeButton) {
            this.colonizeButton.style.display = "none";
          }
        } else {
          // Hide colony status, show colonize button
          if (this.colonyStatus) {
            this.colonyStatus.style.display = "none";
          }
          if (this.colonizeButton) {
            this.colonizeButton.style.display = "block";
          }
        }
      }
    } else {
      // Hide colony section for non-habitable planets
      if (this.colonySection) {
        this.colonySection.style.display = "none";
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
   * Show constellation system info (simplified view for constellation mode)
   */
  showConstellationSystem(
    systemName: string,
    distance: number,
    starType: string,
    starMass: number,
    planetCount: number,
    exploredGates: number,
    totalGates: number
  ): void {
    this.panel.classList.remove("hidden");

    this.nameElement.textContent = systemName;
    this.typeElement.textContent = starType;
    this.distanceElement.textContent = `${distance.toFixed(2)} light years`;

    // Show star mass relative to home planet's star (assuming sun-like)
    if (this.homePlanetMass > 0) {
      const relativeMass = starMass / 1.0; // Star mass is in solar masses
      this.massElement.textContent = `${starMass.toFixed(2)} solar masses`;
    } else {
      this.massElement.textContent = `${starMass.toFixed(2)} solar masses`;
    }

    // Show planet count
    this.radiusElement.textContent = `${planetCount} planet${
      planetCount !== 1 ? "s" : ""
    }`;

    // Show gate count
    this.velocityElement.textContent = `Gates: ${exploredGates}/${totalGates}`;

    // Hide optional fields
    if (this.lifeElement) {
      this.lifeElement.style.display = "none";
    }
    if (this.habitabilityElement) {
      this.habitabilityElement.style.display = "none";
    }
    if (this.compositionElement) {
      this.compositionElement.style.display = "none";
    }
    if (this.shapeElement) {
      this.shapeElement.style.display = "none";
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
      const relativeMass = mass / this.homePlanetMass;
      return `${relativeMass.toFixed(2)} ${this.homePlanetName} masses`;
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
