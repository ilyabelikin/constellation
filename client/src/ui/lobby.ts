/**
 * LobbyManager - Handles the lobby screen before game initialization
 * This keeps the lobby completely separate from the game logic
 */
export class LobbyManager {
  private authModal: HTMLElement;
  private playerNameInput: HTMLInputElement;
  private galaxyNameInput: HTMLInputElement;
  private exploreButton: HTMLElement;
  private resetButton: HTMLElement;
  private galaxyTimeDisplay: HTMLElement;
  private errorMessage: HTMLElement;

  // Callbacks
  public onExplore: ((galaxyName: string, playerName: string) => void) | null =
    null;
  public onReset: ((galaxyName: string, playerName: string) => void) | null =
    null;

  constructor() {
    this.authModal = document.getElementById("auth-modal")!;
    this.playerNameInput = document.getElementById(
      "player-name"
    ) as HTMLInputElement;
    this.galaxyNameInput = document.getElementById(
      "galaxy-name"
    ) as HTMLInputElement;
    this.exploreButton = document.getElementById("explore-galaxy")!;
    this.resetButton = document.getElementById("reset-galaxy")!;
    this.galaxyTimeDisplay = document.getElementById("galaxy-time-display")!;
    this.errorMessage = document.getElementById("error-message")!;

    // Load saved player name
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      this.playerNameInput.value = savedName;
    }

    // Save player name when changed
    this.playerNameInput.addEventListener("input", () => {
      localStorage.setItem("playerName", this.playerNameInput.value.trim());
    });

    // Setup button handlers
    this.exploreButton.addEventListener("click", () => {
      const galaxyName = this.galaxyNameInput.value.trim() || "the Milky Way";
      const playerName =
        this.playerNameInput.value.trim() || "Anonymous Explorer";

      if (this.onExplore) {
        this.onExplore(galaxyName, playerName);
      }
    });

    this.resetButton.addEventListener("click", () => {
      const galaxyName = this.galaxyNameInput.value.trim() || "the Milky Way";
      const playerName =
        this.playerNameInput.value.trim() || "Anonymous Explorer";

      if (this.onReset) {
        this.onReset(galaxyName, playerName);
      }
    });
  }

  show(): void {
    this.authModal.classList.remove("hidden");
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

  updateGalaxyTime(
    galaxyName: string,
    exists: boolean,
    currentTime: number
  ): void {
    if (!exists) {
      this.galaxyTimeDisplay.textContent = `New galaxy will be created`;
    } else {
      const days = Math.floor(currentTime / 86400);
      const hours = Math.floor((currentTime % 86400) / 3600);
      this.galaxyTimeDisplay.textContent = `Local time: ${days}d ${hours}h`;
    }
  }

  clearGalaxyTime(): void {
    this.galaxyTimeDisplay.textContent = "";
  }
}
