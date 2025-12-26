import {
  SystemState,
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
  LifeLevel,
  CivilizationLevel,
  Player,
  StarSystem,
  formatLargeNumber,
  BASE_POPULATION_DENSITY,
  MINING_INSTALLATION_CONFIG,
  HELIUM3_EXTRACTION_CONFIG,
  HELIUM3_ENERGY,
  DYSON_SWARM_ENERGY,
  formatCost,
  GAME_COSTS,
  calculateMaxDysonSwarms,
  SOLAR_RADIUS,
  calculateIceCapCoverage,
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
  private speciesElement: HTMLElement | null;
  private controllerElement: HTMLElement | null;
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

  // Helium-3 elements
  private helium3Section: HTMLElement | null;
  private helium3Status: HTMLElement | null;
  private helium3Rate: HTMLElement | null;
  private helium3Button: HTMLButtonElement | null;
  public onEstablishHelium3: ((celestialBodyId: string) => void) | null = null;

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
  private invadeButton: HTMLButtonElement | null;
  private removeColonyButton: HTMLButtonElement | null;
  private specializationButtons: NodeListOf<HTMLButtonElement> | null;
  public onEstablishColony:
    | ((planetId: string, specialization: string) => void)
    | null = null;
  public onInvadeColony: ((planetId: string) => void) | null = null;
  public onRemoveColony: ((planetId: string) => void) | null = null;
  public onUpdateColonySpecialization:
    | ((colonyId: string, specialization: string) => void)
    | null = null;

  // Home planet reference for relative mass display
  private homePlanetMass: number = EARTH_MASS;
  private homePlanetName: string = "Earth";

  // Species data access
  private speciesGetter: ((speciesId: string) => any) | null = null;
  private playerGetter: ((playerId: string) => any) | null = null;
  private networkClient: any = null;
  private currentPlayerId: string | null = null;
  private isConnectedToCapital: boolean = true;

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
    this.speciesElement = document.getElementById("body-detail-species");
    this.controllerElement = document.getElementById("body-detail-controller");
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

    // Helium-3 elements
    this.helium3Section = document.getElementById("body-helium3-section");
    this.helium3Status = document.getElementById("body-helium3-status");
    this.helium3Rate = document.getElementById("body-helium3-rate");
    this.helium3Button = document.getElementById(
      "body-helium3-button"
    ) as HTMLButtonElement;

    // Bind mine button click and set initial text from config
    if (this.mineButton) {
      // Set button text from config using shared formatCost function
      this.mineButton.textContent = `⛏ Establish Mining ${formatCost(
        MINING_INSTALLATION_CONFIG.cost
      )}`;

      this.mineButton.addEventListener("click", () => {
        if (this.currentBody && this.onEstablishMining) {
          this.onEstablishMining(this.currentBody.id);
        }
      });
    }

    // Bind Helium-3 button click and set initial text from config
    if (this.helium3Button) {
      this.helium3Button.textContent = `⚡ Establish Helium-3 Extraction ${formatCost(
        HELIUM3_EXTRACTION_CONFIG.cost
      )} → +${HELIUM3_ENERGY} ⚡`;

      this.helium3Button.addEventListener("click", () => {
        if (this.currentBody && this.onEstablishHelium3) {
          this.onEstablishHelium3(this.currentBody.id);
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
    this.invadeButton = document.getElementById(
      "body-invade-button"
    ) as HTMLButtonElement;
    this.removeColonyButton = document.getElementById(
      "body-remove-colony-button"
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

    // Bind invade button click
    if (this.invadeButton) {
      this.invadeButton.addEventListener("click", () => {
        if (this.currentBody && this.onInvadeColony) {
          this.onInvadeColony(this.currentBody.id);
        }
      });
    }

    // Bind remove colony button click (debug only)
    if (this.removeColonyButton) {
      this.removeColonyButton.addEventListener("click", () => {
        if (this.currentBody && this.onRemoveColony) {
          this.onRemoveColony(this.currentBody.id);
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
   * Set the current player ID for ownership checks
   */
  setCurrentPlayerId(playerId: string | null): void {
    this.currentPlayerId = playerId;
  }

  /**
   * Set whether the current system is connected to the player's capital
   */
  setConnectedToCapital(isConnected: boolean): void {
    this.isConnectedToCapital = isConnected;
  }

  /**
   * Set callback for when seed changes
   */
  setOnSeedChange(callback: (seed: number) => void): void {
    this.onSeedChange = callback;
  }

  /**
   * Set the species getter function for looking up species data
   */
  setSpeciesGetter(
    getter: (speciesId: string) => any,
    networkClient: any
  ): void {
    this.speciesGetter = getter;
    this.networkClient = networkClient;
  }

  /**
   * Set the player getter function for looking up player names
   */
  setPlayerGetter(getter: (playerId: string) => any): void {
    this.playerGetter = getter;
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
    this.currentBodyId = body.id;

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

    // Show species information (only for planets with life or colonies)
    if (body.type === "planet") {
      // Check for colony on this planet
      const colony = this.currentSystem?.colonies?.find(
        (c: any) => c.planetId === body.id
      );

      // Check for native civilization on this planet
      const nativeCiv = this.currentSystem?.nativeCivilizations?.find(
        (nc: any) => nc.planetId === body.id
      );

      const speciesId = colony?.speciesId || nativeCiv?.speciesId;

      if (speciesId && this.speciesElement) {
        // Try to get species from cache
        const species = this.speciesGetter
          ? this.speciesGetter(speciesId)
          : null;

        if (species) {
          // Species data is cached, display it
          this.speciesElement.style.display = "block";
          this.speciesElement.textContent = `Population: ${species.name}`;
        } else {
          // Species not cached, request it and show loading
          this.speciesElement.style.display = "block";
          this.speciesElement.textContent = "Population: Loading...";

          // Request species info from server
          if (this.networkClient) {
            this.networkClient.requestSpeciesInfo(speciesId);
          }
        }
      } else {
        // No species on this planet
        if (this.speciesElement) {
          this.speciesElement.style.display = "none";
        }
      }

      // Show controller/government information
      if (colony && this.controllerElement) {
        const controllerId = colony.playerId;
        const controller = this.playerGetter
          ? this.playerGetter(controllerId)
          : null;

        this.controllerElement.style.display = "block";
        if (controller) {
          this.controllerElement.textContent = `Government: ${controller.name}`;
        } else if (controllerId === this.currentPlayerId) {
          this.controllerElement.textContent = `Government: You`;
        } else {
          this.controllerElement.textContent = `Government: Unknown`;
        }
      } else if (nativeCiv && this.controllerElement) {
        this.controllerElement.style.display = "block";
        this.controllerElement.textContent = `Government: Native`;
      } else {
        if (this.controllerElement) {
          this.controllerElement.style.display = "none";
        }
      }
    } else {
      // Hide species for non-planets
      if (this.speciesElement) {
        this.speciesElement.style.display = "none";
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
              const remaining =
                existingOperation.totalAlloyLimit -
                existingOperation.alloyMined;
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

    // Show/hide Helium-3 section for planets and moons with Helium-3
    if ((body.type === "planet" || body.type === "moon") && body.hasHelium3) {
      if (this.helium3Section) {
        this.helium3Section.style.display = "block";

        // Check if there's already a Helium-3 operation on this body
        const existingOperation = this.currentSystem?.helium3Operations?.find(
          (op: any) => op.celestialBodyId === body.id
        );

        if (existingOperation) {
          // Show Helium-3 status, hide button
          if (this.helium3Status) {
            this.helium3Status.style.display = "block";
            if (this.helium3Rate) {
              this.helium3Rate.textContent =
                existingOperation.energyPerDay.toFixed(2);
            }
          }
          if (this.helium3Button) {
            this.helium3Button.style.display = "none";
          }
        } else {
          // Hide Helium-3 status, show button
          if (this.helium3Status) {
            this.helium3Status.style.display = "none";
          }
          if (this.helium3Button) {
            this.helium3Button.style.display = "block";
          }
        }
      }
    } else {
      // Hide Helium-3 section for bodies without Helium-3
      if (this.helium3Section) {
        this.helium3Section.style.display = "none";
      }
    }

    // Show/hide Dyson Swarm section for stars
    if (body.type === "star") {
      if (this.dysonSection) {
        this.dysonSection.style.display = "block";

        // Calculate maximum swarms based on star's physical size (12-320 range)
        const starRadiusInSolarRadii = body.radius / SOLAR_RADIUS;
        const maxSwarms = calculateMaxDysonSwarms(starRadiusInSolarRadii);

        // Count existing Dyson Swarms on this star
        const dysonSwarms =
          this.currentSystem?.megastructures?.filter(
            (ms: any) =>
              ms.type === "dyson_swarm" && ms.celestialBodyId === body.id
          ) || [];

        const swarmCount = dysonSwarms.length;

        // Calculate total energy from all swarms (1 energy per swarm base, may vary with tech)
        const totalEnergy = dysonSwarms.reduce(
          (sum: number, ms: any) => sum + (ms.resourcePerDay || 0),
          0
        );

        // Always show swarm status for stars
        if (this.dysonStatus) {
          this.dysonStatus.style.display = "block";
          if (this.dysonCount) {
            this.dysonCount.textContent = `${swarmCount}/${maxSwarms}`;
          }
          if (this.dysonEnergy) {
            this.dysonEnergy.textContent =
              totalEnergy > 0 ? `+${totalEnergy.toFixed(1)}` : `0`;
          }
        }

        // Hide button if at max capacity
        if (this.dysonButton) {
          if (swarmCount >= maxSwarms) {
            this.dysonButton.style.display = "none";
          } else {
            this.dysonButton.style.display = "block";
            this.dysonButton.textContent = `☀ Launch Dyson Swarm ${formatCost(
              GAME_COSTS.DYSON_SWARM
            )} → +${DYSON_SWARM_ENERGY} ⚡`;
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
      body.habitability >= 0.6
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
              // Calculate max population for this planet
              const surfaceArea = 4 * Math.PI * body.radius * body.radius;

              // Calculate ice cap coverage to reduce habitable surface area
              const semiMajorAxis = body.orbitalElements?.semiMajorAxis || 0;
              const iceCapCoverage = calculateIceCapCoverage(
                semiMajorAxis,
                body.habitability || 0,
                body.id,
                body.surfaceType,
                body.hasAtmosphere
              );

              // Ice caps reduce available habitable surface area proportionally
              const habitableSurfaceFactor = 1 - iceCapCoverage;
              const maxPopulation = Math.floor(
                surfaceArea *
                  BASE_POPULATION_DENSITY *
                  (body.habitability || 0) *
                  habitableSurfaceFactor
              );

              this.colonyPopulation.textContent = `${formatLargeNumber(
                existingColony.population
              )}/${formatLargeNumber(maxPopulation)}`;
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

          // Show/hide invasion button
          if (this.invadeButton) {
            if (
              existingColony.playerId !== this.currentPlayerId &&
              this.currentPlayerId !== null
            ) {
              this.invadeButton.style.display = "block";
              
              if (this.isConnectedToCapital) {
                this.invadeButton.textContent = `⚔️ Invade Colony ${formatCost(
                  GAME_COSTS.COLONY_INVASION
                )}`;
                this.invadeButton.disabled = false;
                this.invadeButton.style.opacity = "1";
                this.invadeButton.title = "";
              } else {
                this.invadeButton.textContent = `⚔️ Invasion Blocked`;
                this.invadeButton.disabled = true;
                this.invadeButton.style.opacity = "0.5";
                this.invadeButton.title = "You must have full control of all gates and tunnels from your capital to this system to invade.";
              }
            } else {
              this.invadeButton.style.display = "none";
            }
          }

          // Show remove colony button in debug mode
          if (this.removeColonyButton && this.isDebugMode) {
            this.removeColonyButton.style.display = "block";
          }
        } else {
          // Hide colony status, show colonize button
          if (this.colonyStatus) {
            this.colonyStatus.style.display = "none";
          }
          if (this.colonizeButton) {
            this.colonizeButton.style.display = "block";
            // Update button text with costs from config
            this.colonizeButton.textContent = `🏙 Establish Colony ${formatCost(
              GAME_COSTS.COLONY_ESTABLISHMENT
            )}`;
          }
          // Hide invade button when no colony
          if (this.invadeButton) {
            this.invadeButton.style.display = "none";
          }
          // Hide remove colony button when no colony
          if (this.removeColonyButton) {
            this.removeColonyButton.style.display = "none";
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
    if (this.speciesElement) {
      this.speciesElement.style.display = "none";
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
