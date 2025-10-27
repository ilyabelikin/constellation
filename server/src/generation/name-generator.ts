import { SeededRandom } from "./random.js";

// Planet name components
const PLANET_PREFIXES = [
  "Astra",
  "Vela",
  "Cygn",
  "Lyra",
  "Draco",
  "Seren",
  "Ceres",
  "Nexa",
  "Zeta",
  "Kappa",
  "Rhea",
  "Teth",
  "Galva",
  "Vesper",
  "Umbra",
  "Nova",
  "Arden",
  "Kepla",
  "Lux",
  "Nyx",
  "Pax",
  "Vex",
  "Zar",
  "Kyr",
  "Myr",
  "Eos",
  "Thel",
  "Titan",
  "Dione",
  "Helios",
];

const PLANET_CORES = [
  "dor",
  "thar",
  "mir",
  "lon",
  "var",
  "thal",
  "nex",
  "tor",
  "vyn",
  "mer",
  "gai",
  "zan",
  "vok",
  "renn",
  "syl",
  "drax",
  "quor",
  "phas",
  "tarn",
  "vel",
  "kan",
  "rix",
  "mor",
  "dax",
];

const PLANET_SUFFIXES = [
  "os",
  "on",
  "ar",
  "or",
  "es",
  "eus",
  "en",
  "eth",
  "um",
  "un",
  "yx",
  "is",
  "as",
  "orbis",
  "ion",
  "ara",
  "ex",
  "ax",
  "ix",
  "us",
  "a",
  "ah",
];

// Short standalone planet names
const SHORT_NAMES = [
  "Lux",
  "Nyx",
  "Pax",
  "Vex",
  "Zar",
  "Kyr",
  "Myr",
  "Eos",
  "Aos",
  "Ixo",
  "Ura",
  "Kor",
  "Tyr",
  "Vos",
  "Zen",
  "Rho",
  "Vor",
  "Kax",
  "Nex",
  "Hex",
  "Ren",
  "Dax",
];

export function generatePlanetName(rng: SeededRandom): string {
  const nameType = rng.next();

  // 20% chance for short name
  if (nameType < 0.2) {
    return SHORT_NAMES[rng.nextInt(0, SHORT_NAMES.length - 1)];
  }

  // 30% chance for just prefix
  if (nameType < 0.5) {
    return PLANET_PREFIXES[rng.nextInt(0, PLANET_PREFIXES.length - 1)];
  }

  // 30% chance for prefix + core
  if (nameType < 0.8) {
    const prefix = PLANET_PREFIXES[rng.nextInt(0, PLANET_PREFIXES.length - 1)];
    const core = PLANET_CORES[rng.nextInt(0, PLANET_CORES.length - 1)];
    return prefix + core;
  }

  // 20% chance for full name (prefix + core + suffix)
  const prefix = PLANET_PREFIXES[rng.nextInt(0, PLANET_PREFIXES.length - 1)];
  const core = PLANET_CORES[rng.nextInt(0, PLANET_CORES.length - 1)];
  const suffix = PLANET_SUFFIXES[rng.nextInt(0, PLANET_SUFFIXES.length - 1)];
  return prefix + core + suffix;
}

// Star name components
const STAR_PREFIXES = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
  "Iota",
  "Kappa",
  "Lambda",
  "Mu",
  "Nu",
  "Xi",
  "Omicron",
  "Pi",
  "Rho",
  "Sigma",
  "Tau",
  "Upsilon",
  "Phi",
  "Chi",
  "Psi",
  "Omega",
];

const STAR_CORES = [
  "Centauri",
  "Draconis",
  "Orionis",
  "Cygni",
  "Lyrae",
  "Aquilae",
  "Scorpii",
  "Sagittarii",
  "Leonis",
  "Ursae",
  "Cassiopeiae",
  "Andromedae",
  "Persei",
  "Aurigae",
  "Tauri",
  "Geminorum",
  "Cancri",
  "Virginis",
  "Librae",
  "Ophiuchi",
  "Aquarii",
  "Piscium",
  "Arietis",
  "Capricorni",
];

// Standalone star names (famous stars)
const STAR_STANDALONE_NAMES = [
  "Sirius",
  "Rigel",
  "Betelgeuse",
  "Aldebaran",
  "Antares",
  "Vega",
  "Altair",
  "Deneb",
  "Procyon",
  "Arcturus",
  "Spica",
  "Pollux",
  "Fomalhaut",
  "Regulus",
  "Adhara",
  "Castor",
  "Bellatrix",
  "Capella",
  "Canopus",
  "Achernar",
  "Hadar",
  "Acrux",
  "Mimosa",
  "Shaula",
  "Rasalhague",
  "Kaus",
  "Avior",
  "Menkent",
  "Atria",
  "Alnair",
  "Peacock",
  "Mirfak",
  "Alphard",
  "Alnitak",
  "Alnilam",
  "Mintaka",
  "Saiph",
];

export function generateStarName(rng: SeededRandom, starClass: string): string {
  const nameType = rng.next();

  // 30% chance for standalone famous star name
  if (nameType < 0.3) {
    return STAR_STANDALONE_NAMES[
      rng.nextInt(0, STAR_STANDALONE_NAMES.length - 1)
    ];
  }

  // 70% chance for Greek letter + constellation
  const prefix = STAR_PREFIXES[rng.nextInt(0, STAR_PREFIXES.length - 1)];
  const core = STAR_CORES[rng.nextInt(0, STAR_CORES.length - 1)];
  return `${prefix} ${core}`;
}

// Moon name components (inspired by real solar system moons)
const MOON_PREFIXES = [
  "Cal",
  "Gan",
  "Eu",
  "Ti",
  "Rhe",
  "Ence",
  "Di",
  "Io",
  "Tri",
  "Ner",
  "Pro",
  "Cha",
  "Hyp",
  "Jap",
  "Mir",
  "Ob",
  "Um",
  "Are",
  "Pho",
  "Dei",
  "Tel",
  "Tha",
  "Lar",
  "Ama",
  "Him",
];

const MOON_SUFFIXES = [
  "isto",
  "ymede",
  "ropa",
  "tan",
  "a",
  "os",
  "one",
  "ton",
  "eid",
  "ssa",
  "eus",
  "ron",
  "erion",
  "etus",
  "briel",
  "eron",
  "os",
  "el",
  "bos",
  "mos",
  "ssus",
  "lia",
  "issa",
  "thea",
  "alia",
];

// Short standalone moon names
const MOON_SHORT_NAMES = [
  "Io",
  "Lua",
  "Nix",
  "Kari",
  "Mab",
  "Puck",
  "Dyar",
  "Skol",
  "Hati",
  "Narvi",
  "Surtur",
  "Fenrir",
  "Loge",
  "Thrym",
  "Jarnsaxa",
  "Kale",
  "Aoede",
  "Isonoe",
  "Aitne",
  "Elara",
];

export function generateMoonName(rng: SeededRandom): string {
  const nameType = rng.next();

  // 40% chance for short name
  if (nameType < 0.4) {
    return MOON_SHORT_NAMES[rng.nextInt(0, MOON_SHORT_NAMES.length - 1)];
  }

  // 60% chance for prefix + suffix
  const prefix = MOON_PREFIXES[rng.nextInt(0, MOON_PREFIXES.length - 1)];
  const suffix = MOON_SUFFIXES[rng.nextInt(0, MOON_SUFFIXES.length - 1)];
  return prefix + suffix;
}
