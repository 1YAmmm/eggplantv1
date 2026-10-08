# EggplantCare — Eggplant Pest Scanner

Next.js app that identifies eggplant pests from a photo and recommends pesticides and treatment.
Inference runs fully in the browser with TensorFlow.js using the Teachable Machine model in `public/model/`.

Detects: aphids, flea beetle, fruit & shoot borer, thrips, healthy leaf, healthy fruit.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

### Use on your phone

Live camera access requires HTTPS. Start the dev server on your network with a self-signed certificate:

```bash
npm run dev:phone
```

Then open `https://<your-computer-ip>:3000` on your phone (same Wi-Fi) and accept the certificate warning.
The "Take / upload photo" button works over plain HTTP too — it opens the phone's camera app directly.

## Structure

- `public/model/` — Teachable Machine export (`model.json`, `weights.bin`, `metadata.json`)
- `src/lib/model.ts` — model loading + preprocessing (center-crop 224×224, normalise to [-1, 1])
- `src/lib/pests.ts` — pest info, pesticides, treatment and prevention
- `src/components/Scanner.tsx` — camera / upload UI
- `src/components/ResultCard.tsx` — diagnosis and treatment display

To update the model, replace the three files in `public/model/`. If you add classes, add matching entries in `src/lib/pests.ts`.

## "No eggplant detected"

The model only knows its trained classes, so two layers keep it from labelling faces or objects as pests:

1. **Plant colour check** (`src/lib/plantCheck.ts`) — before the model runs, images with less than
   15% leaf-green / eggplant-purple pixels are rejected. Tune `MIN_PLANT_RATIO` if needed.
2. **`not_eggplant` class** — retrain in Teachable Machine with a class named `not_eggplant`
   (faces, hands, soil, sky, other plants…). The app treats it as "No eggplant detected" automatically.
