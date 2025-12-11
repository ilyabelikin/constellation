import { Species, SpeciesAppearance, SpeciesTrait } from "@constellation/shared";

/**
 * Pre-generated species for player selection at game start
 * These are fixed species with interesting traits and appearances
 */

export const PREGENERATED_SPECIES: Species[] = [
  {
    id: "species_humans",
    name: "Humans",
    homeworld: "Earth",
    homeworldId: "homeworld_humans",
    appearance: {
      bodyType: "humanoid",
      skinColor: "#d4a574",
      eyeColor: "#2d4a7c",
      height: "medium",
      build: "average",
    },
    traits: [
      SpeciesTrait.ADAPTIVE,
      SpeciesTrait.CURIOUS,
      SpeciesTrait.COOPERATIVE,
    ],
    description:
      "The Humans are ambitious bipedal beings with opposing thumbs and upright posture. They are quickly adapting to new environments and conditions, driven by an insatiable desire to explore and discover, naturally inclined toward diplomacy and cooperation.",
    createdAt: Date.now(),
  },
  {
    id: "species_astroids",
    name: "Astroids",
    homeworld: "Asteron",
    homeworldId: "homeworld_astroids",
    appearance: {
      bodyType: "insectoid",
      skinColor: "#9370db",
      eyeColor: "#00ffff",
      height: "tall",
      build: "massive",
    },
    traits: [
      SpeciesTrait.COOPERATIVE,
      SpeciesTrait.LONG_LIVED,
      SpeciesTrait.SCIENTIFIC,
    ],
    description:
      "The Astroids are ancient fungal-like colonial organisms forming insectoid structures. They are naturally inclined toward diplomacy and cooperation through their interconnected neural networks, with lifespans measuring in centuries, with an innate curiosity and talent for research.",
    createdAt: Date.now(),
  },
  {
    id: "species_delimurus",
    name: "Delimurus",
    homeworld: "Delim",
    homeworldId: "homeworld_delimurus",
    appearance: {
      bodyType: "reptilian",
      skinColor: "#4a7c59",
      eyeColor: "#ffd700",
      height: "medium",
      build: "stocky",
    },
    traits: [
      SpeciesTrait.EXTREMOPHILE,
      SpeciesTrait.LONG_LIVED,
      SpeciesTrait.INDUSTRIOUS,
    ],
    description:
      "The Delimurus are resilient cold-blooded beings with scaled skin and keen senses. They are capable of surviving in extreme temperatures and pressures, with lifespans measuring in centuries, with exceptional skill in manufacturing and construction.",
    createdAt: Date.now(),
  },
  {
    id: "species_byloongal",
    name: "Byloongal",
    homeworld: "Byloon",
    homeworldId: "homeworld_byloongal",
    appearance: {
      bodyType: "insectoid",
      skinColor: "#2d4a2d",
      eyeColor: "#ffd700",
      height: "short",
      build: "slender",
    },
    traits: [
      SpeciesTrait.RAPID_REPRODUCTION,
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.COOPERATIVE,
    ],
    description:
      "The Byloongal are industrious chitinous beings with multiple limbs and compound eyes. They are with accelerated population growth and short generation cycles, with exceptional skill in manufacturing and construction, naturally inclined toward diplomacy and cooperation.",
    createdAt: Date.now(),
  },
  {
    id: "species_tripodus",
    name: "Tripodus",
    homeworld: "Tripoda",
    homeworldId: "homeworld_tripodus",
    appearance: {
      bodyType: "avian",
      skinColor: "#4169e1",
      eyeColor: "#ffd700",
      height: "medium",
      build: "slender",
    },
    traits: [
      SpeciesTrait.CURIOUS,
      SpeciesTrait.EFFICIENT,
      SpeciesTrait.ADAPTIVE,
    ],
    description:
      "The Tripodus are enlightened feathered beings with hollow bones and keen eyesight. They are driven by an insatiable desire to explore and discover, with optimized energy utilization and conservation, quickly adapting to new environments and conditions.",
    createdAt: Date.now(),
  },
  {
    id: "species_heligans",
    name: "Heligans",
    homeworld: "Heliga",
    homeworldId: "homeworld_heligans",
    appearance: {
      bodyType: "gaseous",
      skinColor: "#4169e1",
      eyeColor: "#ffffff",
      height: "variable",
      build: "slender",
    },
    traits: [
      SpeciesTrait.EFFICIENT,
      SpeciesTrait.XENOPHILIC,
      SpeciesTrait.SCIENTIFIC,
    ],
    description:
      "The Heligans are mysterious non-corporeal beings existing as organized plasma clouds. They are with optimized energy utilization and conservation, eager to interact with and learn from other species, with an innate curiosity and talent for research.",
    createdAt: Date.now(),
  },
  {
    id: "species_mechanar",
    name: "Mechanar",
    homeworld: "Mechanus",
    homeworldId: "homeworld_mechanar",
    appearance: {
      bodyType: "mechanical",
      skinColor: "#808080",
      eyeColor: "#00ff00",
      height: "tall",
      build: "massive",
    },
    traits: [
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.EFFICIENT,
      SpeciesTrait.LONG_LIVED,
    ],
    description:
      "The Mechanar are advanced artificial beings of metal and circuitry. They are with exceptional skill in manufacturing and construction, with optimized energy utilization and conservation, with lifespans measuring in centuries.",
    createdAt: Date.now(),
  },
  {
    id: "species_aquarians",
    name: "Aquarians",
    homeworld: "Aquaria",
    homeworldId: "homeworld_aquarians",
    appearance: {
      bodyType: "aquatic",
      skinColor: "#20b2aa",
      eyeColor: "#4169e1",
      height: "medium",
      build: "average",
    },
    traits: [
      SpeciesTrait.AQUATIC,
      SpeciesTrait.ADAPTIVE,
      SpeciesTrait.PACIFIST,
    ],
    description:
      "The Aquarians are peaceful water-dwelling beings with gills and streamlined bodies. They are thriving in oceanic environments with advanced underwater adaptations, quickly adapting to new environments and conditions, philosophically opposed to violence and conflict.",
    createdAt: Date.now(),
  },
  {
    id: "species_zynthara",
    name: "Zynthara",
    homeworld: "Zynthos",
    homeworldId: "homeworld_zynthara",
    appearance: {
      bodyType: "humanoid",
      skinColor: "#a8d8ea",
      eyeColor: "#6b46c1",
      height: "tall",
      build: "slender",
    },
    traits: [
      SpeciesTrait.XENOPHILIC,
      SpeciesTrait.SCIENTIFIC,
      SpeciesTrait.CURIOUS,
    ],
    description:
      "The Zynthara are wise bipedal beings with opposing thumbs and upright posture. They are eager to interact with and learn from other species, with an innate curiosity and talent for research, driven by an insatiable desire to explore and discover.",
    createdAt: Date.now(),
  },
  {
    id: "species_draconids",
    name: "Draconids",
    homeworld: "Draconis",
    homeworldId: "homeworld_draconids",
    appearance: {
      bodyType: "reptilian",
      skinColor: "#8b7355",
      eyeColor: "#ff4500",
      height: "tall",
      build: "massive",
    },
    traits: [
      SpeciesTrait.LONG_LIVED,
      SpeciesTrait.AGGRESSIVE,
      SpeciesTrait.EXTREMOPHILE,
    ],
    description:
      "The Draconids are warlike reptile-like creatures with powerful tails and sharp claws. They are with lifespans measuring in centuries, with strong territorial and competitive instincts, capable of surviving in extreme temperatures and pressures.",
    createdAt: Date.now(),
  },
  {
    id: "species_luminari",
    name: "Luminari",
    homeworld: "Luminos",
    homeworldId: "homeworld_luminari",
    appearance: {
      bodyType: "humanoid",
      skinColor: "#e0e0e0",
      eyeColor: "#ffffff",
      height: "medium",
      build: "slender",
    },
    traits: [
      SpeciesTrait.PACIFIST,
      SpeciesTrait.PHOTOSYNTHETIC,
      SpeciesTrait.EFFICIENT,
    ],
    description:
      "The Luminari are enlightened plant-based humanoids with bioluminescent chloroplasts. They are philosophically opposed to violence and conflict, capable of converting starlight into energy through specialized organs, with optimized energy utilization and conservation.",
    createdAt: Date.now(),
  },
  {
    id: "species_kyrnathi",
    name: "Kyrnathi",
    homeworld: "Kyrna",
    homeworldId: "homeworld_kyrnathi",
    appearance: {
      bodyType: "insectoid",
      skinColor: "#4a2d1a",
      eyeColor: "#ff0000",
      height: "medium",
      build: "stocky",
    },
    traits: [
      SpeciesTrait.RAPID_REPRODUCTION,
      SpeciesTrait.XENOPHOBIC,
      SpeciesTrait.INDUSTRIOUS,
    ],
    description:
      "The Kyrnathi are stoic hive-minded beings with exoskeletons and antennae. They are with accelerated population growth and short generation cycles, distrustful of other species and protective of their own, with exceptional skill in manufacturing and construction.",
    createdAt: Date.now(),
  },
  {
    id: "species_phoenixborn",
    name: "Phoenixborn",
    homeworld: "Pyros",
    homeworldId: "homeworld_phoenixborn",
    appearance: {
      bodyType: "avian",
      skinColor: "#dc143c",
      eyeColor: "#ff4500",
      height: "tall",
      build: "average",
    },
    traits: [
      SpeciesTrait.EXTREMOPHILE,
      SpeciesTrait.ADAPTIVE,
      SpeciesTrait.CURIOUS,
    ],
    description:
      "The Phoenixborn are passionate bird-like creatures with wings and aerial adaptations. They are capable of surviving in extreme temperatures and pressures, quickly adapting to new environments and conditions, driven by an insatiable desire to explore and discover.",
    createdAt: Date.now(),
  },
  {
    id: "species_voidwhispers",
    name: "Voidwhispers",
    homeworld: "Void Prime",
    homeworldId: "homeworld_voidwhispers",
    appearance: {
      bodyType: "gaseous",
      skinColor: "#9370db",
      eyeColor: "#00ffff",
      height: "variable",
      build: "slender",
    },
    traits: [
      SpeciesTrait.SCIENTIFIC,
      SpeciesTrait.PACIFIST,
      SpeciesTrait.EFFICIENT,
    ],
    description:
      "The Voidwhispers are mysterious sentient atmospheric phenomena with quantum coherence. They are with an innate curiosity and talent for research, philosophically opposed to violence and conflict, with optimized energy utilization and conservation.",
    createdAt: Date.now(),
  },
  {
    id: "species_terrakin",
    name: "Terrakin",
    homeworld: "Terra Nova",
    homeworldId: "homeworld_terrakin",
    appearance: {
      bodyType: "humanoid",
      skinColor: "#8d5524",
      eyeColor: "#4a7c59",
      height: "short",
      build: "stocky",
    },
    traits: [
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.COOPERATIVE,
      SpeciesTrait.ADAPTIVE,
    ],
    description:
      "The Terrakin are industrious bipedal creatures with human-like features. They are with exceptional skill in manufacturing and construction, naturally inclined toward diplomacy and cooperation, quickly adapting to new environments and conditions.",
    createdAt: Date.now(),
  },
  {
    id: "species_cryophytes",
    name: "Cryophytes",
    homeworld: "Glacium",
    homeworldId: "homeworld_cryophytes",
    appearance: {
      bodyType: "insectoid",
      skinColor: "#b8860b",
      eyeColor: "#00ffff",
      height: "short",
      build: "massive",
    },
    traits: [
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.EXTREMOPHILE,
      SpeciesTrait.LONG_LIVED,
    ],
    description:
      "The Cryophytes are stoic ice-dwelling insectoids with antifreeze proteins in their blood. They are with exceptional skill in manufacturing and construction, capable of surviving in extreme temperatures and pressures, with lifespans measuring in centuries.",
    createdAt: Date.now(),
  },
  {
    id: "species_stellarborn",
    name: "Stellarborn",
    homeworld: "Stellaris",
    homeworldId: "homeworld_stellarborn",
    appearance: {
      bodyType: "gaseous",
      skinColor: "#ffd700",
      eyeColor: "#ffff00",
      height: "variable",
      build: "slender",
    },
    traits: [
      SpeciesTrait.PHOTOSYNTHETIC,
      SpeciesTrait.EFFICIENT,
      SpeciesTrait.XENOPHILIC,
    ],
    description:
      "The Stellarborn are noble electromagnetic entities that manifest in gas giant atmospheres. They are capable of converting starlight into energy through specialized organs, with optimized energy utilization and conservation, eager to interact with and learn from other species.",
    createdAt: Date.now(),
  },
  {
    id: "species_geodeans",
    name: "Geodeans",
    homeworld: "Geodia",
    homeworldId: "homeworld_geodeans",
    appearance: {
      bodyType: "reptilian",
      skinColor: "#6b8e23",
      eyeColor: "#32cd32",
      height: "short",
      build: "massive",
    },
    traits: [
      SpeciesTrait.EXTREMOPHILE,
      SpeciesTrait.INDUSTRIOUS,
      SpeciesTrait.PACIFIST,
    ],
    description:
      "The Geodeans are harmonious ancient-looking beings with armored scales. They are capable of surviving in extreme temperatures and pressures, with exceptional skill in manufacturing and construction, philosophically opposed to violence and conflict.",
    createdAt: Date.now(),
  },
];

/**
 * Get a species by ID from the pregenerated list
 */
export function getPregeneratedSpecies(speciesId: string): Species | undefined {
  return PREGENERATED_SPECIES.find((s) => s.id === speciesId);
}

/**
 * Get all pregenerated species
 */
export function getAllPregeneratedSpecies(): Species[] {
  return PREGENERATED_SPECIES;
}

