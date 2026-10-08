export type Severity = "none" | "moderate" | "high";

export type Pesticide = {
  name: string;
  type: "Organic" | "Biological" | "Chemical";
  note: string;
};

export type PestImage = {
  src: string;
  alt: string;
  credit: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
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
      { name: "Neem oil (azadirachtin)", type: "Organic", note: "≈5 ml/L water + a few drops of liquid soap. Spray leaf undersides every 5–7 days." },
      { name: "Insecticidal soap", type: "Organic", note: "≈2% solution. Must contact the insects directly to work." },
      { name: "Beauveria bassiana", type: "Biological", note: "Fungal bio-insecticide; apply in the evening when humid." },
      { name: "Flonicamid or Acetamiprid", type: "Chemical", note: "Use only for heavy infestations, at label rate. Rotate modes of action." },
    ],
    treatment: [
      "Blast colonies off with a strong jet of water.",
      "Prune and destroy heavily infested shoots.",
      "Spray neem oil or insecticidal soap, covering leaf undersides.",
      "Escalate to a selective chemical only if populations keep rising after 2 sprays.",
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
      { name: "Neem oil", type: "Organic", note: "Acts as a repellent and feeding deterrent; reapply after rain." },
      { name: "Kaolin clay", type: "Organic", note: "Coats leaves with a protective film that deters feeding." },
      { name: "Spinosad", type: "Biological", note: "Effective on beetles; spray in the evening to protect bees." },
      { name: "Pyrethrins or Lambda-cyhalothrin", type: "Chemical", note: "For severe outbreaks only, at label rate. Highly toxic to bees and fish." },
    ],
    treatment: [
      "Cover young plants with floating row covers until flowering.",
      "Use yellow sticky traps near affected plants.",
      "Apply neem or kaolin clay to protect foliage.",
      "Spray spinosad if damage exceeds roughly 20–30% of leaf area on young plants.",
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
      { name: "Bacillus thuringiensis (Bt var. kurstaki)", type: "Biological", note: "Spray on young larvae before they bore in; repeat every 7 days." },
      { name: "Neem seed kernel extract (5%)", type: "Organic", note: "Deters egg-laying; best as a preventive spray." },
      { name: "Emamectin benzoate", type: "Chemical", note: "Effective on larvae. Follow label rate and pre-harvest interval." },
      { name: "Chlorantraniliprole", type: "Chemical", note: "Long-lasting larval control; rotate with other groups to avoid resistance." },
    ],
    treatment: [
      "Cut and destroy wilted shoots and bored fruit weekly — burn or bury deep, never compost.",
      "Install pheromone traps (~100/ha) to capture male moths.",
      "Spray Bt or neem at the first sign of damage.",
      "Use emamectin benzoate or chlorantraniliprole for heavy infestation, respecting the pre-harvest interval.",
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
      { name: "Neem oil", type: "Organic", note: "Spray every 5–7 days, covering growing tips and flowers." },
      { name: "Spinosad / Spinetoram", type: "Biological", note: "Among the most effective options for thrips. Spray in the evening." },
      { name: "Beauveria bassiana", type: "Biological", note: "Bio-insecticide; works best in humid conditions." },
      { name: "Abamectin or Cyantraniliprole", type: "Chemical", note: "For severe infestations, at label rate. Rotate modes of action." },
    ],
    treatment: [
      "Hang blue sticky traps to monitor and reduce adults.",
      "Remove heavily damaged leaves and weeds nearby.",
      "Spray spinosad or neem, targeting buds, flowers and leaf undersides.",
      "Repeat 2–3 times at 5–7 day intervals to break the life cycle.",
    ],
    prevention: [
      "Use reflective silver mulch to repel adults.",
      "Keep plants well watered — drought stress favours thrips.",
      "Encourage predatory mites and minute pirate bugs.",
    ],
  },
  healthy_fruit: {
    label: "healthy_fruit",
    name: "Healthy Fruit",
    healthy: true,
    severity: "none",
    summary: "No pest damage detected on this fruit. Keep monitoring regularly.",
    symptoms: ["Glossy, firm skin", "No holes, scars or frass", "Uniform colour"],
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
