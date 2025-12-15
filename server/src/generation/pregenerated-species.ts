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
      skinColor: "Ranging from deep ebony to pale ivory, with all shades of brown, tan, and olive in between",
      eyeColor: "Brown eyes are most common, with blue, green, hazel, and amber also present across populations",
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
      skinColor: "Chitinous exoskeletons in shades of deep purple to lavender, with some displaying iridescent blue-green patterns",
      eyeColor: "Compound eyes ranging from cyan to turquoise, with rare individuals showing electric blue",
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
      skinColor: "Scales varying from forest green to dark teal, with some populations showing brown or olive undertones",
      eyeColor: "Golden yellow is dominant, though amber, orange, and bright green eyes are also common",
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
      skinColor: "Dark green to black carapaces, with regional variations showing brown or deep gray hues",
      eyeColor: "Predominantly golden, though copper, yellow-green, and red compound eyes appear in some colonies",
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
      skinColor: "Brilliant plumage in shades of royal blue, sky blue, and azure, with some showing violet or teal patterns",
      eyeColor: "Golden and amber eyes predominate, with black, orange, and bright yellow also occurring",
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
      skinColor: "Luminous plasma clouds shifting between deep blue, violet, and cyan, with occasional pink or green emissions",
      eyeColor: "Bright white to pale blue energy cores, with some manifesting yellow or cyan focal points",
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
      skinColor: "Metallic casings from polished silver to gunmetal gray, with bronze, copper, and dark steel variants",
      eyeColor: "Optical sensors typically glow green, though red, blue, yellow, and cyan configurations exist",
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
      skinColor: "Smooth skin in turquoise, seafoam green, and teal shades, with deeper populations showing blue-gray or silver tones",
      eyeColor: "Royal blue is most prevalent, with variations including deep sea blue, violet, and bright green",
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
      skinColor: "Light blue to pale turquoise skin tones, with some individuals showing silver-blue or ice-white coloration",
      eyeColor: "Deep purple and violet eyes are characteristic, though amethyst, indigo, and lavender also appear",
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
      skinColor: "Thick scales ranging from bronze to copper-brown, with red, dark green, and charcoal variations among clans",
      eyeColor: "Fierce orange-red and crimson eyes dominate, with gold, amber, and deep red also found in populations",
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
      skinColor: "Pale gray to silvery-white, with bioluminescent patterns that can show green, blue, or soft gold undertones",
      eyeColor: "Luminous white to pale silver eyes are typical, though some display soft blue, green, or golden glows",
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
      skinColor: "Dark brown to reddish-brown exoskeletons, with black and deep mahogany variants across different hives",
      eyeColor: "Bright red compound eyes are standard, though orange, crimson, and rare golden-red mutations occur",
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
      skinColor: "Vibrant plumage from crimson to scarlet red, with flame-orange, deep burgundy, and gold-red varieties",
      eyeColor: "Fiery orange-red eyes are universal, with variations in intensity from bright orange to deep crimson",
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
      skinColor: "Nebulous forms in medium purple to violet hues, with darker individuals showing indigo or lighter ones showing lavender",
      eyeColor: "Cyan and turquoise energy concentrations are most common, with aqua, teal, and pale blue also observed",
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
      skinColor: "Earth-toned skin from sienna brown to tan, with clay-red, ochre, and deep brown variations among regions",
      eyeColor: "Forest green and hazel eyes are most frequent, with brown, amber, and olive-green also widespread",
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
      skinColor: "Frost-resistant carapaces in golden-brown to bronze tones, with silver, pale gold, and icy-blue variants in glacier populations",
      eyeColor: "Cyan compound eyes are characteristic of ice-dwellers, with blue, turquoise, and pale white also present",
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
      skinColor: "Radiant golden plasma forms with variations from bright yellow to amber-gold, with rare white-gold and orange-gold individuals",
      eyeColor: "Brilliant yellow energy cores are universal, ranging from pale lemon to deep golden-yellow",
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
      skinColor: "Sturdy scales in olive-green to moss-green tones, with brown, sage, and yellow-green regional differences",
      eyeColor: "Bright lime-green eyes are dominant, though emerald, yellow-green, and jade variations are also common",
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

