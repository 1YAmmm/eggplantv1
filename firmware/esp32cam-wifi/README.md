# ESP32-CAM firmware (Wi-Fi relay, with a built-in setup page)

Makes an **AI-Thinker ESP32-CAM** (on its **CAM-MB** USB base) a photo source for the app. The camera cannot be reached
from a phone's browser, so it calls your site: it sends small preview photos while a phone is looking, and one bigger
photo when the phone presses **Capture**. It works with Android and iPhone because the phone only talks to your site.

**Your Wi-Fi, the site address and the camera code are not in the code.** You type them into the camera's own setup page
from your phone, and the camera remembers them. To change the Wi-Fi later (new router, moving to the farm) you do not
need a computer or a new upload.

> **Status:** this sketch compiles for the AI Thinker ESP32-CAM with Arduino-ESP32 3.3.12 (no errors, no warnings) and has
> been **run on a real AI-Thinker ESP32-CAM on a CAM-MB**: it joined a home Wi-Fi, kept its settings across uploads and
> restarts, and sent a preview (about one photo a second) and a Capture photo (arriving in about 2-4 s) to the site on
> Vercel, which the relay returned byte for byte. Not tried yet: the setup page and 3x RST from a phone, an iPhone or
> Android phone using the app with it, the Wi-Fi of a phone hotspot, and photos of a real eggplant at a good distance with
> the lens focused. The sharpest-of-3 Capture and the 600 ms settle time (see "Photo sizes") compile but have not been run
> on the board yet.

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
4. Under **Light**, choose what the bright white LED next to the lens does: **off** (daylight, outdoors), **only when the
   Capture photo is taken**, or **on whenever a phone is looking** (dim rooms; the preview is lit too). This is the camera's
   own default: while the scanner is open, the app's **Flash** button (top of the viewfinder) switches the LED on or off and
   wins, for the Capture photo too. It shows whether the LED is really lit, as the camera reports it. When the scanner is
   closed, the camera goes back to this setting.
5. Tap **Save and restart**. Your phone goes back to its normal Wi-Fi. The Serial Monitor (115200 baud) shows the Wi-Fi
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
- **Data use:** a preview photo is about 12-25 KB and the camera sends roughly one a second (measured: 46 in 60 s), so
  while previewing through a phone hotspot expect about 100 MB per hour (photos go up from the camera and down to the
  phone). A Capture photo is about 35-100 KB, once. Nothing is sent while nobody is scanning except a tiny heartbeat every
  10 s.
- **Lag in the live picture:** the picture you see is a photo that went camera -> server -> database -> phone, so it is always
  1-3 s old and moves about once a second. Most of that time is distance: the Serial Monitor prints
  `Preview sent: ... camera X ms + upload Y ms`, and **Y** is the round trip to the server. If Y stays above about 600 ms,
  check that the site's functions run near you and that the Upstash database is in the same area (see the main README, "Speed
  depends on where the server runs"). Y near 150-300 ms feels live. Measured with the server in Washington DC: a 12-15 KB
  preview took about 0.95 s to upload, and making the photo rougher did not make it faster, so the photo size is not the
  problem.
- **Free plan:** the idle heartbeat is about 1 Upstash command every 10 s, so about 260,000 a month if the camera is
  left powered 24/7 (the free plan allows 500,000). Switch it off when you are not using it.
- **Privacy:** photos wait on your server for about a minute and are not logged or kept. The camera code decides who
  can see them.
- **Getting a clear photo (this matters more than any setting):** the lens has **no autofocus**. A blurry picture almost
  always means one of these:
  1. **Too close.** Keep the leaf or fruit about 15 to 30 cm from the lens; at 5 cm nothing can be sharp.
  2. **Focus ring.** Hold the board still and slowly twist the lens barrel by hand (a drop of rubber or tape helps if it is
     stiff) while watching the **Focus** number at the bottom of the app's viewfinder, with a leaf at your working
     distance. Stop where the number is highest (it lags about a second behind the lens). Around 60-80 is typical for a
     sharp leaf; below about 36 the app shows "Blurry". A smooth fruit scores lower than a hairy leaf, so compare numbers
     on the same subject.
  3. **Film on the lens.** New modules often have a thin plastic film over the lens: peel it off.
  4. **Light.** Dim rooms mean a long exposure (blur) and grain. Use daylight, or set **Light** to *on whenever a phone is
     looking* on the setup page to use the white LED. Very close to a shiny leaf the LED can glare: then choose *only for
     Capture* or *off*.
  5. **Power or loose ribbon.** Horizontal coloured streaks, or `SCCB_Write Failed` at start-up, point to a weak power
     supply or a camera ribbon that is not fully seated (lift the black clip, push the ribbon in, press the clip down).
- **Photo sizes:** `PREVIEW_SIZE` (VGA 640x480) and `CAPTURE_SIZE` (XGA 1024x768) with their quality numbers are at the top
  of the sketch; both are 4:3, so the preview shows what the capture will show. Higher quality numbers mean smaller,
  rougher photos. The pest model looks at 224x224 pixels, but small pests (aphids, thrips) only survive that downscale if
  the photo is sharp, and the AI second opinion looks at the photo at about 768 px. The app keeps the centre square of the
  Capture photo (768x768, what the viewfinder shows), because the model was trained on square photos. The Serial Monitor
  prints the real size: `Capture sent: 1024x768, 48211 bytes (sharpest of 3), ...`.
- **Capture photo quality:** before the Capture photo the sensor gets `CAPTURE_SETTLE_MS` (600 ms) to settle its exposure
  and white balance at the bigger size, then it takes `CAPTURE_FRAMES` (3) photos and sends the biggest JPEG: at the same
  quality setting, a sharper, steadier photo compresses less. Together this adds about 1 s to a Capture. Both can be
  changed in `config.h`.
- **Sensor clock:** `CAMERA_XCLK_HZ` defaults to 10 MHz (less electrical noise than 20 MHz, plenty for one photo a second).
  The frame buffers are reserved for the biggest size at start-up; without that the driver prints `cam_hal: FB-OVF` and
  large photos are damaged.
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
| `Wi-Fi: connecting...` then setup mode opens | Wrong password, a 5 GHz-only network, or (iPhone hotspot) "Maximize Compatibility" is off. The Serial Monitor now says which (next three rows). |
| `Wi-Fi: saved network "x" was NOT seen` | The camera's scan (listed just above, strongest first, your saved one marked `<== SAVED`) does not contain your network: it is out of range, 5 GHz only, switched off or hidden, or the name differs (capital letters and spaces count). Pick it from the list on the setup page instead of typing it. |
| `Wi-Fi: not connected, code 202 ...` (or 15, 204) | The router was found but refused the password. Retype it on the setup page. Code 201 means the router was not found, 200 or 2 a signal too weak, 203 or 5 the router refused the camera (full, or a MAC filter). |
| `Wi-Fi: the camera sees 0 network(s)` | Nothing in range, or a power or antenna problem. Move closer to the router and use a better supply. |
| `Clock: not set` then `Connection failed` | No internet on that Wi-Fi, or NTP is blocked. HTTPS needs the real time. The camera stops its time lookup and tries again about once a minute (an earlier version crashed with `Required to lock TCPIP core` and rebooted here). |
| `Connection failed: connection refused` with HTTPS | The site's certificate does not chain to the roots in `config.h` (custom domain with another CA). Add that CA's root certificate. |
| `Server: wrong camera code` | The code in the setup page differs from `ESP32_CAM_CODES` on the site, or the site was not redeployed. Press RST 3 times and fix it. |
| `Server: ... relay is not set up` | `ESP32_CAM_CODES` or Upstash is missing on the site. |
| The picture jumps between two different views, the Flash button does not match the LED, or the camera never goes idle | **Two cameras (or a test program) are using the same camera code**, so their photos mix on the server and a Capture is answered by whichever asks first. Switch one of them off, or give each its own code (`ESP32_CAM_CODES` takes several, comma-separated, and each camera's setup page holds its own). To check: put one camera in setup mode (type `setup` in the Serial Monitor); if photos keep arriving in the app, another one is sending. |
| App stays on "Waking the camera..." | The camera is off, not on Wi-Fi, or the codes differ. Check the Serial Monitor. |
| Photos are dark, green or blurry | Add light, and twist the lens until the app's Focus number peaks. Capture photos darker than the preview: set `CAPTURE_SETTLE_MS` to 1500 in `config.h`. |
