import {
  SystemState,
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
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
  private compositionElement: HTMLElement | null;
  private shapeElement: HTMLElement | null;

  constructor() {
    this.panel = document.getElementById("body-details-panel")!;
    this.nameElement = document.getElementById("body-detail-name")!;
    this.typeElement = document.getElementById("body-detail-type")!;
    this.massElement = document.getElementById("body-detail-mass")!;
    this.radiusElement = document.getElementById("body-detail-radius")!;
    this.distanceElement = document.getElementById("body-detail-distance")!;
    this.velocityElement = document.getElementById("body-detail-velocity")!;
    this.compositionElement = document.getElementById(
      "body-detail-composition"
    );
    this.shapeElement = document.getElementById("body-detail-shape");
  }

  /**
   * Show the celestial body detail panel with the given information
   */
  show(body: any, bodyState: any, currentState: SystemState): void {
    this.panel.classList.remove("hidden");

    this.nameElement.textContent = body.name;
    this.typeElement.textContent = body.planetType || body.type;
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
  }

  /**
   * Hide the detail panel
   */
  hide(): void {
    this.panel.classList.add("hidden");
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
}
