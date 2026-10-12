# EggplantCare — Eggplant Pest Scanner

Next.js app that identifies eggplant pests from a photo and recommends pesticides and treatment.
Inference runs fully in the browser with [LiteRT.js](https://ai.google.dev/edge/litert/web) using the TFLite model in `public/model/`.

Detects: aphids, flea beetle, fruit & shoot borer, thrips, healthy leaf, healthy plant.

## Run

```bash
npm install          # also copies the LiteRT.js WASM runtime into public/litert/
npm run dev          # http://localhost:3000
```

### Use on your phone

Live camera access requires HTTPS. Start the dev server on your network with a self-signed certificate:

```bash
npm run dev:phone
```

Then open `https://<your-computer-ip>:3000` on your phone (same Wi-Fi) and accept the certificate warning.
The "Upload photo" button opens the phone's media picker (gallery, files, and usually a camera option). Over plain HTTP the
live camera is not available, so "Scan with camera" opens the phone's camera app directly instead.

## Chatbot

After a scan, a floating chat button appears at the bottom-right (it is not shown before a scan). The chat knows the scan result and the pests and pesticides in
`src/lib/pests.ts`, and replies in English or Tagalog. Photos stay on the device; only the typed questions and the
scan labels (for example "aphids 87%") are sent to the AI service.

1. Get a free API key from Google AI Studio (`GEMINI_API_KEY`). Optionally also from Groq (`GROQ_API_KEY`) and
   OpenRouter (`OPENROUTER_API_KEY`) as backups, see `.env.example`.
2. Copy `.env.example` to `.env.local` and fill in the keys (restart `npm run dev`).
3. On Vercel, add the same variables under Project Settings > Environment Variables, then redeploy.

Without a key the chat shows "The chat is not set up yet" and the rest of the app works as before. Free tiers have
daily request limits (Gemini counts them per model; some models allow only about 20 requests a day), so
`src/app/api/chat/route.ts` tries the providers in order (Gemini, then Groq, then OpenRouter; a provider without a key
is skipped), and each provider's list of models in order (`GEMINI_MODEL` etc., comma-separated). It also limits each
visitor to 20 questions per 10 minutes. When every provider is out of quota the chat says the assistant is busy until
the quota resets.

## AI second opinion and suggested treatment plan

Two more AI features sit next to the on-device model. Both use free tiers and are always on for visitors (there is no
switch); without API keys they simply do nothing and the app works as before. They use different providers from the chat: **Cloudflare Workers AI**, **Cohere** and **Mistral**
(`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`, `COHERE_API_KEY`, `MISTRAL_API_KEY`; see `.env.example`). The
Cloudflare token needs the **Workers AI** permission (the "Workers AI" API token template).

- **Second opinion on the photo** (`/api/recognize`). The on-device model answers first. When it is unsure (below 60%),
  or says aphids or flea beetle (the model mixes these up, even when it is very sure), a small copy of the photo
  (768 px JPEG, about 100 KB) is sent to **Llama 4 Scout** on Cloudflare, which confirms the result, corrects it, or says
  the photo shows no eggplant. If Scout is down, Mistral Small 3.1 (also Cloudflare) answers, but a backup can only
  confirm the on-device result, never overrule it. The page footer tells visitors that a small copy of the photo is sent
  when the result is unsure. Set `NEXT_PUBLIC_ASSIST_MODE=always` to ask on every scan.
  A photo the colour check rejected gets an "Ask an AI to double-check" button.
- **Suggested treatment plan** (`/api/advice`). For a diagnosed pest, an AI writes a short plan (what was found, which products
  to use and why, steps, what to watch for, spray schedule). It may only choose products from the verified list in
  `src/lib/pests.ts`: `validateAdvice` in `src/lib/advice.ts` rejects any reply that names another product or contains a
  dose, interval or duration that is not in that data, and then the next AI is tried. Doses on the cards always come from
  `pests.ts`. Only the pest name is sent. Plans are cached for 24 hours per pest.
- **When the AI is unavailable** (out of free quota, down, rate-limited, or a reply that fails the checks), the page keeps
  the on-device result and the static advice from `pests.ts`; nothing breaks. After every AI reports "busy", the server
  stops trying for 5 minutes.

Which AI does what was decided by a benchmark, not by guess. On 20 labelled photos (`public/pests/`, 5 per pest), photo
accuracy was: Llama 4 Scout 20/20, Mistral Small 3.1 13/20, Cohere Command A Vision 12/20 (0/5 thrips), Ministral 8B
2/20. A vote between several AIs scored worse than Scout alone (9/20 right), so there is no voting. For the treatment
plan on 4 pests, Scout, Llama 3.3 70B, Mistral Small 3.1 and gpt-oss-120b passed the checker on all four; Cohere passed 3
of 4 and Ministral 8B 2 of 4. The sample is small (clean web photos, no healthy plants), so re-run it before trusting the
numbers for more than a choice of default. Override the models with `CLOUDFLARE_VISION_MODEL`, `CLOUDFLARE_ADVICE_MODEL`,
`COHERE_VISION_MODEL`, `MISTRAL_VISION_MODEL` and so on, and the models allowed to overrule the on-device result with
`VISION_TRUSTED_MODELS`.

Free-tier limits to keep in mind: Cloudflare gives 10,000 neurons a day for all its models together (stay on the free plan,
not Workers Paid, so it stops instead of billing); the Cohere trial key allows 1,000 calls a month; `mistral-small-latest`
and `mistral-medium-latest` are blocked on Mistral's free plan, so Mistral is only a last-resort advice writer
(`ministral-8b-latest`). Each visitor is limited to 12 photos and 15 plans per 10 minutes.

Run the checks for the AI logic with `npm test` (no network needed).

## ESP32-CAM as a photo source

Under the camera buttons the user picks **Phone camera** or **ESP32 camera**. An ESP32-CAM cannot be reached from a
phone's browser (the site is HTTPS, the camera is not), so it **uploads its photos to this server** and the phone
fetches them from there. This works on Android and iPhone. Both the camera and the phone need internet; a phone hotspot
(2.4 GHz) is fine for the camera. The on-device pest model is unchanged: the photo just arrives as a canvas.

- The camera calls `POST /api/cam/device` (a heartbeat every ~10 s while idle, a small preview about once a second
  while a phone is looking, one bigger photo for **Capture**). The answer tells it what to send next.
- The phone calls `GET /api/cam/frame` for the live preview and `POST` / `GET /api/cam/capture` for the Capture photo.
- Photos wait about a minute in **Upstash Redis** (free; Vercel > Storage / Marketplace sets `KV_REST_API_URL` and
  `KV_REST_API_TOKEN`, and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` work too). `npm run dev` without them
  keeps photos in memory instead.
- `ESP32_CAM_CODES` lists the camera codes that may use the relay (16 to 128 characters, comma-separated); the same code
  goes into the camera's setup page and into the app on the phone. Without it the routes answer 503, and unknown codes get 401.
- The camera has no settings in its code: its own setup page (a Wi-Fi called `EggplantCam-xxxx`, opened from a phone) holds
  the Wi-Fi networks, the site address and the camera code, so changing them needs no computer.
- Flashing, wiring and troubleshooting: [`firmware/esp32cam-wifi/README.md`](firmware/esp32cam-wifi/README.md).

## Structure

- `public/model/` — `eggplant_model_float16.tflite` (MobileNetV3, from `ml/scripts/export_to_tflite.py`) and `class_names.json`
- `src/lib/model.ts` — model loading + preprocessing (resize to 224×224, ImageNet mean/std normalisation, softmax)
- `scripts/copy-litert-wasm.mjs` — copies the LiteRT.js runtime to `public/litert/` on `npm install`
- `src/lib/pests.ts` — pest info, pesticides, treatment and prevention, plus photo credits
- `public/pesticides/` — photos for the pesticide details modal (author and licence shown in the modal); to add a product photo, save it here and set `image` on that pesticide in `src/lib/pests.ts`
- `src/components/Scanner.tsx` — camera / upload UI
- `src/components/ResultCard.tsx` — diagnosis and treatment display
- `src/components/ChatBox.tsx` — the chat UI; `src/app/api/chat/route.ts` calls the AI provider; `src/lib/chat.ts` validates requests and builds the system prompt
- `src/lib/ai/providers.ts` — the AI providers and models for chat, photo second opinion and treatment plan, with retries and fallback
- `src/lib/assist.ts`, `src/lib/secondOpinion.ts`, `src/app/api/recognize/route.ts` — the photo second opinion (decision logic, browser side, server side)
- `src/lib/advice.ts`, `src/lib/useAdvice.ts`, `src/app/api/advice/route.ts` — the suggested treatment plan (prompt and checker, browser side, server side)
- `src/lib/camRelay.ts`, `src/lib/camStore.ts`, `src/lib/camRoute.ts`, `src/app/api/cam/` — the ESP32-CAM relay (rules, storage, shared route helpers, the three routes); `src/lib/useEsp32Camera.ts`, `src/lib/camPrefs.ts` and `src/components/SourcePicker.tsx` — the phone side
- `firmware/esp32cam-wifi/` — the Arduino sketch for the ESP32-CAM
- `tests/` — `npm test` runs the unit tests for `assist.ts`, `recognize.ts`, `advice.ts` and the camera relay (`camRelay.ts`, `camStore.ts`)

To update the model, copy the new `.tflite` and `class_names.json` from `ml/models/tflite/` into `public/model/`.
The model must take `[1, 224, 224, 3]` float32 (ImageNet-normalised) and output one logit per class.
If you add classes, add matching entries in `src/lib/pests.ts`.

## Pesticide pictures

Each recommended pesticide shows a picture on its card (tap it to open the details). The plant extracts use free-licensed
photos, and cypermethrin and cyantraniliprole use product photos from sellers' listings (`public/pesticides/`, credit
shown in the details; tall bottle photos use `fit: "contain"` so the whole pack shows). The cyantraniliprole photo is
Awiner Biotech's cyantraniliprole + chlorfenapyr pack, not Benevia, and the chlorantraniliprole photo is Agway Elicor
5SC, not Prevathon, and the spinosad photo is Fertilome Spinosad Plus, a US garden bait, not Success (the credit line
in the modal says so each time). A product with no photo gets a bottle drawn by `src/components/ProductIllustration.tsx`,
captioned "Illustration only".
To use a real photo, save it as `public/pesticides/<name>.webp` and add an `image` entry to that pesticide in
`src/lib/pests.ts` (see `PESTICIDE_PHOTOS`); only use photos you took or have permission for.

## Where to buy (nearest agricultural shop)

"Where to buy" on a result asks the user to turn on Location (GPS) and tap **Find nearest shop**. The browser then asks
for permission, and `src/components/NearbyShops.tsx` calls `/api/shops`, which lists the 5 nearest agricultural shops,
nearest first and measured in metres from the exact GPS position, with a Directions link and a Google Maps search
link. The nearest shop is always shown first; after it, poultry/egg/grain outlets are skipped (`src/lib/shops.ts`), and
if the nearest itself is one, it is marked "ask if they sell crop pesticides".

Two data sources:

1. **Google Places API (New)**, used when `GOOGLE_PLACES_API_KEY` is set (`src/lib/places.ts`). It is much more complete
   for small agri-vet shops in the provinces, but needs a Google Cloud project with billing enabled (see `.env.example`
   for the steps). Only name, address, location and open/closed status are requested, which Google bills at the Pro
   tier: 5,000 free calls a month, about $32 per 1,000 after. `GOOGLE_PLACES_DAILY_LIMIT` (default 150 a day, about
   4,500 a month) stops the app from going over, and you should also set a quota in Google Cloud. Google forbids caching
   its results, so none are cached, and "Google Maps" is shown as the source.
2. **OpenStreetMap (Overpass API, no key)**, used when there is no Google key, the daily limit is reached or Google
   fails. It looks within 10 km first (so the shop only metres away is never cut off) and widens to 40 km when fewer
   than 5 are found. It only knows shops that volunteers have mapped, so it finds fewer small agri shops.

- Location only works on https (or localhost), so on a phone use `npm run dev:phone` or the deployed site.
- The public Overpass servers are shared and sometimes busy; those lists are cached per ~100 m and three servers are
  tried in turn. Set `OVERPASS_URL` (comma-separated) to use your own.
- Each visitor is limited to 10 searches per 10 minutes. The location is used for the search only and is not saved.
- Click limits on the page (`src/lib/clickLimit.ts`) stop rapid clicking before a request is even sent: **Find nearest
  shop** waits 10 seconds between searches and the chat allows 6 questions a minute, both with a visible countdown. The
  server-side limits above stay as the second layer.

## Lighting warnings

Photos that are too dark or too bright lower accuracy (on the test set, artificially darkening or brightening the same
photos took it from 92% to about 80% when very dark, 86% when bright and 70% when washed out).

- `src/lib/lighting.ts` — measures the average brightness (and the share of near-white pixels) of a photo. Below
  `TOO_DARK` or above `TOO_BRIGHT` / `GLARE_SHARE` it reports "dark" or "bright". The limits sit just outside the
  brightness range of the training photos (none of the 300 test photos is flagged); tune them there if real phone
  photos trigger it too often or too rarely.
- Live camera: `src/lib/useLiveLighting.ts` checks the preview twice a second and `Scanner.tsx` shows an amber hint on
  the camera view ("Too dark. Move to a brighter spot or turn on Flash.") until the light is fixed.
- On the result: `src/components/LightingNotice.tsx` shows the same warning with the result, which also covers photos
  picked from the gallery.

## "No eggplant detected"

The model only knows its trained classes, so two layers keep it from labelling faces or objects as pests:

1. **Plant colour check** (`src/lib/plantCheck.ts`) — before the model runs, images with less than
   15% leaf-green / eggplant-purple pixels are rejected. Tune `MIN_PLANT_RATIO` if needed.
2. **`not_eggplant` class** — retrain with a class named `not_eggplant`
   (faces, hands, soil, sky, other plants…). The app treats it as "No eggplant detected" automatically.
