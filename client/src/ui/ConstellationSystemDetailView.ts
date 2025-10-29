import { ConstellationNode } from "@constellation/shared";

/**
 * Manages the constellation system detail panel (for constellation view)
 */
export class ConstellationSystemDetailView {
  private panel: HTMLElement;
  private nameElement: HTMLElement;
  private starTypeElement: HTMLElement;
  private starMassElement: HTMLElement;
  private jumpsElement: HTMLElement;
  private planetsElement: HTMLElement;
  private gatesElement: HTMLElement;

  constructor() {
    this.panel = document.getElementById("constellation-system-panel")!;
    this.nameElement = document.getElementById("constellation-system-name")!;
    this.starTypeElement = document.getElementById("constellation-star-type")!;
    this.starMassElement = document.getElementById("constellation-star-mass")!;
    this.jumpsElement = document.getElementById("constellation-jumps")!;
    this.planetsElement = document.getElementById("constellation-planets")!;
    this.gatesElement = document.getElementById("constellation-gates")!;
  }

  /**
   * Show constellation system details
   */
  show(node: ConstellationNode): void {
    this.panel.classList.remove("hidden");

    this.nameElement.textContent = node.systemName;
    this.starTypeElement.textContent = node.starType;
    this.starMassElement.textContent = `${node.starMass.toFixed(
      2
    )} solar masses`;

    // Show jumps from home
    if (node.jumpsFromHome === 0) {
      this.jumpsElement.textContent = "Home";
    } else if (node.jumpsFromHome === -1) {
      this.jumpsElement.textContent = "Unreachable";
    } else {
      this.jumpsElement.textContent = `${node.jumpsFromHome}`;
    }

    this.planetsElement.textContent = `${node.planetCount}`;
    this.gatesElement.textContent = `${node.exploredGates}/${node.totalGates}`;
  }

  /**
   * Hide the detail panel
   */
  hide(): void {
    this.panel.classList.add("hidden");
  }
}
