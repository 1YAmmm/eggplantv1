# ESP32-CAM firmware (Wi-Fi relay, with a built-in setup page)

Makes an **AI-Thinker ESP32-CAM** (on its **CAM-MB** USB base) a photo source for the app. The camera cannot be reached
from a phone's browser, so it calls your site: it sends small preview photos while a phone is looking, and one bigger
photo when the phone presses **Capture**. It works with Android and iPhone because the phone only talks to your site.

**Your Wi-Fi, the site address and the camera code are not in the code.** You type them into the camera's own setup page
from your phone, and the camera remembers them. To change the Wi-Fi later (new router, moving to the farm) you do not
need a computer or a new upload.

> **Status:** the server and the app were tested end to end with a simulated camera, and this sketch **compiles** for the
> AI Thinker ESP32-CAM with Arduino-ESP32 3.3.12 (no errors, no warnings). It has **not been run on a real ESP32-CAM
> yet**: expect to tune the photo sizes and fix small things in the first session.

## What you need

- ESP32-CAM + CAM-MB base + a micro-USB **data** cable (not charge-only) and a computer to flash it once.
- Wi-Fi with **internet**, **2.4 GHz** only. A phone hotspot works.
- Your site deployed with the camera relay set up (step 1).

## 1. Set up the site once

1. In Vercel: open the project > **Storage** (or Marketplace) > add **Upstash Redis** (free plan) and connect it to the
   project for Production. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (among others) for you; the site uses those
   two as they are.
2. Make a camera code (16 to 128 characters: letters, numbers, `-` and `_`):
   ```
   node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
   ```
3. In Vercel > Settings > Environment Variables add `ESP32_CAM_CODES` = that code (several codes: separate with commas).
4. Redeploy so the new variables apply.

## 2. Flash the camera (once)

1. Install the **Arduino IDE 2.x**. In Boards Manager install **esp32 by Espressif Systems** (3.x).
2. Put the sketch in a folder with the same name as the `.ino` file: `esp32cam-wifi/esp32cam-wifi.ino`. Copy
   `config.example.h` next to it and rename the copy to `config.h`. You do not have to edit it (optionally set
   `SERVER_URL` so the setup page starts with your site address filled in).
3. Tools > Board > **AI Thinker ESP32-CAM**. There is no PSRAM option to set: for this board the PSRAM is always on.
   (If the Serial Monitor ever says "no PSRAM found", the wrong board is selected.)
4. Seat the ESP32-CAM on the CAM-MB and plug the USB cable into your computer. Choose its port under Tools > Port. If
   Windows shows no port, install the **CH340** driver.
5. Upload. If it stops at "Failed to connect", hold the base board's **IO0** button, tap **RST**, release IO0 and
   upload again (button names differ by base board). After a successful upload press **RST** once.

## 3. Set up the camera from your phone

The first time (nothing saved yet) the camera makes its own Wi-Fi and the small red LED on its back **blinks**.

1. On your phone join the Wi-Fi **`EggplantCam-xxxx`** (the last 4 characters differ per camera). Password:
   **`eggplant-setup`**. The setup page opens by itself; if not, open `http://192.168.4.1`.
2. Pick your **Wi-Fi network** from the list of networks the camera can see (it only sees 2.4 GHz ones, so you cannot pick
   a 5 GHz network by mistake) and type its password. A second network is optional: add your phone's hotspot there and the
   camera uses whichever it finds. A hidden network: leave the list on "not in the list" and type its name.
3. Type the **site address** (for example `https://your-app.vercel.app`) and the **camera code** from step 1.
4. Tap **Save and restart**. Your phone goes back to its normal Wi-Fi. The Serial Monitor (115200 baud) shows the Wi-Fi
   connection, "Clock: set" and then `Mode: preview` as soon as a phone opens the scanner.

### Opening the setup page again

| How | When to use it |
|---|---|
| Nothing to do | The camera cannot join any saved Wi-Fi for about **90 seconds** (new router, you moved), so it opens the setup page by itself. If nobody uses it within 10 minutes it restarts and tries the saved networks again. |
| Press **RST 3 times** within a few seconds | You want to change something (a new camera code, another Wi-Fi). |
| Type `setup` in the Serial Monitor | Same, from a computer. `forget` erases everything saved. |

Leave the password boxes and the camera code empty to keep what is saved.

## 4. Use it

On the phone open the site, tap **ESP32 camera**, type the same camera code, and tap **Scan with ESP32 camera**.
"Waking the camera..." can take up to 10 seconds (the camera checks in every 10 s while nobody is looking). Aim using
the preview, then tap **Capture**.

## Power

The ESP32-CAM needs a **stable 5 V and at least 500 mA**. A phone charger or a power bank into the CAM-MB works in the
field. Weak USB ports and long thin cables are the usual cause of random reboots.

## Good to know

- **Security of the setup page:** it is only open in setup mode, behind the Wi-Fi password above (change it with
  `SETUP_AP_PASSWORD` in `config.h`; it is public in this repository, so change it if others are near). It never shows the
  saved camera code or Wi-Fi password. The settings are stored in the camera's flash memory in plain text, as they would be
  in code, so someone who holds the camera and a computer could read them: keep the camera code secret and change it (in
  the setup page and in `ESP32_CAM_CODES`) if you lose a camera.
- **Data use:** while previewing through a phone hotspot, about 70 MB per hour (photos go up from the camera and down
  to the phone). Nothing is sent while nobody is scanning except a tiny heartbeat every 10 s.
- **Free plan:** the idle heartbeat is about 1 Upstash command every 10 s, so about 260,000 a month if the camera is
  left powered 24/7 (the free plan allows 500,000). Switch it off when you are not using it.
- **Privacy:** photos wait on your server for about a minute and are not logged or kept. The camera code decides who
  can see them.
- **Focus:** the lens is fixed-focus. Twist the lens ring by hand until a leaf about 15 to 30 cm away is sharp.
- **Photo sizes:** `PREVIEW_SIZE` / `CAPTURE_SIZE` and the two quality numbers are at the top of the sketch. Higher
  quality numbers mean smaller, rougher photos. The pest model only looks at 224x224 pixels, so bigger is rarely needed.
- **Old `config.h`:** an earlier version of this project kept the Wi-Fi list and camera code in `config.h`. Those lines are
  now ignored (the old file still compiles). Replace it with the new `config.example.h` when convenient.

## Testing against your own computer first

1. On the setup page use `http://<your computer's Wi-Fi address>:3000` as the site address (find the address with
   `ipconfig`); plain http is fine for this test.
2. In the project run `npm run dev -- -H 0.0.0.0` with `ESP32_CAM_CODES` set to your camera code (for example in
   `.env.local`). Without Upstash the dev server keeps photos in memory, which is fine here.
3. Allow port 3000 through Windows Firewall for private networks, and keep the camera and the computer on the same Wi-Fi.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| No `EggplantCam-xxxx` Wi-Fi appears | The red LED should blink in setup mode. Press RST 3 times, or type `setup` in the Serial Monitor. Power problems also stop it (see below). |
| The setup page does not open by itself | Open `http://192.168.4.1` in the phone's browser. Some phones keep using mobile data: turn it off for a moment. |
| `Brownout detector was triggered`, reboot loops | Weak power. Use a better cable/charger/power bank. Last resort: uncomment `DISABLE_BROWNOUT_DETECTOR` in `config.h`. |
| `Camera init failed: 0x105` / `0x20001` | Board seated badly, or the wrong board selected. Reseat it and check Tools > Board is "AI Thinker ESP32-CAM". |
| `Wi-Fi: connecting...` then setup mode opens | Wrong password, a 5 GHz-only network, or (iPhone hotspot) "Maximize Compatibility" is off. |
| `Clock: not set` then `Connection failed` | No internet on that Wi-Fi, or NTP is blocked. HTTPS needs the real time. |
| `Connection failed: connection refused` with HTTPS | The site's certificate does not chain to the roots in `config.h` (custom domain with another CA). Add that CA's root certificate. |
| `Server: wrong camera code` | The code in the setup page differs from `ESP32_CAM_CODES` on the site, or the site was not redeployed. Press RST 3 times and fix it. |
| `Server: ... relay is not set up` | `ESP32_CAM_CODES` or Upstash is missing on the site. |
| App stays on "Waking the camera..." | The camera is off, not on Wi-Fi, or the codes differ. Check the Serial Monitor. |
| Photos are dark, green or blurry | Wait a second after a size change, add light, twist the lens to focus. |
