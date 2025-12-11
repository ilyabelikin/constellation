import { GAME_VERSION, VERSION_NAME, Species } from "@constellation/shared";

interface GalaxyInfo {
  id: string;
  name: string;
  createdAt: number;
  currentTime: number;
  starCount: number;
  habitablePlanets: number;
  activePlayers: number;
  lastActivity: number;
}

/**
 * LobbyManager - Handles the redesigned lobby screen with multiple views
 */
export class LobbyManager {
  private authModal: HTMLElement;
  private versionDisplay: HTMLElement;
  private continueButton: HTMLElement;
  private newGameButton: HTMLElement;
  private resetButton: HTMLElement;
  private gameStatus: HTMLElement;
  private errorMessage: HTMLElement;
  private changelogContent: HTMLElement;

  // Views
  private lobbyMainView: HTMLElement;
  private galaxySelectionView: HTMLElement;
  private speciesSelectionView: HTMLElement;

  // Galaxy selection elements
  private galaxyList: HTMLElement;
  private createNewGalaxyButton: HTMLElement;
  private backToLobbyButton: HTMLElement;

  // Species selection elements
  private speciesGrid: HTMLElement;
  private backToGalaxySelectionButton: HTMLElement;

  // Species detail card elements
  private speciesDetailCard: HTMLElement;
  private speciesDetailName: HTMLElement;
  private speciesDetailBodyType: HTMLElement;
  private speciesDetailSkinColor: HTMLElement;
  private speciesDetailEyeColor: HTMLElement;
  private speciesDetailHeight: HTMLElement;
  private speciesDetailBuild: HTMLElement;
  private speciesDetailTraits: HTMLElement;
  private speciesDetailDescription: HTMLElement;
  private speciesDetailBackButton: HTMLButtonElement;
  private speciesDetailPlayButton: HTMLButtonElement;

  // State
  private hasExistingGame: boolean = false;
  private playerGameInfo: any = null;
  private galaxies: GalaxyInfo[] = [];
  private pregeneratedSpecies: Species[] = [];
  private selectedGalaxyId: string | null = null;
  private selectedSpecies: Species | null = null;
  private isCreatingNewGalaxy: boolean = false;
  private takenSpeciesIds: string[] = [];

  // Callbacks
  public onContinue: ((galaxyId: string) => void) | null = null;
  public onJoinGalaxy: ((galaxyId: string, playerName: string, speciesId: string) => void) | null = null;
  public onCreateGalaxy: ((playerName: string, speciesId: string) => void) | null = null;
  public onReset: ((galaxyName: string, playerName: string) => void) | null = null;

  // Network callback for requesting data
  public requestGalaxyList: (() => void) | null = null;
  public requestPlayerGameInfo: (() => void) | null = null;
  public requestPregeneratedSpecies: (() => void) | null = null;
  public requestGalaxySpecies: ((galaxyId: string) => void) | null = null;
  public createEmptyGalaxy: (() => void) | null = null;

  constructor() {
    this.authModal = document.getElementById("auth-modal")!;
    this.versionDisplay = document.getElementById("version-display")!;
    this.continueButton = document.getElementById("continue-game")!;
    this.newGameButton = document.getElementById("new-game")!;
    this.resetButton = document.getElementById("reset-galaxy")!;
    this.gameStatus = document.getElementById("game-status")!;
    this.errorMessage = document.getElementById("error-message")!;
    this.changelogContent = document.getElementById("changelog-content")!;

    // Views
    this.lobbyMainView = document.getElementById("lobby-main")!;
    this.galaxySelectionView = document.getElementById("lobby-galaxy-selection")!;
    this.speciesSelectionView = document.getElementById("lobby-species-selection")!;

    // Galaxy selection
    this.galaxyList = document.getElementById("galaxy-list")!;
    this.createNewGalaxyButton = document.getElementById("create-new-galaxy")!;
    this.backToLobbyButton = document.getElementById("back-to-lobby")!;

    // Species selection
    this.speciesGrid = document.getElementById("species-grid")!;
    this.backToGalaxySelectionButton = document.getElementById("back-to-galaxy-selection")!;

    // Species detail card
    this.speciesDetailCard = document.getElementById("species-detail-card")!;
    this.speciesDetailName = document.getElementById("species-detail-name")!;
    this.speciesDetailBodyType = document.getElementById("species-detail-body-type")!;
    this.speciesDetailSkinColor = document.getElementById("species-detail-skin-color")!;
    this.speciesDetailEyeColor = document.getElementById("species-detail-eye-color")!;
    this.speciesDetailHeight = document.getElementById("species-detail-height")!;
    this.speciesDetailBuild = document.getElementById("species-detail-build")!;
    this.speciesDetailTraits = document.getElementById("species-detail-traits")!;
    this.speciesDetailDescription = document.getElementById("species-detail-description")!;
    this.speciesDetailBackButton = document.getElementById("species-detail-back") as HTMLButtonElement;
    this.speciesDetailPlayButton = document.getElementById("species-detail-play") as HTMLButtonElement;

    // Set version
    this.versionDisplay.textContent = `v${GAME_VERSION} - ${VERSION_NAME}`;

    // Setup button handlers
    this.continueButton.addEventListener("click", () => {
      if (this.playerGameInfo && this.onContinue) {
        this.onContinue(this.playerGameInfo.galaxyId);
      }
    });

    this.newGameButton.addEventListener("click", () => {
      this.showGalaxySelection();
    });

    this.resetButton.addEventListener("click", () => {
      if (this.playerGameInfo && this.onReset) {
        this.onReset(
          this.playerGameInfo.galaxyName,
          this.playerGameInfo.playerName
        );
      }
    });

    this.createNewGalaxyButton.addEventListener("click", () => {
      // Create an empty galaxy and add it to the list
      if (this.createEmptyGalaxy) {
        this.createEmptyGalaxy();
      }
    });

    this.backToLobbyButton.addEventListener("click", () => {
      this.showMainLobby();
    });

    this.backToGalaxySelectionButton.addEventListener("click", () => {
      this.showGalaxySelection();
    });

    this.speciesDetailBackButton.addEventListener("click", () => {
      this.hideSpeciesDetail();
    });

    this.speciesDetailPlayButton.addEventListener("click", () => {
      this.confirmSpeciesSelection();
    });

    // Load changelog
    this.loadChangelog();
  }

  public setPlayerGameInfo(info: any): void {
    this.playerGameInfo = info;
    this.hasExistingGame = info.hasGame;
    this.updateContinueButton();
  }

  public setGalaxyList(galaxies: GalaxyInfo[]): void {
    this.galaxies = galaxies;
    this.renderGalaxyList();
  }

  public setPregeneratedSpecies(species: Species[]): void {
    this.pregeneratedSpecies = species;
    this.renderSpeciesGrid();
  }

  public setTakenSpecies(speciesIds: string[]): void {
    this.takenSpeciesIds = speciesIds;
    this.renderSpeciesGrid();
  }

  public onEmptyGalaxyCreated(): void {
    // Refresh the galaxy list to show the new galaxy
    if (this.requestGalaxyList) {
      this.requestGalaxyList();
    }
  }

  private updateContinueButton(): void {
    if (this.hasExistingGame && this.playerGameInfo) {
      // Show Continue button with species name
      this.continueButton.style.display = "block";
      this.continueButton.textContent = `Continue as ${this.playerGameInfo.speciesName}`;
      
      // Show galaxy status message
      this.gameStatus.textContent =
        `Playing in ${this.playerGameInfo.galaxyName}. Continue your adventure or start a new game.`;
      this.gameStatus.style.display = "block";
      
      // Always show New Game button
      this.newGameButton.style.display = "block";

      // Show reset button only in debug mode
      const urlParams = new URLSearchParams(window.location.search);
      const isDebugMode = urlParams.has("debug_mode");
      this.resetButton.style.display = isDebugMode ? "block" : "none";
    } else {
      // No existing game
      this.continueButton.style.display = "none";
      this.gameStatus.style.display = "none";
      this.newGameButton.style.display = "block";
      this.resetButton.style.display = "none";
    }
  }

  private showMainLobby(): void {
    this.lobbyMainView.style.display = "flex";
    this.galaxySelectionView.style.display = "none";
    this.speciesSelectionView.style.display = "none";
  }

  private showGalaxySelection(): void {
    this.lobbyMainView.style.display = "none";
    this.galaxySelectionView.style.display = "block";
    this.speciesSelectionView.style.display = "none";

    // Request galaxy list from server
    if (this.requestGalaxyList) {
      this.requestGalaxyList();
    }

    // Request pregenerated species (needed for next step)
    if (this.requestPregeneratedSpecies) {
      this.requestPregeneratedSpecies();
    }
  }

  private showSpeciesSelection(): void {
    this.lobbyMainView.style.display = "none";
    this.galaxySelectionView.style.display = "none";
    this.speciesSelectionView.style.display = "block";

    // Clear taken species when creating new galaxy
    if (this.isCreatingNewGalaxy) {
      this.takenSpeciesIds = [];
    }

    // Render the grid (will show loading state if empty)
    this.renderSpeciesGrid();

    // Ensure we have species loaded
    if (this.pregeneratedSpecies.length === 0 && this.requestPregeneratedSpecies) {
      this.requestPregeneratedSpecies();
    }

    // Request taken species for the selected galaxy
    if (!this.isCreatingNewGalaxy && this.selectedGalaxyId && this.requestGalaxySpecies) {
      this.requestGalaxySpecies(this.selectedGalaxyId);
    }
  }

  private renderGalaxyList(): void {
    this.galaxyList.innerHTML = "";

    if (this.galaxies.length === 0) {
      this.galaxyList.innerHTML = `
        <div style="text-align: center; color: var(--primary-color-dim); padding: 20px;">
          No active galaxies found. Start a new one!
        </div>
      `;
      return;
    }

    this.galaxies.forEach((galaxy) => {
      const galaxyItem = document.createElement("div");
      galaxyItem.className = "galaxy-item";

      const timeSinceCreation = Date.now() - galaxy.createdAt;
      const timeSinceActivity = Date.now() - galaxy.lastActivity;

      const formatTime = (ms: number): string => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);

        if (weeks > 0) return `${weeks}w ago`;
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        return "recently";
      };

      galaxyItem.innerHTML = `
        <div class="galaxy-item-name">${galaxy.name}</div>
        <div class="galaxy-item-stats">
          <span class="galaxy-item-stat">⭐ ${galaxy.starCount} stars</span>
          <span class="galaxy-item-stat">🌍 ${galaxy.habitablePlanets} habitable planets</span>
          <span class="galaxy-item-stat">👥 ${galaxy.activePlayers} active player${galaxy.activePlayers !== 1 ? 's' : ''}</span>
          <span class="galaxy-item-stat">🕐 Started ${formatTime(timeSinceCreation)}</span>
          <span class="galaxy-item-stat">📅 Active ${formatTime(timeSinceActivity)}</span>
        </div>
      `;

      galaxyItem.addEventListener("click", () => {
        // Check if player already exists in this galaxy
        if (
          this.hasExistingGame &&
          this.playerGameInfo &&
          this.playerGameInfo.galaxyId === galaxy.id
        ) {
          // Player is already in this galaxy, continue directly into the game
          if (this.onContinue) {
            this.onContinue(galaxy.id);
          }
        } else {
          // Player is not in this galaxy, show species selection
          this.selectedGalaxyId = galaxy.id;
          this.isCreatingNewGalaxy = false;
          this.showSpeciesSelection();
        }
      });

      this.galaxyList.appendChild(galaxyItem);
    });
  }

  private renderSpeciesGrid(): void {
    this.speciesGrid.innerHTML = "";

    if (this.pregeneratedSpecies.length === 0) {
      this.speciesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--primary-color-dim); padding: 20px;">
          Loading species...
        </div>
      `;
      return;
    }

    this.pregeneratedSpecies.forEach((species) => {
      const speciesButton = document.createElement("button");
      speciesButton.className = "species-button";
      speciesButton.textContent = species.name;
      
      // Check if this species is already taken in the galaxy
      const isTaken = this.takenSpeciesIds.includes(species.id);
      
      if (isTaken) {
        speciesButton.disabled = true;
        speciesButton.style.opacity = "0.3";
        speciesButton.style.cursor = "not-allowed";
        speciesButton.title = `${species.name} - Already taken in this galaxy`;
      } else {
        speciesButton.title = species.description;
      }

      speciesButton.addEventListener("click", () => {
        if (isTaken) return; // Extra safety check

        // Show species detail card instead of immediately joining
        this.showSpeciesDetail(species);
      });

      this.speciesGrid.appendChild(speciesButton);
    });
  }

  private async loadChangelog(): Promise<void> {
    try {
      const response = await fetch("/CHANGELOG.md");
      if (!response.ok) {
        throw new Error("Failed to load changelog");
      }

      const markdown = await response.text();
      const html = this.parseMarkdown(markdown);
      this.changelogContent.innerHTML = html;
    } catch (error) {
      console.error("Error loading changelog:", error);
      this.changelogContent.innerHTML =
        '<p style="color: #ef4444;">Failed to load changelog.</p>';
    }
  }

  private parseMarkdown(markdown: string): string {
    // Simple markdown parser
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Horizontal rule
    html = html.replace(/^---$/gm, "<hr>");

    // Lists
    html = html.replace(/^\- (.*$)/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

    // Paragraphs (lines separated by blank lines)
    const lines = html.split("\n");
    const processed: string[] = [];
    let inList = false;
    let currentParagraph: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (
        line.startsWith("<h") ||
        line.startsWith("<hr") ||
        line.startsWith("<ul") ||
        line.startsWith("</ul")
      ) {
        // Flush current paragraph
        if (currentParagraph.length > 0) {
          processed.push("<p>" + currentParagraph.join(" ") + "</p>");
          currentParagraph = [];
        }
        processed.push(line);
        inList = line.startsWith("<ul");
        if (line.startsWith("</ul")) inList = false;
      } else if (line === "") {
        // Blank line - flush paragraph
        if (currentParagraph.length > 0 && !inList) {
          processed.push("<p>" + currentParagraph.join(" ") + "</p>");
          currentParagraph = [];
        } else if (line !== "" || currentParagraph.length > 0) {
          processed.push(line);
        }
      } else if (!line.startsWith("<li>") && !inList) {
        currentParagraph.push(line);
      } else {
        processed.push(line);
      }
    }

    // Flush remaining paragraph
    if (currentParagraph.length > 0) {
      processed.push("<p>" + currentParagraph.join(" ") + "</p>");
    }

    return processed.join("\n");
  }

  show(): void {
    this.authModal.classList.remove("hidden");
    this.showMainLobby();
  }

  requestInitialData(): void {
    // Request player game info - should be called after authentication
    if (this.requestPlayerGameInfo) {
      this.requestPlayerGameInfo();
    }
  }

  hide(): void {
    this.authModal.classList.add("hidden");
  }

  showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove("hidden");
  }

  clearError(): void {
    this.errorMessage.classList.add("hidden");
  }

  updateGameStatus(message: string): void {
    this.gameStatus.textContent = message;
    this.gameStatus.style.display = "block";
  }

  private showSpeciesDetail(species: Species): void {
    this.selectedSpecies = species;
    
    // Populate the detail card (same as HUD's displaySpeciesInfo)
    this.speciesDetailName.textContent = species.name;
    this.speciesDetailBodyType.textContent =
      species.appearance.bodyType.charAt(0).toUpperCase() +
      species.appearance.bodyType.slice(1);

    // Set appearance colors
    this.speciesDetailSkinColor.style.backgroundColor = species.appearance.skinColor;
    this.speciesDetailEyeColor.style.backgroundColor = species.appearance.eyeColor;

    // Set height and build
    this.speciesDetailHeight.textContent =
      species.appearance.height.charAt(0).toUpperCase() +
      species.appearance.height.slice(1);
    this.speciesDetailBuild.textContent =
      species.appearance.build.charAt(0).toUpperCase() +
      species.appearance.build.slice(1);

    // Set traits as badges
    this.speciesDetailTraits.innerHTML = "";
    species.traits.forEach((trait: string) => {
      const badge = document.createElement("span");
      badge.style.cssText =
        "display: inline-block; padding: 4px 10px; background: rgba(139, 92, 246, 0.2); border: 1px solid #8b5cf6; border-radius: 12px; font-size: 12px; color: #c4b5fd;";
      badge.textContent = trait
        .split("_")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      this.speciesDetailTraits.appendChild(badge);
    });

    // Set description
    this.speciesDetailDescription.textContent = species.description;
    
    // Update button text
    this.speciesDetailPlayButton.textContent = `Play as ${species.name}`;
    
    // Hide grid, show detail card
    const container = document.getElementById("species-selection-container")!;
    container.style.display = "none";
    this.speciesDetailCard.style.display = "block";
  }

  private hideSpeciesDetail(): void {
    this.selectedSpecies = null;
    
    // Show grid, hide detail card
    const container = document.getElementById("species-selection-container")!;
    container.style.display = "block";
    this.speciesDetailCard.style.display = "none";
  }

  private confirmSpeciesSelection(): void {
    if (!this.selectedSpecies) return;
    
    // Use species name as the player/civilization name
    const playerName = this.selectedSpecies.name;
    const speciesId = this.selectedSpecies.id;

    if (this.isCreatingNewGalaxy) {
      // Creating a new galaxy
      if (this.onCreateGalaxy) {
        this.onCreateGalaxy(playerName, speciesId);
      }
    } else if (this.selectedGalaxyId) {
      // Joining an existing galaxy
      if (this.onJoinGalaxy) {
        this.onJoinGalaxy(this.selectedGalaxyId, playerName, speciesId);
      }
    }
  }
}
