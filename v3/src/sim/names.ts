import type { Rng } from "./rng";

const STAR_PREFIX = [
  "Al", "Be", "Ca", "Del", "Er", "Fo", "Ga", "Hy", "Ir", "Ka", "Lu", "Ma", "Ne", "Or", "Pe", "Qu", "Ra", "Sa",
  "Ta", "Ul", "Ve", "Xi", "Ya", "Ze", "Ar", "Cor", "Dra", "Eri", "Hel", "Ly", "Myr", "Nox", "Pol", "Sol", "Thu",
  "Vy", "Zan", "Ae", "Bel", "Cyg", "Ilu", "Kep", "Oph", "Rig", "Sirr", "Tau", "Vol",
];
const STAR_MID = ["", "", "", "ri", "la", "no", "ta", "ve", "ra", "mi", "do", "ce", "ga", "phi", "the", "si", "lo"];
const STAR_SUFFIX = [
  "on", "ar", "is", "us", "ax", "ia", "or", "ea", "ix", "an", "os", "el", "yn", "ae", "um", "ith", "ara", "ion",
  "eth", "ora", "ux", "ides", "ante",
];
const GREEK = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Kappa", "Sigma", "Tau", "Omega"];

export function starName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let name = rng.pick(STAR_PREFIX) + rng.pick(STAR_MID) + rng.pick(STAR_SUFFIX);
    if (rng.chance(0.12)) name = `${rng.pick(GREEK)} ${name}`;
    else if (rng.chance(0.08)) name = `${name} ${rng.int(2, 99)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `HD ${rng.int(1000, 99999)}`;
  used.add(fallback);
  return fallback;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function planetName(star: string, index: number): string {
  return `${star} ${ROMAN[index] ?? index + 1}`;
}

export function moonName(planet: string, index: number): string {
  return `${planet}${String.fromCharCode(97 + index)}`;
}

const SHIP_NAMES = [
  "Resolute", "Vigilant", "Aurora", "Tempest", "Valiant", "Nomad", "Harbinger", "Zephyr", "Obsidian", "Meridian",
  "Solace", "Paragon", "Lodestar", "Warden", "Corsair", "Halcyon", "Nemesis", "Perihelion", "Aphelion", "Indomitable",
  "Kestrel", "Seraph", "Vanguard", "Ember", "Farstrider", "Gauntlet", "Horizon", "Invictus", "Juniper", "Kraken",
  "Leviathan", "Mistral", "Nightfall", "Onyx", "Pioneer", "Quasar", "Radiant", "Sentinel", "Thunderhead", "Umbra",
];

export function shipName(rng: Rng): string {
  return rng.pick(SHIP_NAMES);
}
