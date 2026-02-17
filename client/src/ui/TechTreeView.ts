import { TECHNOLOGIES } from "@constellation/shared";
import { setButtonLoading, clearButtonLoading } from "./ButtonLoadingState.js";

export class TechTreeView {
  private container: HTMLElement;
  private completedTechs: Set<string> = new Set();
  private currentResearch: {
    technologyId: string;
    status: "in_progress" | "paused";
    progressDays: number;
    scienceInvested: number;
    scienceNeeded: number;
    daysNeeded: number;
  } | null = null;

  // Progress UI elements for real-time updates
  private progressBar: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private scienceText: HTMLElement | null = null;
  private pauseResumeButton: HTMLButtonElement | null = null;
  private pendingResearchTechId: string | null = null;

  // Callbacks
  public onStartResearch: ((technologyId: string) => void) | null = null;
  public onPauseResearch: ((technologyId: string) => void) | null = null;
  public onResumeResearch: ((technologyId: string) => void) | null = null;
  public onClose: (() => void) | null = null;

  constructor() {
    // Create the tech tree container
    this.container = document.createElement("div");
    this.container.id = "tech-tree-view";
    this.container.className = "tech-tree-view hidden";
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    document.body.appendChild(this.container);
  }

  public show(
    completedTechs: string[],
    currentResearch: {
      technologyId: string;
      status: "in_progress" | "paused";
      progressDays: number;
      scienceInvested: number;
      scienceNeeded: number;
      daysNeeded: number;
    } | null
  ): void {
    this.completedTechs = new Set(completedTechs);
    this.currentResearch = currentResearch;
    // Clear any pending loading states when the view is refreshed
    this.pendingResearchTechId = null;
    clearButtonLoading(this.pauseResumeButton);

    this.container.classList.remove("hidden");
    this.container.style.display = "flex";
    this.render();
  }

  public hide(): void {
    this.container.classList.add("hidden");
    this.container.style.display = "none";
    // Clear progress element references
    this.progressBar = null;
    this.progressText = null;
    this.scienceText = null;
    this.pauseResumeButton = null;
    this.pendingResearchTechId = null;
  }

  public isVisible(): boolean {
    return !this.container.classList.contains("hidden");
  }

  // Update progress display in real-time (called every frame when modal is visible)
  public updateProgressDisplay(progressDays: number, scienceInvested: number): void {
    if (!this.currentResearch || !this.progressBar || !this.progressText || !this.scienceText) {
      return;
    }

    const progressPercent = Math.min(99.9, (progressDays / this.currentResearch.daysNeeded) * 100);
    
    // Update progress bar width
    this.progressBar.style.width = `${progressPercent}%`;
    
    // Update progress text
    this.progressText.textContent = `Progress: ${progressDays.toFixed(1)}/${this.currentResearch.daysNeeded} days (${progressPercent.toFixed(1)}%)`;
    
    // Update science text
    this.scienceText.textContent = `Science: ${scienceInvested.toFixed(1)}/${this.currentResearch.scienceNeeded}`;
  }

  private render(): void {
    this.container.innerHTML = "";

    // Create content container
    const content = document.createElement("div");
    content.style.cssText = `
      background: rgba(20, 20, 30, 0.95);
      border: 2px solid var(--primary-color);
      border-radius: 12px;
      padding: 30px;
      max-width: 800px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 0 30px rgba(0, 255, 150, 0.3);
    `;

    // Title
    const title = document.createElement("div");
    title.style.cssText = `
      font-size: 28px;
      font-weight: bold;
      color: var(--primary-color);
      margin-bottom: 20px;
      text-align: center;
    `;
    title.textContent = "Technology Research";
    content.appendChild(title);

    // Current research section
    if (this.currentResearch) {
      const currentSection = this.createCurrentResearchSection();
      content.appendChild(currentSection);
    }

    // Available technologies
    const techList = document.createElement("div");
    techList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 15px;
      margin-top: 20px;
    `;

    for (const [techId, tech] of Object.entries(TECHNOLOGIES)) {
      const techCard = this.createTechCard(techId, tech);
      techList.appendChild(techCard);
    }

    content.appendChild(techList);

    // Close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.cssText = `
      margin-top: 20px;
      padding: 10px 20px;
      background: var(--primary-color);
      color: #000;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
      display: block;
      margin-left: auto;
      margin-right: auto;
    `;
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "var(--primary-color-dim)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "var(--primary-color)";
    });
    closeButton.addEventListener("click", () => {
      this.hide();
      if (this.onClose) {
        this.onClose();
      }
    });
    content.appendChild(closeButton);

    this.container.appendChild(content);

    // Close on background click
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) {
        this.hide();
        if (this.onClose) {
          this.onClose();
        }
      }
    });
  }

  private createCurrentResearchSection(): HTMLElement {
    if (!this.currentResearch) {
      return document.createElement("div");
    }

    const tech = TECHNOLOGIES[this.currentResearch.technologyId];
    if (!tech) {
      return document.createElement("div");
    }

    const sectionIsPaused = this.currentResearch.status === "paused";
    const section = document.createElement("div");
    section.style.cssText = `
      background: ${sectionIsPaused ? "rgba(245, 158, 11, 0.1)" : "rgba(100, 100, 150, 0.2)"};
      border: 2px solid ${sectionIsPaused ? "#f59e0b" : "var(--primary-color)"};
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    `;

    const researchIsPaused = this.currentResearch.status === "paused";
    const header = document.createElement("div");
    header.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: ${researchIsPaused ? "#f59e0b" : "var(--primary-color)"};
      margin-bottom: 10px;
    `;
    header.textContent = researchIsPaused
      ? "Current Research: " + tech.name + " (PAUSED)"
      : "Current Research: " + tech.name;
    section.appendChild(header);

    // Progress bar
    const progressPercent =
      (this.currentResearch.progressDays / this.currentResearch.daysNeeded) *
      100;
    const progressContainer = document.createElement("div");
    progressContainer.style.cssText = `
      width: 100%;
      height: 20px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 10px;
    `;

    const isPaused = this.currentResearch.status === "paused";
    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
      width: ${progressPercent}%;
      height: 100%;
      background: ${isPaused ? "#f59e0b" : "var(--primary-color)"};
      transition: width 0.3s;
      ${isPaused ? "animation: tech-paused-pulse 2s ease-in-out infinite;" : ""}
    `;
    progressContainer.appendChild(progressBar);
    section.appendChild(progressContainer);

    // Store reference for real-time updates
    this.progressBar = progressBar;

    // Progress text
    const progressText = document.createElement("div");
    progressText.style.cssText = `
      color: #e2e8f0;
      font-size: 14px;
      margin-bottom: 10px;
    `;
    progressText.textContent = `Progress: ${this.currentResearch.progressDays.toFixed(
      1
    )}/${this.currentResearch.daysNeeded} days (${progressPercent.toFixed(1)}%)`;
    section.appendChild(progressText);

    // Store reference for real-time updates
    this.progressText = progressText;

    // Science invested
    const scienceText = document.createElement("div");
    scienceText.style.cssText = `
      color: #a5b4fc;
      font-size: 14px;
      margin-bottom: 15px;
    `;
    scienceText.textContent = `Science: ${this.currentResearch.scienceInvested.toFixed(
      1
    )}/${this.currentResearch.scienceNeeded}`;
    section.appendChild(scienceText);

    // Store reference for real-time updates
    this.scienceText = scienceText;

    // Pause/Resume button
    const button = document.createElement("button") as HTMLButtonElement;
    if (this.currentResearch.status === "in_progress") {
      button.textContent = "Pause Research";
      button.addEventListener("click", () => {
        if (this.onPauseResearch && this.currentResearch) {
          setButtonLoading(button, "Pausing...");
          this.onPauseResearch(this.currentResearch.technologyId);
        }
      });
    } else {
      button.textContent = "Resume Research";
      button.addEventListener("click", () => {
        if (this.onResumeResearch && this.currentResearch) {
          setButtonLoading(button, "Resuming...");
          this.onResumeResearch(this.currentResearch.technologyId);
        }
      });
    }
    button.style.cssText = `
      padding: 8px 16px;
      background: var(--primary-color);
      color: #000;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    `;
    button.addEventListener("mouseenter", () => {
      if (!button.disabled) {
        button.style.background = "var(--primary-color-dim)";
      }
    });
    button.addEventListener("mouseleave", () => {
      if (!button.disabled) {
        button.style.background = "var(--primary-color)";
      }
    });
    section.appendChild(button);
    this.pauseResumeButton = button;

    return section;
  }

  private createTechCard(techId: string, tech: any): HTMLElement {
    const isCompleted = this.completedTechs.has(techId);
    const isCurrentResearch = this.currentResearch?.technologyId === techId;

    const card = document.createElement("div");
    card.style.cssText = `
      background: ${
        isCompleted
          ? "rgba(100, 200, 100, 0.2)"
          : isCurrentResearch
          ? "rgba(100, 100, 150, 0.2)"
          : "rgba(50, 50, 70, 0.3)"
      };
      border: 2px solid ${
        isCompleted
          ? "#10b981"
          : isCurrentResearch
          ? "var(--primary-color)"
          : "rgba(148, 163, 184, 0.3)"
      };
      border-radius: 8px;
      padding: 15px;
      transition: all 0.2s;
    `;

    if (!isCompleted && !isCurrentResearch) {
      card.style.cursor = "pointer";
      card.addEventListener("mouseenter", () => {
        if (this.pendingResearchTechId !== techId) {
          card.style.background = "rgba(70, 70, 90, 0.4)";
          card.style.borderColor = "var(--primary-color)";
        }
      });
      card.addEventListener("mouseleave", () => {
        if (this.pendingResearchTechId !== techId) {
          card.style.background = "rgba(50, 50, 70, 0.3)";
          card.style.borderColor = "rgba(148, 163, 184, 0.3)";
        }
      });
      card.addEventListener("click", () => {
        if (this.onStartResearch && !this.pendingResearchTechId) {
          // Show loading state on the card
          this.pendingResearchTechId = techId;
          card.style.opacity = "0.7";
          card.style.cursor = "wait";
          // Add a loading indicator to the hint area
          const hint = card.querySelector('div[style*="font-style: italic"]');
          if (hint) {
            hint.innerHTML = '<span class="spinner"></span> Starting research...';
          }
          this.onStartResearch(techId);
        }
      });
    }

    // Tech name
    const name = document.createElement("div");
    name.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: ${
        isCompleted
          ? "#10b981"
          : isCurrentResearch
          ? "var(--primary-color)"
          : "#e2e8f0"
      };
      margin-bottom: 8px;
    `;
    name.textContent = tech.name + (isCompleted ? " ✓" : "");
    card.appendChild(name);

    // Description
    const description = document.createElement("div");
    description.style.cssText = `
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 10px;
      line-height: 1.4;
    `;
    description.textContent = tech.description;
    card.appendChild(description);

    // Cost
    const cost = document.createElement("div");
    cost.style.cssText = `
      color: #a5b4fc;
      font-size: 14px;
      font-weight: bold;
    `;
    cost.textContent = `Cost: ${tech.scienceCost} Science | Time: ${tech.researchDays} days`;
    card.appendChild(cost);

    // Status text
    if (isCurrentResearch) {
      const isResearchPaused = this.currentResearch?.status === "paused";
      const status = document.createElement("div");
      status.style.cssText = `
        color: ${isResearchPaused ? "#f59e0b" : "var(--primary-color)"};
        font-size: 14px;
        font-weight: bold;
        margin-top: 10px;
      `;
      status.textContent = isResearchPaused
        ? "⏸ Paused - No Science"
        : "⚗ Researching...";
      card.appendChild(status);
    } else if (!isCompleted) {
      const hint = document.createElement("div");
      hint.style.cssText = `
        color: #64748b;
        font-size: 12px;
        margin-top: 10px;
        font-style: italic;
      `;
      hint.textContent = "Click to start research";
      card.appendChild(hint);
    }

    return card;
  }

  public dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

