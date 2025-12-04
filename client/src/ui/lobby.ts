import { GAME_VERSION, VERSION_NAME } from "@constellation/shared";

/**
 * LobbyManager - Handles the redesigned lobby screen with Continue/New Game and changelog
 */
export class LobbyManager {
  private authModal: HTMLElement;
  private versionDisplay: HTMLElement;
  private playerNameInput: HTMLInputElement;
  private galaxyNameInput: HTMLInputElement;
  private continueButton: HTMLElement;
  private newGameButton: HTMLElement;
  private resetButton: HTMLElement;
  private gameStatus: HTMLElement;
  private errorMessage: HTMLElement;
  private changelogContent: HTMLElement;

  private hasExistingGame: boolean = false;

  // Callbacks
  public onContinue: ((galaxyName: string, playerName: string) => void) | null =
    null;
  public onNewGame: ((galaxyName: string, playerName: string) => void) | null =
    null;
  public onReset: ((galaxyName: string, playerName: string) => void) | null =
    null;

  constructor() {
    this.authModal = document.getElementById("auth-modal")!;
    this.versionDisplay = document.getElementById("version-display")!;
    this.playerNameInput = document.getElementById(
      "player-name"
    ) as HTMLInputElement;
    this.galaxyNameInput = document.getElementById(
      "galaxy-name"
    ) as HTMLInputElement;
    this.continueButton = document.getElementById("continue-game")!;
    this.newGameButton = document.getElementById("new-game")!;
    this.resetButton = document.getElementById("reset-galaxy")!;
    this.gameStatus = document.getElementById("game-status")!;
    this.errorMessage = document.getElementById("error-message")!;
    this.changelogContent = document.getElementById("changelog-content")!;

    // Set version
    this.versionDisplay.textContent = `v${GAME_VERSION} - ${VERSION_NAME}`;

    // Load saved player name
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      this.playerNameInput.value = savedName;
    }

    // Save player name when changed
    this.playerNameInput.addEventListener("input", () => {
      localStorage.setItem("playerName", this.playerNameInput.value.trim());
    });

    // Check if there's an existing game
    this.checkForExistingGame();

    // Setup button handlers
    this.continueButton.addEventListener("click", () => {
      const galaxyName = this.galaxyNameInput.value.trim() || "the Milky Way";
      const playerName =
        this.playerNameInput.value.trim() || "Anonymous Explorer";

      if (this.onContinue) {
        this.onContinue(galaxyName, playerName);
      }
    });

    this.newGameButton.addEventListener("click", () => {
      const galaxyName = this.galaxyNameInput.value.trim() || "the Milky Way";
      const playerName =
        this.playerNameInput.value.trim() || "Anonymous Explorer";

      if (this.onNewGame) {
        this.onNewGame(galaxyName, playerName);
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

    // Load changelog
    this.loadChangelog();
  }

  private checkForExistingGame(): void {
    // Check if player has UUID saved (indicates existing game)
    const uuid = localStorage.getItem("constellation-uuid");
    this.hasExistingGame = !!uuid;

    if (this.hasExistingGame) {
      // Show Continue button, hide New Game
      this.continueButton.style.display = "block";
      this.newGameButton.style.display = "none";

      // Show reset button in debug mode
      const urlParams = new URLSearchParams(window.location.search);
      const isDebugMode = urlParams.has("debug_mode");
      
      if (isDebugMode) {
        this.resetButton.style.display = "block";
        this.gameStatus.textContent =
          "Existing game found. Continue your adventure or reset to start fresh.";
      } else {
        this.gameStatus.textContent =
          "Existing game found. Continue your adventure.";
      }

      this.gameStatus.style.display = "block";
    } else {
      // Show New Game button, hide Continue
      this.continueButton.style.display = "none";
      this.newGameButton.style.display = "block";
      this.resetButton.style.display = "none";

      this.gameStatus.textContent =
        "Welcome, explorer! Ready to embark on your interstellar journey?";
      this.gameStatus.style.display = "block";
    }
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
    this.checkForExistingGame(); // Re-check when showing
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
}
