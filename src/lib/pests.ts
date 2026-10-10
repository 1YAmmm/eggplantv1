export type Severity = "none" | "moderate" | "high";

export type Pesticide = {
  /** Active ingredient, or the name of the homemade spray. */
  name: string;
  type: "Organic" | "Biological" | "Chemical";
  /** Example product sold in the Philippines; only products confirmed on the maker's Philippine site. */
  brand?: string;
  /** How much to use and when. */
  note: string;
  /** Why it is a good choice; shown in the details modal. */
  why: string[];
  /** Where to find it. */
  where: string;
  /** Photo for the details modal; a placeholder is shown when there is none. */
  image?: PestImage;
};

export type PestImage = {
  src: string;
  alt: string;
  credit: string;
  license: string;
  /** Left out for photos with no public licence page (for example a seller's product photo). */
  licenseUrl?: string;
  /** Left out when the original page is unknown. */
  sourceUrl?: string;
  /** "contain" shows the whole picture (tall product bottles); the default "cover" fills the frame and crops. */
  fit?: "cover" | "contain";
};

export type PestInfo = {
  label: string;
  images?: PestImage[];
  name: string;
  scientific?: string;
  healthy: boolean;
  severity: Severity;
  summary: string;
  symptoms: string[];
  pesticides: Pesticide[];
  treatment: string[];
  prevention: string[];
};

/**
 * Photos for the pesticide details modal. The plant extracts use free-licensed Wikimedia Commons photos.
 * The four pack shots (cypermethrin, chlorantraniliprole, cyantraniliprole, spinosad) are sellers' product photos,
 * not free-licensed, and they show other brands of the same active ingredient (the credit line says which). The
 * spinosad one is a US garden bait, not the Success product named on the card.
 * Products without a photo show a placeholder until you add one (set `image`).
 */
const PESTICIDE_PHOTOS = {
  laundrySoap: {
    src: "/pesticides/laundry-soap.webp",
    alt: "A plain bar of soap",
    credit: "Lacrimosus",
    license: "Public domain",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:A_bar_of_soap.jpg",
  },
  oregano: {
    src: "/pesticides/oregano.webp",
    alt: "Oregano (Plectranthus amboinicus) leaves",
    credit: "Aathavan jaffna",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Plectranthus_amboinicus_in_jaffna.JPG",
  },
  langkawas: {
    src: "/pesticides/langkawas.webp",
    alt: "Langkawas (galangal) rhizomes",
    credit: "Ruth Hartnup",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Galangal_(562251733).jpg",
  },
  cypermethrin: {
    src: "/pesticides/cypermethrin.webp",
    alt: "A bottle of Magnum 5 (Aldiz), a cypermethrin insecticide, on a store counter",
    credit: "Shopee seller listing",
    license: "Product photo, © its owner",
    sourceUrl: "https://down-ph.img.susercontent.com/file/ph-11134207-81ztc-me45bzib9af537",
    fit: "contain",
  },
  chlorantraniliprole: {
    src: "/pesticides/chlorantraniliprole.webp",
    alt: "A 250 mL bottle of Agway Elicor 5SC, a chlorantraniliprole 50 g/L insecticide whose label lists eggplant",
    credit: "Lazada seller listing (shows Agway Elicor 5SC, which also contains chlorantraniliprole)",
    license: "Product photo, © its owner",
    fit: "contain",
  },
  spinosad: {
    src: "/pesticides/spinosad.webp",
    alt: "A jar of Fertilome Spinosad Plus, a US garden bait that contains spinosad. It is not the Success product named on this card.",
    credit: "Google Images (shows Fertilome Spinosad Plus, a US garden bait, not Success: check the label of the product you buy)",
    license: "Product photo, © its owner",
    fit: "contain",
  },
  cyantraniliprole: {
    src: "/pesticides/cyantraniliprole.webp",
    alt: "A bottle of Awiner Biotech Cyantraniliprole 10% + Chlorfenapyr SC insecticide, 500 ml",
    credit: "Awiner Biotech product listing",
    license: "Product photo, © its owner",
    fit: "contain",
  },
} satisfies Record<string, PestImage>;

/*
 * Recommendations are limited to what is sold or grown in the Philippines. The branded products below
 * were checked against the makers' Philippine product pages and FPA-registered product sheets (FMC:
 * Prevathon 5SC, Benevia; Corteva: Success). The plant extracts come from UPLB organic-vegetable
 * research. Always follow the printed label, and confirm FPA registration before buying.
 */
const SOAP_SPRAY: Pesticide = {
  name: "Laundry soap spray (sabon panlaba)",
  type: "Organic",
  note: "Dissolve about 20 g of grated plain bar soap (2%) in 1 L of water. Spray leaf undersides in the late afternoon and repeat after 3–5 days. Use plain bar soap, not detergent powder or soap with bleach, and test on a few leaves first.",
  why: [
    "Cheap and sold in any palengke or sari-sari store.",
    "Kills soft-bodied insects like aphids on contact, so spray right onto the colonies and the leaf undersides.",
    "Breaks down quickly and leaves little residue on fruit you harvest every week.",
  ],
  where: "Any palengke, sari-sari store or grocery: plain bar laundry soap.",
  image: PESTICIDE_PHOTOS.laundrySoap,
};

const OREGANO_EXTRACT: Pesticide = {
  name: "Oregano leaf extract",
  type: "Organic",
  note: "Crush fresh oregano leaves in water (a starting point is a cupful per liter), strain, and spray on aphid colonies and leaf undersides. There is no official dose, so test on a few leaves first. Best for light infestations.",
  why: [
    "A UPLB study found a crude oregano extract effective against black bean aphids on stringbeans.",
    "Oregano (Plectranthus amboinicus) is a common household herb: easy to buy in the palengke or grow in a pot.",
    "Plant-based, so it is a good choice for light infestations or when you want to avoid chemicals close to harvest.",
  ],
  where: "Palengke (wet market) or your own backyard.",
  image: PESTICIDE_PHOTOS.oregano,
};

const LANGKAWAS_EXTRACT: Pesticide = {
  name: "Langkawas (galangal) extract",
  type: "Organic",
  note: "Pound fresh langkawas rhizome in water (a starting point is about 100 g per liter), strain, and spray the plants and leaf undersides. There is no official dose, so test on a few leaves first and re-spray after rain.",
  why: [
    "In UPLB trials, a langkawas water extract killed 100% of eggplant flea beetles, the highest control among the plant extracts tested.",
    "Sold fresh in any palengke, so you don't need to go to an agri-vet store.",
    "Plant-based and cheap, with no synthetic chemical residue on fruit you harvest every week.",
  ],
  where: "Palengke (wet market): fresh langkawas rhizome.",
  image: PESTICIDE_PHOTOS.langkawas,
};

const CYPERMETHRIN: Pesticide = {
  name: "Cypermethrin",
  type: "Chemical",
  note: "Last resort. Use only a product whose label lists eggplant, and follow its dose and pre-harvest interval. Spray in the evening, and only when beetles are damaging seedlings or young plants.",
  why: [
    "A pyrethroid insecticide widely sold in agri-vet stores; a UPLB residue study found cypermethrin among the insecticides sprayed on eggplant farms in Pangasinan.",
    "Acts quickly on contact, which suits flea beetles that jump from plant to plant.",
    "Use it sparingly: it also kills ladybirds and other helpful insects, and it is toxic to bees and fish, so keep it away from ponds and flowering plants.",
  ],
  where: "Agri-vet stores. Check that the label lists eggplant and shows an FPA registration number.",
  image: PESTICIDE_PHOTOS.cypermethrin,
};

const PREVATHON: Pesticide = {
  name: "Chlorantraniliprole",
  type: "Chemical",
  brand: "Prevathon® 5SC (FMC)",
  note: "10 ml per 16 L of water (500 ml/ha), every 5–7 days. Best in the vegetative stage, or alternated with other products during fruiting. Pre-harvest interval 1 day; re-enter once the spray has dried.",
  why: [
    "Registered in the Philippines for eggplant fruit and shoot borer (and cutworm).",
    "FMC reports that larvae stop feeding within about 7 minutes and stay protected for up to 14 days.",
    "Green label (FPA toxicity category 4, the lowest hazard class), and described by FMC as generally safe to beneficial insects.",
    "Rainfast: the spray stays on the plant if it rains 2–4 hours later.",
    "Different group (28) from spinosad (5), so you can alternate the two to slow down resistance.",
  ],
  where: "Agri-vet stores. Made by FMC; FPA Reg. No. 598-393-4410.",
  image: PESTICIDE_PHOTOS.chlorantraniliprole,
};

const BENEVIA: Pesticide = {
  name: "Cyantraniliprole",
  type: "Chemical",
  brand: "Benevia® (FMC)",
  note: "30–40 ml per 16 L of water (1 L/ha), every 7 days. Best in the vegetative stage, or alternated with other products during fruiting. Maximum 2 sprays back-to-back, then switch to a different chemistry. Pre-harvest interval 1 day; re-enter after 12 hours.",
  why: [
    "Registered in the Philippines for eggplant. The label lists aphids, thrips and fruit and shoot borer, so one product covers the main pests.",
    "Systemic: it moves through the leaf, which helps against sucking pests such as aphids and thrips.",
    "FMC reports that insects stop feeding within about 7 minutes and stay protected for up to 14 days.",
    "Green label (FPA toxicity category 4, the lowest hazard class), and the spray stays on the plant if it rains 2–4 hours later.",
    "Helps limit plant viruses spread by aphids and thrips.",
  ],
  where: "Agri-vet stores. Made by FMC; FPA Reg. No. 598-485-4577.",
  image: PESTICIDE_PHOTOS.cyantraniliprole,
};

const SUCCESS: Pesticide = {
  name: "Spinosad",
  type: "Biological",
  brand: "Success® (Corteva)",
  note: "Use the rate and pre-harvest interval printed on the label. Spray in the evening, when bees are not active, and alternate with a different insecticide group.",
  why: [
    "Corteva's Philippine product page lists eggplant, with thrips and the eggplant fruit and shoot borer among the target pests.",
    "Made from a naturally occurring soil bacterium (per Corteva), so it is a more natural option than most insecticides.",
    "Different group (5) from Benevia and Prevathon (28): use it to rotate and slow down resistance.",
  ],
  where: "Agri-vet stores. 250 mL pack, made by Corteva Agriscience.",
  image: PESTICIDE_PHOTOS.spinosad,
};

export const PESTS: Record<string, PestInfo> = {
  aphids: {
    label: "aphids",
    images: [
      {
        src: "/pests/aphids/1.webp",
        alt: "Cotton aphids on a leaf, close-up",
        credit: "Alex Abair",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Aphis_gossypii_252211094.jpg",
      },
      {
        src: "/pests/aphids/2.webp",
        alt: "Green peach aphid on a leaf, close-up",
        credit: "Jules Verne Times Two",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Green_peach_aphid_(Myzus_persicae)_on_a_leaf,_Lisbon,_Portugal_(approx._GPS_location)_julesvernex2.jpg",
      },
      {
        src: "/pests/aphids/3.webp",
        alt: "Green peach aphids on a stem, close-up",
        credit: "Jules Verne Times Two",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Green_peach_aphid_(Myzus_persicae)_on_a_stem,_Lisbon,_Portugal_(approx._GPS_location)_julesvernex2.jpg",
      },
      {
        src: "/pests/aphids/4.webp",
        alt: "Yellow cotton aphids under a leaf",
        credit: "Dr Lewis Wilson, CSIRO",
        license: "CC BY 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by/3.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_7331_Aphids_on_cotton_7.jpg",
      },
      {
        src: "/pests/aphids/5.webp",
        alt: "Cotton aphids on a flower bud",
        credit: "Flowersabc",
        license: "CC BY-SA 2.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Aphis_gossypii_%D0%91%D0%B0%D1%85%D1%87%D0%B5%D0%B2%D0%B0%D1%8F_(%D1%85%D0%BB%D0%BE%D0%BF%D0%BA%D0%BE%D0%B2%D0%B0%D1%8F)_%D1%82%D0%BB%D1%8F_-_5777515999.jpg",
      },
    ],
    name: "Aphids",
    scientific: "Aphis gossypii",
    healthy: false,
    severity: "moderate",
    summary:
      "Small soft-bodied insects that cluster under leaves and on young shoots, sucking sap and spreading plant viruses.",
    symptoms: [
      "Curled, yellowing or distorted young leaves",
      "Sticky honeydew and black sooty mould on leaves",
      "Clusters of tiny green, black or yellow insects on leaf undersides",
      "Ants moving up and down the plant",
    ],
    pesticides: [
      SOAP_SPRAY,
      OREGANO_EXTRACT,
      BENEVIA,
    ],
    treatment: [
      "Blast colonies off with a strong jet of water.",
      "Prune and destroy heavily infested shoots.",
      "Spray laundry soap solution or oregano extract, covering leaf undersides.",
      "If aphids keep increasing after 2 sprays, use cyantraniliprole (Benevia) once, following the label.",
    ],
    prevention: [
      "Encourage ladybirds, lacewings and parasitic wasps.",
      "Avoid excess nitrogen fertiliser, which produces soft, aphid-friendly growth.",
      "Use yellow sticky traps to monitor winged aphids.",
    ],
  },
  flea_beetle: {
    label: "flea_beetle",
    images: [
      {
        src: "/pests/flea_beetle/1.webp",
        alt: "Flea beetle on a leaf, close-up",
        credit: "Robert Webster",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Epitrix_fuscula_-_inat_73678456.jpg",
      },
      {
        src: "/pests/flea_beetle/2.webp",
        alt: "Potato flea beetle, close-up",
        credit: "Robert Webster",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Epitrix_cucumeris_-_inat_71803435.jpg",
      },
      {
        src: "/pests/flea_beetle/3.webp",
        alt: "Flea beetle, top view",
        credit: "Robert Webster",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Epitrix_brevis_-_inat_71803402.jpg",
      },
      {
        src: "/pests/flea_beetle/4.webp",
        alt: "Flea beetle on a leaf tip",
        credit: "xpda",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Epitrix_P1280533a.jpg",
      },
      {
        src: "/pests/flea_beetle/5.webp",
        alt: "Tobacco flea beetle specimen",
        credit: "Natasha Wright, Bugwood.org",
        license: "CC BY 3.0 US",
        licenseUrl: "https://creativecommons.org/licenses/by/3.0/us/deed.en",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Tobacco_flea_beetle_-_Epitrix_hirtipennis_UGA5205021.jpg",
      },
    ],
    name: "Flea Beetle",
    scientific: "Epitrix spp. / Psylliodes spp.",
    healthy: false,
    severity: "moderate",
    summary:
      "Tiny jumping beetles that chew small round holes in leaves. Most damaging to seedlings and young transplants.",
    symptoms: [
      "Many small round 'shot-holes' in leaves",
      "Tiny dark beetles that jump when disturbed",
      "Stunted or wilting seedlings",
    ],
    pesticides: [
      LANGKAWAS_EXTRACT,
      CYPERMETHRIN,
    ],
    treatment: [
      "Cover young plants with net or floating row covers until flowering.",
      "Use yellow sticky traps near affected plants.",
      "Spray langkawas extract to protect young plants.",
      "Use cypermethrin only if damage exceeds roughly 20–30% of leaf area on young plants.",
    ],
    prevention: [
      "Transplant sturdy, older seedlings that tolerate feeding.",
      "Plant trap crops such as radish or mustard nearby.",
      "Remove weeds and crop debris where adults overwinter.",
    ],
  },
  fruit_shoot_borer: {
    label: "fruit_shoot_borer",
    images: [
      {
        src: "/pests/fruit_shoot_borer/1.webp",
        alt: "Adult eggplant fruit and shoot borer moth",
        credit: "Donald Hobern",
        license: "CC BY 2.0",
        licenseUrl: "https://creativecommons.org/licenses/by/2.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Leucinodes_orbonalis.jpg",
      },
      {
        src: "/pests/fruit_shoot_borer/2.webp",
        alt: "Fruit and shoot borer moth specimen",
        credit: "Komal et al. (2021)",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Leucinodes_orbonalis_(10.3897-BDJ.9.e73997)_Figure_30e.jpg",
      },
      {
        src: "/pests/fruit_shoot_borer/3.webp",
        alt: "Borer larva inside a cut eggplant fruit",
        credit: "Chirag85",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Leucinodes_orbonalis_(Brinjal_Fruit_Borer).jpg",
      },
      {
        src: "/pests/fruit_shoot_borer/4.webp",
        alt: "Illustration of the borer caterpillar",
        credit: "George Vernon Hudson",
        license: "Public domain",
        licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Fig_39_MA_I437601_TePapa_Plate-II-The-butterflies_full_(cropped).jpg",
      },
      {
        src: "/pests/fruit_shoot_borer/5.webp",
        alt: "Fruit and shoot borer moth, side view",
        credit: "Donald Hobern",
        license: "CC BY 2.0",
        licenseUrl: "https://creativecommons.org/licenses/by/2.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Leucinodes_orbonalis2.jpg",
      },
    ],
    name: "Fruit & Shoot Borer",
    scientific: "Leucinodes orbonalis",
    healthy: false,
    severity: "high",
    summary:
      "The most destructive eggplant pest. Larvae bore into tender shoots and fruit, causing wilting and making fruit unmarketable.",
    symptoms: [
      "Drooping or wilting shoot tips",
      "Small entry holes on fruit, often plugged with frass (droppings)",
      "Tunnels and rotting inside the fruit",
      "Pinkish-white caterpillars inside shoots or fruit",
    ],
    pesticides: [
      PREVATHON,
      BENEVIA,
      SUCCESS,
    ],
    treatment: [
      "Cut and destroy wilted shoots and bored fruit weekly — burn or bury deep, never compost.",
      "Install pheromone traps (~100/ha) to capture male moths.",
      "Spray chlorantraniliprole (Prevathon) or cyantraniliprole (Benevia) at the first sign of damage.",
      "Alternate with spinosad (Success) so the borer doesn't become resistant, and respect the pre-harvest interval.",
    ],
    prevention: [
      "Use insect-proof netting in nurseries.",
      "Rotate with non-solanaceous crops (avoid tomato, potato, pepper).",
      "Release Trichogramma egg parasitoids where available.",
      "Harvest fruit promptly and remove crop residues after harvest.",
    ],
  },
  thrips: {
    label: "thrips",
    images: [
      {
        src: "/pests/thrips/1.webp",
        alt: "Western flower thrips, extreme close-up",
        credit: "Dave Kirkeby",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Frankliniella_occidentalis_7826crop.jpg",
      },
      {
        src: "/pests/thrips/2.webp",
        alt: "Western flower thrips on a flower",
        credit: "Dave Kirkeby",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Frankliniella_occidentalis_7798.jpg",
      },
      {
        src: "/pests/thrips/3.webp",
        alt: "Western flower thrips feeding on pollen",
        credit: "Dave Kirkeby",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Frankliniella_occidentalis_7899.jpg",
      },
      {
        src: "/pests/thrips/4.webp",
        alt: "Western flower thrips on a leaf",
        credit: "Frank Peairs, Bugwood.org",
        license: "CC BY 3.0",
        licenseUrl: "https://creativecommons.org/licenses/by/3.0",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Frankliniella_occidentalis_5364132-LGPT.jpg",
      },
      {
        src: "/pests/thrips/5.webp",
        alt: "Western flower thrips, top view",
        credit: "Jesse Rorabaugh",
        license: "CC0",
        licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Frankliniella_occidentalis_14827640.jpg",
      },
    ],
    name: "Thrips",
    scientific: "Thrips palmi",
    healthy: false,
    severity: "moderate",
    summary:
      "Slender, tiny insects that rasp leaf and fruit surfaces and suck the contents, leaving silvery scars. They also spread tospoviruses.",
    symptoms: [
      "Silvery or bronze streaks and speckles on leaves",
      "Tiny black dots of excrement on leaves",
      "Upward-curling, deformed young leaves",
      "Scarred, rough patches on fruit skin",
    ],
    pesticides: [
      SUCCESS,
      BENEVIA,
    ],
    treatment: [
      "Hang blue sticky traps to monitor and reduce adults.",
      "Remove heavily damaged leaves and weeds nearby.",
      "Spray spinosad (Success) or cyantraniliprole (Benevia), targeting buds, flowers and leaf undersides.",
      "Follow the label interval and rotate between products to break the life cycle.",
    ],
    prevention: [
      "Use reflective silver mulch to repel adults.",
      "Keep plants well watered — drought stress favours thrips.",
      "Encourage predatory mites and minute pirate bugs.",
    ],
  },
  healthy: {
    label: "healthy",
    name: "Healthy Plant",
    healthy: true,
    severity: "none",
    summary: "No pest damage detected on this plant or fruit. Keep monitoring regularly.",
    symptoms: ["Upright, vigorous growth", "Glossy, firm fruit with no holes, scars or frass", "No wilting shoot tips"],
    pesticides: [],
    treatment: ["No treatment needed."],
    prevention: [
      "Inspect fruit and shoots weekly for entry holes.",
      "Harvest fruit at maturity to reduce borer attraction.",
      "Keep pheromone traps in place for early warning.",
    ],
  },
  healthy_leaf: {
    label: "healthy_leaf",
    name: "Healthy Leaf",
    healthy: true,
    severity: "none",
    summary: "No pest damage detected on this leaf. Your plant looks good.",
    symptoms: ["Even green colour", "No holes, curling or speckling", "No insects on undersides"],
    pesticides: [],
    treatment: ["No treatment needed."],
    prevention: [
      "Check leaf undersides weekly for insects.",
      "Water at the base and keep the canopy airy.",
      "Use sticky traps to catch problems early.",
    ],
  },
};

export function getPest(label: string): PestInfo {
  return (
    PESTS[label] ?? {
      label,
      name: label.replace(/_/g, " "),
      healthy: false,
      severity: "moderate",
      summary: "No information available for this class.",
      symptoms: [],
      pesticides: [],
      treatment: [],
      prevention: [],
    }
  );
}
