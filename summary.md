# EggplantCare: summary of today's work (2026-10-08)

Nothing is committed yet. All changes are saved on disk in this folder.

## What was changed

1. **New model.** Replaced the TensorFlow.js / Teachable Machine model with your `eggplant_model_float16.tflite`, run in the browser with LiteRT.js.
   - 6 classes: aphids, flea beetle, fruit & shoot borer, healthy, healthy leaf, thrips (`public/model/class_names.json`).
   - Preprocessing matches your training: resize to 224×224 (no crop), ImageNet mean/std, softmax.
   - Removed `@tensorflow/tfjs`, the old `model.json` / `weights.bin` / `metadata.json` and the old "eggplant gate".
   - `scripts/copy-litert-wasm.mjs` copies the LiteRT runtime into `public/litert/` on `npm install` (that folder is gitignored).
   - Checked in Chrome on 6 held-out test images: the browser gave the same top class as the Python reference on all 6. 5 of 6 were correct; the flea-beetle sample came out as aphids (99.8%), which is the model's own mistake.
2. **Camera.** Flash (torch) button and tap-to-focus on the live camera. Shown only if the phone's browser supports them. Tested with a fake camera on the computer, **not on a real phone yet**.
3. **Console noise.** LiteRT's routine startup messages (`INFO: Created XNNPACK delegate…`) no longer show up as errors in `next dev` (`quietLiteRtLogs` in `src/lib/model.ts`).
4. **Recommendations are now limited to what is sold or grown in the Philippines** (see the table below).
5. **Pesticide details modal.** Each recommended pesticide has a **"Why use this?"** button. The modal shows a photo, why it is a good choice, how to use it, where to find it, and a safety note for chemicals. It closes with Esc, the Close button, or a click outside.
6. **Other possibilities.** Each runner-up diagnosis is an expandable row with its own recommended pesticides and treatment steps. Rows at 10% or more start open; weaker ones start collapsed (`OPEN_ALTERNATIVE` in `ResultCard.tsx`).
7. **Removed** the pesticide photo gallery and the 12 pesticide photos I added earlier.
8. Home page now says "Healthy plant" and no longer mentions TensorFlow.js. README updated.

## Recommended pesticides (Philippines)

| Pest | Recommended | How well it is backed up |
|---|---|---|
| Aphids | Laundry soap spray (sabon panlaba); oregano leaf extract; cyantraniliprole (Benevia, FMC) | Benevia: FMC Philippines page and product sheet. Oregano: UPLB study (tested on stringbeans, not eggplant). Soap: common practice, no Philippine study. |
| Flea beetle | Langkawas (galangal) extract; cypermethrin (last resort) | Langkawas: UPLB trial, 100% flea-beetle mortality. Cypermethrin: see notes below. |
| Fruit & shoot borer | Chlorantraniliprole (Prevathon 5SC, FMC); cyantraniliprole (Benevia); spinosad (Success, Corteva) | All three confirmed on the makers' Philippine pages, with eggplant listed. |
| Thrips | Spinosad (Success); cyantraniliprole (Benevia) | Both confirmed on the makers' Philippine pages, with thrips and eggplant listed. |

Figures taken from the FMC Philippines product sheets (eggplant):
- **Prevathon 5SC**: FPA Reg. No. 598-393-4410, toxicity category 4. 10 ml per 16 L, every 5–7 days, pre-harvest interval 1 day.
- **Benevia**: FPA Reg. No. 598-485-4577, toxicity category 4. 30–40 ml per 16 L, every 7 days, pre-harvest interval 1 day, maximum 2 back-to-back sprays, then switch chemistry.
- **Success** (Corteva): the Philippine page lists eggplant, thrips and the fruit and shoot borer, but shows no rate or pre-harvest interval, so the app says to follow the label.

### Please note
- **Plant extracts have no official dose.** The amounts in the app (soap 20 g/L, oregano a cupful per liter, langkawas about 100 g per liter) are starting points I suggested, not figures from the studies. The app says so, and tells users to test on a few leaves first.
- **Cypermethrin** is there because a UPLB residue study (read only as a search summary, not opened) lists it among the sprays used on eggplant farms in Pangasinan. I could not confirm a specific product registered for eggplant, so the app tells users to check that the label lists eggplant.
- **Left out because I could not confirm local availability:** neem, kaolin clay, Bt, Beauveria, pyrethrins, emamectin benzoate. **Agrimek (abamectin)** was left out because Syngenta's Philippine page was blocked, so I could not check its eggplant row.
- I did not check the FPA registry directly. Brand names are examples only. Confirm with your local agri-vet store or municipal agriculturist before using any product.

## Photos in the modal
Only 3 pesticides have a photo (laundry soap, oregano, langkawas), all free-licensed from Wikimedia Commons with the author and license shown in the modal.

**Prevathon, Benevia, Success and cypermethrin have no photo.** I found no free-licensed product photos, and I did not copy the makers' marketing images. Those modals show a placeholder that says "No photo of this product yet" and the product name to look for.

To add a real photo: take a picture of the product at an agri-vet store (or use one you have permission for), save it as `public/pesticides/<name>.webp`, then add an `image: { src, alt, credit, license, licenseUrl, sourceUrl }` entry to that pesticide in `src/lib/pests.ts` (see `PESTICIDE_PHOTOS` for the format).

## Still to do
- **Commit.** The `.tflite` model (8.5 MB), `public/pesticides/`, `public/model/class_names.json` and `scripts/` must be committed before deploying, or the live site has no model.
- **Test on a phone** (`npm run dev:phone`): flash, tap-to-focus, and a few real eggplant photos plus a non-plant photo to check the "not an eggplant" message.
- **Flea beetle accuracy** looks weak in the one sample tested. Check `evaluate.py` results and add more flea-beetle photos if needed.
- **Add a `not_eggplant` class** when you retrain, so other plants and objects are rejected.
- **Product photos** for the four pesticides above.

## Run it
```bash
npm install
npm run dev     # http://localhost:3000
```

## Sources
- FMC Philippines, Prevathon 5SC: https://ag.fmc.com/ph/en/products/insecticides/prevathon-5sc-insect-control and product sheet https://ag.fmc.com/ph/sites/default/files/2023-09/Prevathon%205SC%20Product%20Details%20rev1%20-%20Copy.pdf
- FMC Philippines, Benevia: https://ag.fmc.com/ph/en/products/insecticides/benevia-insect-control and product sheet https://ag.fmc.com/ph/sites/default/files/2023-09/Benevia%20Product%20details%20rev1.pdf
- Corteva Philippines, Success: https://www.corteva.com/ph/mga-produkto-at-solusyon/product-finder/success.html
- UPLB organic vegetable pest products (langkawas, oregano): https://agris.fao.org/search/ar/records/6473a34e542a3f9f03b213c3
- UPLB pesticide residues in eggplant, Pangasinan: https://www.ukdr.uplb.edu.ph/journal-articles/5084
- FPA banned and restricted pesticides: https://fpa.da.gov.ph/resources/reports/list-of-banned-and-restricted-pesticides/
