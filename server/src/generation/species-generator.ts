import {
  Species,
  SpeciesAppearance,
  SpeciesTrait,
  SpeciesTraitType,
} from "@constellation/shared";
import { SeededRandom } from "./random.js";

// Species name prefixes and suffixes for variety
const NAME_PREFIXES = [
  "Astra",
  "Xeno",
  "Nebu",
  "Cosmo",
  "Stellar",
  "Quantum",
  "Chrono",
  "Neo",
  "Proto",
  "Arcto",
  "Hydro",
  "Pyro",
  "Cryo",
  "Electro",
  "Terran",
  "Jovian",
  "Solar",
  "Lunar",
  "Void",
  "Astral",
];

const NAME_SUFFIXES = [
  "ans",
  "ids",
  "ites",
  "oids",
  "ians",
  "ari",
  "ini",
  "oni",
  "ese",
  "kin",
  "folk",
  "born",
  "spawn",
  "brood",
  "kind",
];

// Descriptive adjectives for species
const ADJECTIVES = [
  "Ancient",
  "Enlightened",
  "Mysterious",
  "Noble",
  "Wise",
  "Ancient",
  "Peaceful",
  "Warlike",
  "Industrious",
  "Scientific",
  "Spiritual",
  "Adaptive",
  "Resilient",
  "Evolved",
  "Advanced",
  "Primitive",
  "Harmonious",
  "Ambitious",
  "Curious",
  "Stoic",
  "Passionate",
];

// Body type descriptions
const BODY_DESCRIPTIONS: Record<string, string[]> = {
  humanoid: [
    "bipedal beings with opposing thumbs and upright posture",
    "bipedal creatures with human-like features",
    "two-armed, two-legged beings with complex tool-using appendages",
  ],
  insectoid: [
    "chitinous beings with multiple limbs and compound eyes",
    "arthropod-like creatures with segmented bodies",
    "hive-minded beings with exoskeletons and antennae",
  ],
  reptilian: [
    "cold-blooded beings with scaled skin and keen senses",
    "reptile-like creatures with powerful tails and sharp claws",
    "ancient-looking beings with armored scales",
  ],
  avian: [
    "feathered beings with hollow bones and keen eyesight",
    "bird-like creatures with wings and aerial adaptations",
    "lightweight beings with sharp beaks and talons",
  ],
  aquatic: [
    "water-dwelling beings with gills and streamlined bodies",
    "amphibious creatures adapted for aquatic life",
    "deep-sea dwellers with bioluminescent features",
  ],
  crystalline: [
    "silicon-based lifeforms with geometric structures",
    "mineral beings that resonate with electromagnetic frequencies",
    "living crystal formations with photonic nervous systems",
  ],
  gaseous: [
    "non-corporeal beings existing as organized plasma clouds",
    "electromagnetic entities that manifest in gas giant atmospheres",
    "sentient atmospheric phenomena with quantum coherence",
  ],
  mechanical: [
    "artificial beings of metal and circuitry",
    "self-replicating mechanical constructs with emergent consciousness",
    "synthetic lifeforms created by a long-extinct organic species",
  ],
};

// Trait spectrums - opposite traits that cannot coexist
// Each array represents a spectrum where only ONE trait can be selected
const TRAIT_SPECTRUMS: SpeciesTraitType[][] = [
  // Attitude toward other species
  [SpeciesTrait.XENOPHOBIC, SpeciesTrait.XENOPHILIC],
  // Military/conflict stance
  [SpeciesTrait.AGGRESSIVE, SpeciesTrait.PACIFIST],
  // Lifespan (opposite ends of a spectrum)
  [SpeciesTrait.LONG_LIVED, SpeciesTrait.RAPID_REPRODUCTION],
];

// Helper function to check if two traits are on the same spectrum
function areTraitsOnSameSpectrum(
  trait1: SpeciesTraitType,
  trait2: SpeciesTraitType
): boolean {
  return TRAIT_SPECTRUMS.some(
    (spectrum) => spectrum.includes(trait1) && spectrum.includes(trait2)
  );
}

// Trait descriptions and effects
const TRAIT_DESCRIPTIONS: Record<SpeciesTraitType, string> = {
  [SpeciesTrait.PHOTOSYNTHETIC]:
    "capable of converting starlight into energy through specialized organs",
  [SpeciesTrait.AQUATIC]:
    "thriving in oceanic environments with advanced underwater adaptations",
  [SpeciesTrait.SILICON_BASED]: "based on silicon chemistry rather than carbon",
  [SpeciesTrait.EXTREMOPHILE]:
    "capable of surviving in extreme temperatures and pressures",
  [SpeciesTrait.LONG_LIVED]: "with lifespans measuring in centuries",
  [SpeciesTrait.RAPID_REPRODUCTION]:
    "with accelerated population growth and short generation cycles",
  [SpeciesTrait.SCIENTIFIC]: "with an innate curiosity and talent for research",
  [SpeciesTrait.INDUSTRIOUS]:
    "with exceptional skill in manufacturing and construction",
  [SpeciesTrait.EFFICIENT]:
    "with optimized energy utilization and conservation",
  [SpeciesTrait.ADAPTIVE]:
    "quickly adapting to new environments and conditions",
  [SpeciesTrait.CURIOUS]:
    "driven by an insatiable desire to explore and discover",
  [SpeciesTrait.COOPERATIVE]:
    "naturally inclined toward diplomacy and cooperation",
  [SpeciesTrait.AGGRESSIVE]:
    "with strong territorial and competitive instincts",
  [SpeciesTrait.PACIFIST]: "philosophically opposed to violence and conflict",
  [SpeciesTrait.XENOPHOBIC]:
    "distrustful of other species and protective of their own",
  [SpeciesTrait.XENOPHILIC]:
    "eager to interact with and learn from other species",
};

// Generate skin/surface colors based on body type
function generateColors(
  random: SeededRandom,
  bodyType: string
): { skinColor: string; eyeColor: string } {
  const colorPalettes: Record<string, { skin: string[]; eyes: string[] }> = {
    humanoid: {
      skin: ["#f4c4a0", "#d4a574", "#8d5524", "#4a2c18", "#a8d8ea", "#c4b5fd"],
      eyes: ["#2d4a7c", "#4a7c59", "#7c4a2d", "#6b46c1", "#dc2626", "#059669"],
    },
    insectoid: {
      skin: ["#2d4a2d", "#4a2d1a", "#8b4513", "#2f4f2f", "#556b2f"],
      eyes: ["#ff0000", "#ffd700", "#00ff00", "#ffffff", "#ff6347"],
    },
    reptilian: {
      skin: ["#4a7c59", "#2d4a2d", "#8b7355", "#556b2f", "#6b8e23"],
      eyes: ["#ffd700", "#ff4500", "#32cd32", "#ff8c00", "#ffff00"],
    },
    avian: {
      skin: ["#4169e1", "#dc143c", "#ffd700", "#32cd32", "#ff69b4", "#00ced1"],
      eyes: ["#000000", "#ffd700", "#ff4500", "#4169e1"],
    },
    aquatic: {
      skin: ["#00ced1", "#20b2aa", "#5f9ea0", "#4682b4", "#6495ed"],
      eyes: ["#000000", "#4169e1", "#00ff00", "#ff1493"],
    },
    crystalline: {
      skin: ["#e0e0e0", "#b8860b", "#4169e1", "#9370db", "#ff1493"],
      eyes: ["#ffffff", "#00ffff", "#ff00ff", "#ffff00"],
    },
    gaseous: {
      skin: ["#9370db", "#4169e1", "#00ced1", "#ff69b4", "#ffd700"],
      eyes: ["#ffffff", "#ffff00", "#00ffff"],
    },
    mechanical: {
      skin: ["#808080", "#c0c0c0", "#696969", "#a9a9a9", "#2f4f4f"],
      eyes: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff"],
    },
  };

  const palette = colorPalettes[bodyType] || colorPalettes.humanoid;
  return {
    skinColor: random.choice(palette.skin),
    eyeColor: random.choice(palette.eyes),
  };
}

// Generate species traits based on body type and habitability
function generateTraits(
  random: SeededRandom,
  bodyType: string,
  planetType?: string
): SpeciesTraitType[] {
  const traits: SpeciesTraitType[] = [];
  const numTraits = random.nextInt(2, 5); // 2-4 traits

  // Body type influences certain traits
  const bodyTypeTraits: Record<string, SpeciesTraitType[]> = {
    humanoid: [
      SpeciesTrait.ADAPTIVE,
      SpeciesTrait.COOPERATIVE,
      SpeciesTrait.CURIOUS,
    ],
    insectoid: [
      SpeciesTrait.RAPID_REPRODUCTION,
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.COOPERATIVE,
    ],
    reptilian: [
      SpeciesTrait.LONG_LIVED,
      SpeciesTrait.EXTREMOPHILE,
      SpeciesTrait.AGGRESSIVE,
    ],
    avian: [
      SpeciesTrait.CURIOUS,
      SpeciesTrait.ADAPTIVE,
      SpeciesTrait.EFFICIENT,
    ],
    aquatic: [
      SpeciesTrait.AQUATIC,
      SpeciesTrait.ADAPTIVE,
      SpeciesTrait.PACIFIST,
    ],
    crystalline: [
      SpeciesTrait.SILICON_BASED,
      SpeciesTrait.LONG_LIVED,
      SpeciesTrait.SCIENTIFIC,
    ],
    gaseous: [
      SpeciesTrait.EFFICIENT,
      SpeciesTrait.XENOPHILIC,
      SpeciesTrait.SCIENTIFIC,
    ],
    mechanical: [
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.EFFICIENT,
      SpeciesTrait.LONG_LIVED,
    ],
  };

  // Planet type influences traits
  const planetTypeTraits: Record<string, SpeciesTraitType[]> = {
    oceanic: [SpeciesTrait.AQUATIC],
    desert: [SpeciesTrait.EXTREMOPHILE],
    icy: [SpeciesTrait.EXTREMOPHILE],
    volcanic: [SpeciesTrait.EXTREMOPHILE],
    terrestrial: [SpeciesTrait.ADAPTIVE],
  };

  // Helper function to check if a trait can be added (no conflicts with existing traits)
  const canAddTrait = (trait: SpeciesTraitType): boolean => {
    if (traits.includes(trait)) {
      return false; // Already have this trait
    }
    // Check if any existing trait is on the same spectrum
    for (const existingTrait of traits) {
      if (areTraitsOnSameSpectrum(trait, existingTrait)) {
        return false; // Conflict detected
      }
    }
    return true;
  };

  // Add likely traits based on body type
  const likelyTraits = bodyTypeTraits[bodyType] || [];
  for (const trait of likelyTraits) {
    if (random.next() < 0.4 && traits.length < numTraits && canAddTrait(trait)) {
      // 40% chance for each likely trait
      traits.push(trait);
    }
  }

  // Add planet-specific traits
  if (planetType && planetTypeTraits[planetType]) {
    for (const trait of planetTypeTraits[planetType]) {
      if (
        random.next() < 0.6 &&
        traits.length < numTraits &&
        canAddTrait(trait)
      ) {
        traits.push(trait);
      }
    }
  }

  // Fill remaining slots with random traits
  const allTraits = Object.values(SpeciesTrait);
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  while (traits.length < numTraits && attempts < maxAttempts) {
    const randomTrait = random.choice(allTraits);
    if (canAddTrait(randomTrait)) {
      traits.push(randomTrait);
    }
    attempts++;
  }

  return traits;
}

// Generate species appearance
function generateAppearance(
  random: SeededRandom,
  planetType?: string
): SpeciesAppearance {
  // Body type influenced by planet type
  let bodyTypes: SpeciesAppearance["bodyType"][] = [
    "humanoid",
    "insectoid",
    "reptilian",
    "avian",
    "aquatic",
    "crystalline",
    "gaseous",
    "mechanical",
  ];

  if (planetType === "oceanic") {
    bodyTypes = ["aquatic", "aquatic", "humanoid", "insectoid"]; // More likely aquatic
  } else if (planetType === "desert" || planetType === "barren") {
    bodyTypes = ["reptilian", "reptilian", "insectoid", "crystalline"];
  } else if (planetType === "gas_giant" || planetType === "ice_giant") {
    bodyTypes = ["gaseous", "gaseous", "crystalline"];
  }

  const bodyType = random.choice(bodyTypes);
  const colors = generateColors(random, bodyType);

  return {
    bodyType,
    skinColor: colors.skinColor,
    eyeColor: colors.eyeColor,
    height: random.choice(["short", "medium", "tall", "variable"] as const),
    build: random.choice(["slender", "average", "stocky", "massive"] as const),
  };
}

// Generate species name
function generateSpeciesName(random: SeededRandom): string {
  const prefix = random.choice(NAME_PREFIXES);
  const suffix = random.choice(NAME_SUFFIXES);
  return prefix + suffix;
}

// Generate species description
function generateDescription(
  speciesName: string,
  homeworldName: string,
  appearance: SpeciesAppearance,
  traits: SpeciesTraitType[],
  random: SeededRandom
): string {
  const adjective = random.choice(ADJECTIVES);
  const bodyDesc = random.choice(BODY_DESCRIPTIONS[appearance.bodyType]);

  let description = `The ${speciesName} are ${adjective.toLowerCase()} ${bodyDesc} from the world of ${homeworldName}. `;

  // Add trait descriptions
  if (traits.length > 0) {
    description += "They are ";
    const traitDescs = traits
      .slice(0, 3)
      .map((trait) => TRAIT_DESCRIPTIONS[trait]);
    description += traitDescs.join(", ");
    description += ".";
  }

  return description;
}

// Main species generator function
export function generateSpecies(
  speciesId: string,
  homeworldName: string,
  homeworldId: string,
  planetType: string | undefined,
  seed: number,
  playerId?: string
): Species {
  const random = new SeededRandom(seed);

  const name = generateSpeciesName(random);
  const appearance = generateAppearance(random, planetType);
  const traits = generateTraits(random, appearance.bodyType, planetType);
  const description = generateDescription(
    name,
    homeworldName,
    appearance,
    traits,
    random
  );

  return {
    id: speciesId,
    name,
    homeworld: homeworldName,
    homeworldId,
    appearance,
    traits,
    description,
    createdAt: Date.now(),
    playerId,
  };
}

// Generate a species for a native civilization (non-player)
export function generateNativeSpecies(
  planetName: string,
  planetId: string,
  planetType: string | undefined,
  systemSeed: number
): Species {
  const speciesId = `species_${planetId}`;
  const seed = systemSeed ^ parseInt(planetId.replace(/\D/g, "0"), 10);
  return generateSpecies(speciesId, planetName, planetId, planetType, seed);
}

// Generate a species for a player's homeworld
export function generatePlayerSpecies(
  playerId: string,
  playerName: string,
  homeworldName: string,
  homeworldId: string,
  planetType: string | undefined
): Species {
  const speciesId = `species_player_${playerId}`;

  // Generate a proper seed from the playerId using a simple hash function
  // This ensures different playerIds produce different seeds
  let seed = 0;
  for (let i = 0; i < playerId.length; i++) {
    seed = ((seed << 5) - seed + playerId.charCodeAt(i)) | 0;
  }
  // Make sure the seed is positive
  seed = Math.abs(seed);

  return generateSpecies(
    speciesId,
    homeworldName,
    homeworldId,
    planetType,
    seed,
    playerId
  );
}
