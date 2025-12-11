import { SeededRandom } from "./random.js";

// Massively expanded planet name components for variety

// Short syllables for building names
const SYLLABLES_START = [
  "Ae",
  "Al",
  "Am",
  "An",
  "Ar",
  "As",
  "At",
  "Ax",
  "Az",
  "Ba",
  "Be",
  "Bo",
  "Bra",
  "Bry",
  "By",
  "Ca",
  "Ce",
  "Cor",
  "Cra",
  "Cry",
  "Cy",
  "Da",
  "De",
  "Di",
  "Dra",
  "Dry",
  "Du",
  "Dy",
  "E",
  "El",
  "Er",
  "Es",
  "Ex",
  "Ey",
  "Fe",
  "Fi",
  "Fo",
  "Fra",
  "Fry",
  "Ga",
  "Ge",
  "Gi",
  "Gla",
  "Go",
  "Gra",
  "Gry",
  "Gy",
  "Ha",
  "He",
  "Hi",
  "Ho",
  "Hy",
  "I",
  "Il",
  "In",
  "Ir",
  "Is",
  "Ix",
  "Ja",
  "Je",
  "Jo",
  "Ju",
  "Ka",
  "Ke",
  "Ki",
  "Ko",
  "Kra",
  "Kry",
  "Ky",
  "La",
  "Le",
  "Li",
  "Lo",
  "Lu",
  "Ly",
  "Ma",
  "Me",
  "Mi",
  "Mo",
  "Mu",
  "My",
  "Na",
  "Ne",
  "Ni",
  "No",
  "Nu",
  "Ny",
  "O",
  "Ol",
  "Om",
  "Or",
  "Os",
  "Ox",
  "Pa",
  "Pe",
  "Pho",
  "Pi",
  "Po",
  "Pra",
  "Pry",
  "Py",
  "Qua",
  "Que",
  "Qui",
  "Quo",
  "Ra",
  "Re",
  "Rha",
  "Rho",
  "Ri",
  "Ro",
  "Ru",
  "Ry",
  "Sa",
  "Se",
  "Sha",
  "She",
  "Shi",
  "Sho",
  "Si",
  "So",
  "Sta",
  "Stra",
  "Su",
  "Sy",
  "Ta",
  "Te",
  "Tha",
  "The",
  "Thi",
  "Tho",
  "Ti",
  "To",
  "Tra",
  "Try",
  "Tu",
  "Ty",
  "U",
  "Ul",
  "Um",
  "Un",
  "Ur",
  "Ux",
  "Va",
  "Ve",
  "Vi",
  "Vo",
  "Vra",
  "Vry",
  "Vy",
  "Wa",
  "We",
  "Whi",
  "Wi",
  "Wo",
  "Wy",
  "Xa",
  "Xe",
  "Xi",
  "Xo",
  "Xy",
  "Ya",
  "Ye",
  "Yi",
  "Yo",
  "Yu",
  "Za",
  "Ze",
  "Zha",
  "Zhi",
  "Zi",
  "Zo",
  "Zu",
  "Zy",
];

const SYLLABLES_MIDDLE = [
  "ba",
  "be",
  "bi",
  "bo",
  "bu",
  "by",
  "ca",
  "ce",
  "ci",
  "co",
  "cu",
  "cy",
  "da",
  "de",
  "di",
  "do",
  "du",
  "dy",
  "fa",
  "fe",
  "fi",
  "fo",
  "fu",
  "fy",
  "ga",
  "ge",
  "gi",
  "go",
  "gu",
  "gy",
  "ha",
  "he",
  "hi",
  "ho",
  "hu",
  "hy",
  "ja",
  "je",
  "ji",
  "jo",
  "ju",
  "ka",
  "ke",
  "ki",
  "ko",
  "ku",
  "ky",
  "la",
  "le",
  "li",
  "lo",
  "lu",
  "ly",
  "ma",
  "me",
  "mi",
  "mo",
  "mu",
  "my",
  "na",
  "ne",
  "ni",
  "no",
  "nu",
  "ny",
  "pa",
  "pe",
  "pi",
  "po",
  "pu",
  "py",
  "ra",
  "re",
  "ri",
  "ro",
  "ru",
  "ry",
  "sa",
  "se",
  "si",
  "so",
  "su",
  "sy",
  "ta",
  "te",
  "ti",
  "to",
  "tu",
  "ty",
  "va",
  "ve",
  "vi",
  "vo",
  "vu",
  "vy",
  "wa",
  "we",
  "wi",
  "wo",
  "wu",
  "xa",
  "xe",
  "xi",
  "xo",
  "xu",
  "ya",
  "ye",
  "yi",
  "yo",
  "yu",
  "za",
  "ze",
  "zi",
  "zo",
  "zu",
  "zy",
  "dor",
  "dra",
  "dro",
  "kel",
  "kor",
  "kar",
  "len",
  "lin",
  "lon",
  "mer",
  "mir",
  "mor",
  "nel",
  "ner",
  "nix",
  "pol",
  "por",
  "qua",
  "ren",
  "rex",
  "ril",
  "sar",
  "sel",
  "sil",
  "tar",
  "ter",
  "thal",
  "thor",
  "van",
  "var",
  "vel",
  "ver",
  "vex",
  "xan",
  "xar",
  "xel",
  "zan",
  "zar",
  "zel",
  "zen",
  "zor",
];

const SYLLABLES_END = [
  "a",
  "ah",
  "ai",
  "an",
  "ar",
  "as",
  "ax",
  "e",
  "ea",
  "ee",
  "el",
  "en",
  "er",
  "es",
  "eth",
  "ex",
  "i",
  "ia",
  "ie",
  "il",
  "in",
  "ion",
  "ir",
  "is",
  "ix",
  "o",
  "on",
  "or",
  "os",
  "ox",
  "u",
  "um",
  "un",
  "ur",
  "us",
  "ux",
  "y",
  "yn",
  "ys",
  "yx",
  "ael",
  "eon",
  "eus",
  "iel",
  "ion",
  "ius",
  "ara",
  "era",
  "ira",
  "ora",
  "ura",
  "ane",
  "ene",
  "ine",
  "one",
  "yne",
  "aris",
  "eris",
  "iris",
  "oris",
  "uris",
  "ara",
  "eon",
  "ion",
  "ium",
  "ius",
  "yx",
  "adon",
  "ador",
  "agon",
  "agor",
  "alon",
  "amos",
  "anor",
  "aros",
  "athos",
  "azar",
  "endor",
  "idian",
  "idor",
  "igon",
  "illion",
  "orax",
  "orian",
];

// Complete standalone short names (3-4 letters)
const SHORT_NAMES = [
  "Abo",
  "Ace",
  "Ada",
  "Ado",
  "Aeo",
  "Aio",
  "Ala",
  "Alo",
  "Ama",
  "Amo",
  "Ara",
  "Aro",
  "Asa",
  "Ava",
  "Axe",
  "Aya",
  "Azo",
  "Ban",
  "Bax",
  "Beo",
  "Bia",
  "Bix",
  "Boa",
  "Bor",
  "Box",
  "Byx",
  "Cal",
  "Cas",
  "Cax",
  "Ced",
  "Cel",
  "Cix",
  "Cox",
  "Cyx",
  "Dae",
  "Dao",
  "Dax",
  "Dea",
  "Del",
  "Dex",
  "Dia",
  "Dix",
  "Doa",
  "Dor",
  "Dox",
  "Dya",
  "Ebi",
  "Eco",
  "Eda",
  "Edo",
  "Ela",
  "Eli",
  "Elo",
  "Eox",
  "Era",
  "Ero",
  "Esa",
  "Eta",
  "Evo",
  "Exa",
  "Eyo",
  "Eza",
  "Fae",
  "Fal",
  "Fax",
  "Fea",
  "Fen",
  "Fex",
  "Fio",
  "Fix",
  "Foa",
  "Fol",
  "Fox",
  "Fyx",
  "Gal",
  "Gao",
  "Gax",
  "Geo",
  "Gia",
  "Gix",
  "Goa",
  "Gol",
  "Gox",
  "Gyx",
  "Hal",
  "Hao",
  "Hax",
  "Hel",
  "Hex",
  "Hio",
  "Hoa",
  "Hol",
  "Hox",
  "Hyx",
  "Iba",
  "Ibo",
  "Ico",
  "Ida",
  "Ido",
  "Ila",
  "Ilo",
  "Ima",
  "Imo",
  "Ino",
  "Ion",
  "Ira",
  "Isa",
  "Ita",
  "Ivo",
  "Ixa",
  "Ixo",
  "Iyo",
  "Iza",
  "Jal",
  "Jao",
  "Jax",
  "Jea",
  "Jel",
  "Jex",
  "Jin",
  "Joa",
  "Jol",
  "Jor",
  "Jox",
  "Jyx",
  "Kal",
  "Kao",
  "Kax",
  "Kea",
  "Kel",
  "Keo",
  "Kex",
  "Kia",
  "Kil",
  "Kio",
  "Kix",
  "Koa",
  "Kor",
  "Kox",
  "Kyr",
  "Kyx",
  "Lae",
  "Lao",
  "Lax",
  "Lea",
  "Leo",
  "Lex",
  "Lia",
  "Lil",
  "Lio",
  "Lix",
  "Loa",
  "Lor",
  "Lox",
  "Lua",
  "Lux",
  "Lya",
  "Mae",
  "Mal",
  "Mao",
  "Max",
  "Mea",
  "Mel",
  "Meo",
  "Mex",
  "Mia",
  "Mil",
  "Mio",
  "Mix",
  "Moa",
  "Mol",
  "Mor",
  "Mox",
  "Mya",
  "Myr",
  "Nae",
  "Nal",
  "Nao",
  "Nax",
  "Nea",
  "Nel",
  "Nex",
  "Nia",
  "Nil",
  "Nio",
  "Nix",
  "Noa",
  "Nol",
  "Nor",
  "Nox",
  "Nyx",
  "Obi",
  "Oca",
  "Odo",
  "Ola",
  "Oli",
  "Olo",
  "Oma",
  "Omo",
  "Ona",
  "Ono",
  "Ora",
  "Oro",
  "Osa",
  "Ota",
  "Ova",
  "Oxo",
  "Oya",
  "Oza",
  "Pae",
  "Pal",
  "Pao",
  "Pax",
  "Pea",
  "Pel",
  "Peo",
  "Pex",
  "Pia",
  "Pil",
  "Pio",
  "Pix",
  "Poa",
  "Pol",
  "Por",
  "Pox",
  "Pya",
  "Pyx",
  "Qal",
  "Qao",
  "Qax",
  "Qua",
  "Qel",
  "Qex",
  "Qin",
  "Qoa",
  "Qor",
  "Qox",
  "Qyx",
  "Rae",
  "Ral",
  "Rao",
  "Rax",
  "Rea",
  "Rel",
  "Reo",
  "Rex",
  "Rho",
  "Ria",
  "Ril",
  "Rio",
  "Rix",
  "Roa",
  "Rol",
  "Ror",
  "Rox",
  "Rya",
  "Ryx",
  "Sae",
  "Sal",
  "Sao",
  "Sax",
  "Sea",
  "Sel",
  "Seo",
  "Sex",
  "Sia",
  "Sil",
  "Sio",
  "Six",
  "Soa",
  "Sol",
  "Sor",
  "Sox",
  "Sya",
  "Syx",
  "Tae",
  "Tal",
  "Tao",
  "Tax",
  "Tea",
  "Tel",
  "Teo",
  "Tex",
  "Tia",
  "Til",
  "Tio",
  "Tix",
  "Toa",
  "Tol",
  "Tor",
  "Tox",
  "Tya",
  "Tyr",
  "Tyx",
  "Uba",
  "Udo",
  "Ula",
  "Ulo",
  "Uma",
  "Umo",
  "Una",
  "Uno",
  "Ura",
  "Uro",
  "Usa",
  "Uta",
  "Uva",
  "Uxo",
  "Uya",
  "Uza",
  "Vae",
  "Val",
  "Vao",
  "Vax",
  "Vea",
  "Vel",
  "Veo",
  "Vex",
  "Via",
  "Vil",
  "Vio",
  "Vix",
  "Voa",
  "Vol",
  "Vor",
  "Vox",
  "Vya",
  "Vyx",
  "Wae",
  "Wal",
  "Wax",
  "Wea",
  "Wel",
  "Wex",
  "Wia",
  "Wil",
  "Wio",
  "Wix",
  "Woa",
  "Wol",
  "Wor",
  "Wox",
  "Wya",
  "Wyx",
  "Xae",
  "Xal",
  "Xao",
  "Xax",
  "Xea",
  "Xel",
  "Xeo",
  "Xex",
  "Xia",
  "Xil",
  "Xio",
  "Xix",
  "Xoa",
  "Xol",
  "Xor",
  "Xox",
  "Xya",
  "Xyx",
  "Yae",
  "Yal",
  "Yao",
  "Yax",
  "Yea",
  "Yel",
  "Yeo",
  "Yex",
  "Yia",
  "Yil",
  "Yio",
  "Yix",
  "Yoa",
  "Yol",
  "Yor",
  "Yox",
  "Yxa",
  "Yyx",
  "Zae",
  "Zal",
  "Zao",
  "Zar",
  "Zax",
  "Zea",
  "Zel",
  "Zen",
  "Zeo",
  "Zex",
  "Zia",
  "Zil",
  "Zio",
  "Zix",
  "Zoa",
  "Zol",
  "Zor",
  "Zox",
  "Zya",
  "Zyx",
];

// Track used names per galaxy to prevent duplicates
const usedNamesPerGalaxy = new Map<string, Set<string>>();

export function clearGalaxyNames(galaxyId: string): void {
  usedNamesPerGalaxy.delete(galaxyId);
}

export function generatePlanetName(
  rng: SeededRandom,
  galaxyId: string,
  maxAttempts: number = 100
): string {
  // Get or create the set of used names for this galaxy
  if (!usedNamesPerGalaxy.has(galaxyId)) {
    usedNamesPerGalaxy.set(galaxyId, new Set<string>());
  }
  const usedNames = usedNamesPerGalaxy.get(galaxyId)!;

  let attempts = 0;
  let name = "";

  while (attempts < maxAttempts) {
    const nameType = rng.next();

    if (nameType < 0.25) {
      // 25% - Short standalone name (3-4 letters)
      name = SHORT_NAMES[rng.nextInt(0, SHORT_NAMES.length - 1)];
    } else if (nameType < 0.45) {
      // 20% - Two syllables (start + end)
      const start = SYLLABLES_START[rng.nextInt(0, SYLLABLES_START.length - 1)];
      const end = SYLLABLES_END[rng.nextInt(0, SYLLABLES_END.length - 1)];
      name = start + end;
    } else if (nameType < 0.7) {
      // 25% - Three syllables (start + middle + end)
      const start = SYLLABLES_START[rng.nextInt(0, SYLLABLES_START.length - 1)];
      const middle =
        SYLLABLES_MIDDLE[rng.nextInt(0, SYLLABLES_MIDDLE.length - 1)];
      const end = SYLLABLES_END[rng.nextInt(0, SYLLABLES_END.length - 1)];
      name = start + middle + end;
    } else if (nameType < 0.85) {
      // 15% - Four syllables (start + middle + middle + end) - longer exotic names
      const start = SYLLABLES_START[rng.nextInt(0, SYLLABLES_START.length - 1)];
      const middle1 =
        SYLLABLES_MIDDLE[rng.nextInt(0, SYLLABLES_MIDDLE.length - 1)];
      const middle2 =
        SYLLABLES_MIDDLE[rng.nextInt(0, SYLLABLES_MIDDLE.length - 1)];
      const end = SYLLABLES_END[rng.nextInt(0, SYLLABLES_END.length - 1)];
      name = start + middle1 + middle2 + end;
    } else {
      // 15% - Just start syllable (becomes a short unique name)
      const start = SYLLABLES_START[rng.nextInt(0, SYLLABLES_START.length - 1)];
      const endChoice = rng.next();
      if (endChoice < 0.5) {
        name = start; // Just the syllable
      } else {
        // Add a simple ending
        const simpleEndings = [
          "a",
          "e",
          "i",
          "o",
          "u",
          "or",
          "ar",
          "on",
          "an",
          "en",
        ];
        const ending = simpleEndings[rng.nextInt(0, simpleEndings.length - 1)];
        name = start + ending;
      }
    }

    // Check if this name is already used
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    attempts++;
  }

  // Fallback: if we couldn't generate a unique name after maxAttempts,
  // add a number suffix
  const baseName = name;
  let counter = 2;
  while (usedNames.has(`${baseName}-${counter}`) && counter < 1000) {
    counter++;
  }
  const finalName = `${baseName}-${counter}`;
  usedNames.add(finalName);
  return finalName;
}

// Massively expanded star name components for variety

// Greek letters and variations (including numbered variants)
const STAR_PREFIXES = [
  // Traditional Greek alphabet
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
  // Latin letters (for catalog stars)
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  // Directional prefixes
  "North",
  "South",
  "East",
  "West",
  "Central",
  "Upper",
  "Lower",
  "Inner",
  "Outer",
  "Prime",
  "Major",
  "Minor",
  // Descriptive prefixes
  "New",
  "Old",
  "Bright",
  "Dim",
  "Twin",
  "Double",
  "Triple",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
];

const STAR_CORES = [
  // All 88 constellations in genitive form
  "Andromedae",
  "Antliae",
  "Apodis",
  "Aquarii",
  "Aquilae",
  "Arae",
  "Arietis",
  "Aurigae",
  "Bootis",
  "Caeli",
  "Camelopardalis",
  "Cancri",
  "Canum",
  "Canis",
  "Capricorni",
  "Carinae",
  "Cassiopeiae",
  "Centauri",
  "Cephei",
  "Ceti",
  "Chamaeleontis",
  "Circini",
  "Columbae",
  "Comae",
  "Coronae",
  "Corvi",
  "Crateris",
  "Crucis",
  "Cygni",
  "Delphini",
  "Doradus",
  "Draconis",
  "Equulei",
  "Eridani",
  "Fornacis",
  "Geminorum",
  "Gruis",
  "Herculis",
  "Horologii",
  "Hydrae",
  "Hydri",
  "Indi",
  "Lacertae",
  "Leonis",
  "Leporis",
  "Librae",
  "Lupi",
  "Lyncis",
  "Lyrae",
  "Mensae",
  "Microscopii",
  "Monocerotis",
  "Muscae",
  "Normae",
  "Octantis",
  "Ophiuchi",
  "Orionis",
  "Pavonis",
  "Pegasi",
  "Persei",
  "Phoenicis",
  "Pictoris",
  "Piscium",
  "Piscis",
  "Puppis",
  "Pyxidis",
  "Reticuli",
  "Sagittae",
  "Sagittarii",
  "Scorpii",
  "Sculptoris",
  "Scuti",
  "Serpentis",
  "Sextantis",
  "Tauri",
  "Telescopii",
  "Trianguli",
  "Tucana",
  "Ursae",
  "Velorum",
  "Virginis",
  "Volantis",
  "Vulpeculae",
];

// Standalone star names (famous stars + many new ones)
const STAR_STANDALONE_NAMES = [
  // Real famous stars
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
  "Alkaid",
  "Eltanin",
  "Scheat",
  "Alderamin",
  "Kochab",
  "Rasalgethi",
  "Zubenelgenubi",
  "Zubeneschamali",
  "Sabik",
  "Menkar",
  "Algol",
  "Almach",
  "Dubhe",
  "Merak",
  "Phecda",
  "Megrez",
  "Alioth",
  "Mizar",
  "Albireo",
  "Thuban",
  "Polaris",
  "Izar",
  "Enif",
  "Markab",
  "Algenib",
  "Alpheratz",
  "Sadalmelik",
  "Sadalsuud",
  "Skat",
  "Denebola",
  "Zosma",
  "Chort",
  "Algieba",
  "Rasalas",
  "Gacrux",
  "Ginan",
  "Miaplacidus",
  "Muhlifain",
  "Aspidiske",
  "Regor",
  "Suhail",
  "Tureis",
  "Naos",
  "Alsephina",
  "Nunki",
  "Ascella",
  "Rukbat",
  "Arkab",
  "Kaus",
  "Lesath",
  "Sargas",
  "Alniyat",
  "Dschubba",
  "Acrab",
  "Kornephoros",
  "Rutilicus",
  "Marsic",
  "Maasym",
  "Rasalgethi",
  "Cheleb",
  "Alphecca",
  "Nusakan",
  "Seginus",
  "Nekkar",
  "Muphrid",
  "Zaniah",
  "Vindemiatrix",
  "Heze",
  "Zavijava",
  "Minelauva",
  "Porrima",
  "Auva",
  "Alula",
  "Tania",
  "Talitha",
  "Alkafzah",
  "Alhena",
  "Mebsuta",
  "Tejat",
  "Propus",
  "Wasat",
  "Alhena",
  "Menkalinan",
  "Hassaleh",
  "Mahasim",
  "Elnath",
  "Alcyone",
  "Atlas",
  "Electra",
  "Maia",
  "Merope",
  "Taygeta",
  "Pleione",
  "Celaeno",
  "Asterope",
  "Nihal",
  "Arneb",
  "Cursa",
  "Zaurak",
  "Rana",
  "Beid",
  "Keid",
  "Angetenar",
  "Zibal",
  "Sheratan",
  "Mesarthim",
  "Hamal",
  "Bharani",
  // Fictional sci-fi inspired names
  "Xerion",
  "Valoris",
  "Nexara",
  "Kaelith",
  "Zyphon",
  "Thalorix",
  "Vortan",
  "Meridax",
  "Synthara",
  "Axylon",
  "Celestor",
  "Draven",
  "Erebos",
  "Flavion",
  "Galadon",
  "Helion",
  "Ironyx",
  "Jovaran",
  "Kronos",
  "Luminax",
  "Maverick",
  "Nebulon",
  "Obsidian",
  "Parallax",
  "Quantum",
  "Radiance",
  "Solaris",
  "Titanis",
  "Umbra",
  "Vortex",
  "Xenith",
  "Zephyrus",
];

// Additional numeric suffixes for numbered designations
const STAR_NUMBERS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
];

export function generateStarName(
  rng: SeededRandom,
  starClass: string,
  galaxyId: string,
  maxAttempts: number = 100
): string {
  // Get or create the set of used names for this galaxy
  if (!usedNamesPerGalaxy.has(galaxyId)) {
    usedNamesPerGalaxy.set(galaxyId, new Set<string>());
  }
  const usedNames = usedNamesPerGalaxy.get(galaxyId)!;

  let attempts = 0;
  let name = "";

  while (attempts < maxAttempts) {
    const nameType = rng.next();

    if (nameType < 0.3) {
      // 30% - Standalone famous/unique star name
      name =
        STAR_STANDALONE_NAMES[
          rng.nextInt(0, STAR_STANDALONE_NAMES.length - 1)
        ];
    } else if (nameType < 0.7) {
      // 40% - Greek letter + constellation (traditional Bayer designation)
      const prefix = STAR_PREFIXES[rng.nextInt(0, STAR_PREFIXES.length - 1)];
      const core = STAR_CORES[rng.nextInt(0, STAR_CORES.length - 1)];
      name = `${prefix} ${core}`;
    } else {
      // 30% - Greek letter + number + constellation (for multiple stars)
      const prefix = STAR_PREFIXES[rng.nextInt(0, STAR_PREFIXES.length - 1)];
      const number = STAR_NUMBERS[rng.nextInt(0, STAR_NUMBERS.length - 1)];
      const core = STAR_CORES[rng.nextInt(0, STAR_CORES.length - 1)];
      name = `${prefix} ${number} ${core}`;
    }

    // Check if this name is already used
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    attempts++;
  }

  // Fallback: if we couldn't generate a unique name after maxAttempts,
  // use Greek letter + high number + constellation for guaranteed uniqueness
  const prefix = STAR_PREFIXES[rng.nextInt(0, STAR_PREFIXES.length - 1)];
  const core = STAR_CORES[rng.nextInt(0, STAR_CORES.length - 1)];
  let counter = 21;
  while (usedNames.has(`${prefix} ${counter} ${core}`) && counter < 10000) {
    counter++;
  }
  const finalName = `${prefix} ${counter} ${core}`;
  usedNames.add(finalName);
  return finalName;
}

// Connectivity suffix words based on gate count
const CONNECTIVITY_SUFFIXES = {
  // 1 gate - edge of the network, frontier systems
  frontier: [
    "Outpost",
    "Frontier",
    "Borderlands",
    "Terminus",
    "Edge",
    "Fringe",
    "Perimeter",
    "Boundary",
  ],
  // 2 gates - minor waypoints
  waypoint: [
    "Waypoint",
    "Passage",
    "Crossing",
    "Transit",
    "Bridge",
    "Link",
  ],
  // 3-4 gates - standard connected systems
  junction: [
    "Junction",
    "Crossroads",
    "Interchange",
    "Confluence",
    "Convergence",
    "Gateway",
  ],
  // 5+ gates - major hubs
  hub: [
    "Hub",
    "Nexus",
    "Node",
    "Beacon",
    "Citadel",
    "Terminus",
    "Concourse",
    "Apex",
  ],
};

/**
 * Add a connectivity suffix to a star name based on gate count
 * This makes the star name more meaningful by indicating its role in the network
 */
export function addConnectivitySuffix(
  baseName: string,
  gateCount: number,
  rng: SeededRandom
): string {
  let suffixArray: string[];

  if (gateCount === 1) {
    suffixArray = CONNECTIVITY_SUFFIXES.frontier;
  } else if (gateCount === 2) {
    suffixArray = CONNECTIVITY_SUFFIXES.waypoint;
  } else if (gateCount >= 3 && gateCount <= 4) {
    suffixArray = CONNECTIVITY_SUFFIXES.junction;
  } else {
    // 5+ gates
    suffixArray = CONNECTIVITY_SUFFIXES.hub;
  }

  const suffix = suffixArray[rng.nextInt(0, suffixArray.length - 1)];
  return `${baseName} ${suffix}`;
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
  "Epi",
  "Pan",
  "Ata",
  "Pro",
  "Met",
  "Hel",
  "Kal",
  "Car",
  "Ely",
  "Pas",
  "Sin",
  "Meg",
  "Bel",
  "Gal",
  "Cym",
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
  "dne",
  "dra",
  "tes",
  "the",
  "dore",
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
  "Kale",
  "Aoede",
  "Isonoe",
  "Aitne",
  "Elara",
  "Carpo",
  "Thebe",
  "Amalthea",
  "Adrastea",
  "Metis",
  "Ananke",
  "Sinope",
];

export function generateMoonName(
  rng: SeededRandom,
  galaxyId: string,
  maxAttempts: number = 100
): string {
  // Get or create the set of used names for this galaxy
  if (!usedNamesPerGalaxy.has(galaxyId)) {
    usedNamesPerGalaxy.set(galaxyId, new Set<string>());
  }
  const usedNames = usedNamesPerGalaxy.get(galaxyId)!;

  let attempts = 0;
  let name = "";

  while (attempts < maxAttempts) {
    const nameType = rng.next();

    if (nameType < 0.4) {
      // 40% chance for short name
      name = MOON_SHORT_NAMES[rng.nextInt(0, MOON_SHORT_NAMES.length - 1)];
    } else {
      // 60% chance for prefix + suffix
      const prefix = MOON_PREFIXES[rng.nextInt(0, MOON_PREFIXES.length - 1)];
      const suffix = MOON_SUFFIXES[rng.nextInt(0, MOON_SUFFIXES.length - 1)];
      name = prefix + suffix;
    }

    // Check if this name is already used
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    attempts++;
  }

  // Fallback with number suffix
  const baseName = name;
  let counter = 2;
  while (usedNames.has(`${baseName}-${counter}`) && counter < 1000) {
    counter++;
  }
  const finalName = `${baseName}-${counter}`;
  usedNames.add(finalName);
  return finalName;
}

// Asteroid name generation
export function generateAsteroidName(
  rng: SeededRandom,
  galaxyId: string,
  beltName: string,
  index: number,
  maxAttempts: number = 100
): string {
  // Get or create the set of used names for this galaxy
  if (!usedNamesPerGalaxy.has(galaxyId)) {
    usedNamesPerGalaxy.set(galaxyId, new Set<string>());
  }
  const usedNames = usedNamesPerGalaxy.get(galaxyId)!;

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let attempts = 0;
  let name = "";

  while (attempts < maxAttempts) {
    // Generate format: XX-NNNN (e.g., "NL-6790", "AR-2389")
    const letter1 = letters[rng.nextInt(0, letters.length - 1)];
    const letter2 = letters[rng.nextInt(0, letters.length - 1)];
    const number = rng.nextInt(1000, 9999); // 4-digit number

    name = `${letter1}${letter2}-${number}`;

    // Check if this name is already used
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    attempts++;
  }

  // Fallback: guaranteed unique with incrementing counter
  // This should rarely happen with 26*26*9000 = 6,084,000 possible combinations
  let counter = 1000;
  while (usedNames.has(`ZZ-${counter}`) && counter < 10000) {
    counter++;
  }
  const finalName = `ZZ-${counter}`;
  usedNames.add(finalName);
  return finalName;
}

// Galaxy name components
const GALAXY_PREFIXES = [
  "Andromeda",
  "Centaurus",
  "Orion",
  "Phoenix",
  "Pegasus",
  "Draco",
  "Hydra",
  "Serpens",
  "Aquila",
  "Cygnus",
  "Lyra",
  "Corona",
  "Nebula",
  "Spiral",
  "Elliptical",
  "Irregular",
  "Stellar",
  "Cosmic",
  "Celestial",
  "Galactic",
  "Astral",
  "Void",
  "Quantum",
  "Omega",
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Sigma",
  "Nova",
];

const GALAXY_SUFFIXES = [
  "Prime",
  "Major",
  "Minor",
  "Cluster",
  "Expanse",
  "Reach",
  "Arm",
  "Sector",
  "Zone",
  "Realm",
  "Domain",
  "Nexus",
  "Core",
  "Edge",
  "Rift",
  "Vortex",
  "Cascade",
  "Stream",
  "Field",
  "Array",
];

const GALAXY_NUMBERS = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];

// Track used galaxy names globally
const usedGalaxyNames = new Set<string>();

/**
 * Generate a unique galaxy name
 */
export function generateGalaxyName(): string {
  const rng = new SeededRandom(Date.now() + Math.random() * 1000000);
  let attempts = 0;
  const maxAttempts = 100;
  let name = "";

  while (attempts < maxAttempts) {
    const nameType = rng.next();

    if (nameType < 0.4) {
      // 40% - Prefix + Suffix (e.g., "Andromeda Expanse")
      const prefix = rng.choice(GALAXY_PREFIXES);
      const suffix = rng.choice(GALAXY_SUFFIXES);
      name = `${prefix} ${suffix}`;
    } else if (nameType < 0.7) {
      // 30% - Prefix + Number + Suffix (e.g., "Phoenix VII Reach")
      const prefix = rng.choice(GALAXY_PREFIXES);
      const number = rng.choice(GALAXY_NUMBERS);
      const suffix = rng.choice(GALAXY_SUFFIXES);
      name = `${prefix} ${number} ${suffix}`;
    } else {
      // 30% - Just Prefix + Number (e.g., "Andromeda XII")
      const prefix = rng.choice(GALAXY_PREFIXES);
      const number = rng.choice(GALAXY_NUMBERS);
      name = `${prefix} ${number}`;
    }

    // Check if this name is already used
    if (!usedGalaxyNames.has(name)) {
      usedGalaxyNames.add(name);
      return name;
    }

    attempts++;
  }

  // Fallback: prefix + high number for guaranteed uniqueness
  const prefix = rng.choice(GALAXY_PREFIXES);
  let counter = 21;
  while (usedGalaxyNames.has(`${prefix} ${counter}`) && counter < 10000) {
    counter++;
  }
  const finalName = `${prefix} ${counter}`;
  usedGalaxyNames.add(finalName);
  return finalName;
}

/**
 * Clear a specific galaxy name from the used names set (for cleanup)
 */
export function clearGalaxyName(name: string): void {
  usedGalaxyNames.delete(name);
}
