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

// Generate skin/surface color descriptions based on body type
function generateColors(
  random: SeededRandom,
  bodyType: string
): { skinColor: string; eyeColor: string } {
  const colorDescriptions: Record<string, { skin: string[]; eyes: string[] }> = {
    humanoid: {
      skin: [
        "Ranging from pale ivory to deep ebony, with brown, tan, and olive tones across populations",
        "Skin tones from light beige to dark brown, with peachy, olive, and bronze undertones",
        "Diverse complexions from alabaster to mahogany, encompassing all shades of brown and tan",
        "Light blue to azure skin with silver undertones, showing regional variations",
        "Pale lavender to deep purple skin tones with subtle iridescent qualities",
      ],
      eyes: [
        "Brown eyes are most common, with blue, green, hazel, and amber widespread in populations",
        "Eye colors ranging from dark brown to light blue, with green and hazel also frequent",
        "Deep purple and violet eyes dominate, with amethyst and indigo variations present",
        "Blue and green eyes are characteristic, though brown, gray, and hazel also occur",
        "Red and amber eyes are most common, with golden and orange hues also appearing",
      ],
    },
    insectoid: {
      skin: [
        "Chitinous exoskeletons in dark green to black, with brown and gray variations across hives",
        "Dark brown to black carapaces, with regional populations showing reddish or mahogany tints",
        "Exoskeletons ranging from tan brown to dark copper, with some showing metallic sheens",
        "Forest green to olive carapaces with darker populations displaying black or deep brown",
        "Golden-brown to bronze chitinous shells, with silver and pale variants in some colonies",
      ],
      eyes: [
        "Compound eyes predominantly red to orange, with golden and crimson variations common",
        "Bright golden compound eyes are universal, with yellow-green and copper also present",
        "Red compound eyes dominate, though orange, yellow, and rare white mutations occur",
        "Cyan and turquoise compound eyes are typical, with variations into green and blue",
        "Multifaceted eyes in shades of green to yellow, with white and red appearing rarely",
      ],
    },
    reptilian: {
      skin: [
        "Scales from forest green to dark teal, with olive, brown, and gray-green populations",
        "Earth-toned scales in browns and tans, with regional groups showing green or gray hues",
        "Copper-brown to bronze scales dominate, with variations into red, green, and charcoal",
        "Olive-green to moss-green scaling with brown, sage, and yellow-green differences by region",
        "Blue-green to teal scales with darker populations showing gray or black undertones",
      ],
      eyes: [
        "Golden and amber eyes are characteristic, with orange, yellow, and green also common",
        "Fierce orange-red eyes dominate, with variations in gold, crimson, and deep amber",
        "Bright green eyes ranging from lime to emerald, with yellow-green and jade present",
        "Yellow to orange slit-pupiled eyes are most frequent, with red and green also appearing",
        "Reptilian eyes in shades of gold, copper, and bright yellow with rare green variants",
      ],
    },
    avian: {
      skin: [
        "Brilliant plumage in royal blue to sky blue, with azure, violet, and teal variations",
        "Vibrant feathers from crimson to scarlet, with flame-orange and burgundy populations",
        "Golden to yellow plumage with variations into orange, amber, and white-gold",
        "Bright green feathering from emerald to lime, with yellow-green and teal accents",
        "Multi-colored plumage combining blues, reds, and golds in regional patterns",
      ],
      eyes: [
        "Golden and amber eyes are typical, with black, orange, and yellow also occurring",
        "Fierce orange to red eyes with intensity varying from bright to deep crimson",
        "Keen black eyes dominate, though golden, blue, and orange appear in populations",
        "Sharp blue eyes ranging from sky to royal blue, with some showing violet tints",
        "Bright eyes in golds, oranges, and reds with rare green or purple individuals",
      ],
    },
    aquatic: {
      skin: [
        "Smooth skin in turquoise and seafoam green, with deeper dwellers showing blue-gray or silver",
        "Aquatic coloration from light cyan to deep blue, with teal and green variations by depth",
        "Scales and skin in shades of blue from pale sky to deep navy, with silver undertones",
        "Green-blue to teal coloration with pearl, silver, and white patterns in some populations",
        "Ocean-toned skin from pale aqua to deep sea blue, with bioluminescent patterns varying",
      ],
      eyes: [
        "Royal blue eyes are prevalent, with variations in deep sea blue, violet, and bright green",
        "Large eyes ranging from black to deep blue, adapted for low-light vision in depths",
        "Bright green to cyan eyes common in shallow dwellers, with blue dominant in deep populations",
        "Eyes in shades of blue and violet, with rare individuals showing green or silver",
        "Bioluminescent eyes glowing blue, green, or cyan depending on regional adaptations",
      ],
    },
    crystalline: {
      skin: [
        "Translucent crystalline structures from clear to pale gray, with rainbow refractions",
        "Faceted surfaces in shades of gold and bronze with metallic and iridescent qualities",
        "Blue crystalline forms from sapphire to pale sky blue with internal light patterns",
        "Purple to violet crystalline structures showing amethyst and lavender variations",
        "Multi-hued crystalline bodies displaying pink, purple, and blue internal colors",
      ],
      eyes: [
        "Luminous white to pale cyan energy nodes acting as sensory organs",
        "Brilliant energy cores in cyan, magenta, and yellow depending on composition",
        "Multispectral sensor arrays glowing in yellows, pinks, and blues",
        "Pure white to pale blue light emanations from crystalline eye structures",
        "Prismatic light emissions showing rainbow effects from white to cyan cores",
      ],
    },
    gaseous: {
      skin: [
        "Nebulous forms in medium purple to violet, with darker indigo and lighter lavender individuals",
        "Luminous plasma clouds shifting between deep blue, violet, and cyan with occasional pink",
        "Radiant golden plasma forms from bright yellow to amber, with rare white-gold variants",
        "Swirling gas forms in shades of cyan to turquoise with blue and green variations",
        "Ethereal cloud bodies in pinks, purples, and blues with constantly shifting patterns",
      ],
      eyes: [
        "Cyan and turquoise energy concentrations are common, ranging through aqua and pale blue",
        "Bright white to pale blue energy cores, with some showing yellow or cyan focal points",
        "Brilliant yellow energy cores universal, from pale lemon to deep golden-yellow",
        "White to pale yellow light centers with occasional cyan or pink individuals",
        "Multicolored energy nodes showing blues, yellows, and cyans in different manifestations",
      ],
    },
    mechanical: {
      skin: [
        "Metallic casings from polished silver to gunmetal gray, with bronze and copper variants",
        "Brushed steel to dark gray alloy bodies with regional design differences",
        "Chrome and silver exteriors with darker populations using tactical gray or black",
        "Aged bronze to copper-colored chassis with oxidized green-blue patinas in some units",
        "Sleek metallic forms in grays, silvers, and blacks with occasional colored accent panels",
      ],
      eyes: [
        "Optical sensors typically glow green, though red, blue, yellow, and cyan configurations exist",
        "Red photoreceptors are standard issue, with blue, green, and white for specialized functions",
        "Blue light optics dominate, with yellow, white, and red used for different operational modes",
        "Glowing yellow sensors are characteristic, with red, green, and cyan alternatives by model",
        "Multicolored sensor arrays capable of shifting between red, green, blue, and white",
      ],
    },
  };

  const descriptions = colorDescriptions[bodyType] || colorDescriptions.humanoid;
  return {
    skinColor: random.choice(descriptions.skin),
    eyeColor: random.choice(descriptions.eyes),
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
