export type Severity = "none" | "moderate" | "high";

export type Pesticide = {
  name: string;
  type: "Organic" | "Biological" | "Chemical";
  note: string;
};

export type PestInfo = {
  label: string;
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
