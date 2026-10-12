/*
 * EggplantCare ESP32-CAM (AI-Thinker) - Wi-Fi relay with a built-in setup page
 *
 * The camera cannot be reached from a phone's browser (the site is HTTPS, the camera is not), so it calls the site
 * instead. It keeps asking POST /api/cam/device what to do:
 *   idle     nobody is looking: send an empty heartbeat every ~10 s
 *   preview  a phone is looking: send a small JPEG about once a second
 *   capture  the phone pressed Capture: send one bigger JPEG tagged with the id it was given
 * Each answer is a tiny JSON like {"want":"preview","nextMs":500}; it says what the NEXT request should carry and
 * how long to wait before sending it.
 *
 * Settings (Wi-Fi networks, site address, camera code) are NOT compiled in. They are typed into the camera's own setup
 * page and kept in its flash memory. The camera opens that page (a Wi-Fi called "EggplantCam-xxxx") when
 *   - nothing is saved yet,
 *   - it cannot reach any saved Wi-Fi for ~90 seconds,
 *   - the RST button is pressed 3 times within a few seconds, or
 *   - you type "setup" in the Serial Monitor ("forget" erases everything).
 *
 * Written for the Arduino-ESP32 3.x board package. Board: "AI Thinker ESP32-CAM" (its PSRAM is always on: this board has
 * no PSRAM option in the Tools menu). See README.md.
 */
#include <Arduino.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiMulti.h>
#include <time.h>

#include "esp_camera.h"

/* Arduino-ESP32 3.x has its own global called `Network`. The first version of config.h in this project declared
 * `struct Network` (a Wi-Fi list that is no longer used); renaming it here lets such an old file still compile. */
#define Network OldConfigNetwork
#include "config.h"
#undef Network

#ifdef DISABLE_BROWNOUT_DETECTOR
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"
#endif

// ---- Camera pins: AI-Thinker ESP32-CAM ----
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22
#define FLASH_LED_GPIO_NUM 4    // the bright white flash LED
#define STATUS_LED_GPIO_NUM 33  // the small red LED on the back (lit when LOW); blinks in setup mode

#ifndef SETUP_AP_PASSWORD
#define SETUP_AP_PASSWORD "eggplant-setup"  // at least 8 characters
#endif

// ---- Photo sizes. JPEG quality is 0-63: LOWER means better quality and a bigger file. ----
// The app squeezes every photo to 224x224 for the pest model, so these are for looking at and for the AI second opinion.
static const framesize_t PREVIEW_SIZE = FRAMESIZE_QVGA;  // 320x240, a few KB: only for aiming
static const int PREVIEW_QUALITY = 15;
static const framesize_t CAPTURE_SIZE = FRAMESIZE_SVGA;  // 800x600, roughly 40-70 KB
static const int CAPTURE_QUALITY = 12;

/** Wait this long between requests until the server says otherwise. */
static const uint32_t DEFAULT_WAIT_MS = 10000;
/** Restart after this many failed requests in a row (about 10 minutes). */
static const int MAX_FAILURES = 30;
/** How long to look for a saved Wi-Fi after power-on, and after the connection drops while running. */
static const uint32_t BOOT_WIFI_WAIT_MS = 90000;
static const uint32_t LATER_WIFI_WAIT_MS = 600000;
/** A setup page opened because Wi-Fi was lost closes itself (and the camera retries) after this long. */
static const uint32_t PORTAL_TIMEOUT_MS = 600000;
/** Three power-ups within this many milliseconds of each other count as "RST pressed 3 times". */
static const uint32_t RESET_WINDOW_MS = 8000;

#ifdef SERVER_URL
static const char DEFAULT_URL[] = SERVER_URL;
#else
static const char DEFAULT_URL[] = "";
#endif

enum Mode { MODE_IDLE, MODE_PREVIEW, MODE_CAPTURE };

/** What the setup page saves. */
struct Settings {
  String ssid[2];
  String pass[2];
  String url;   // the site, no trailing slash
  String code;  // the camera code
};

static Settings cfg;
static Preferences prefs;

static Mode want = MODE_IDLE;         // what the next request should carry
static String captureId;              // the id the phone is waiting for, in MODE_CAPTURE
static uint32_t waitMs = 0;           // how long to wait before the next request
static Mode sizedFor = MODE_PREVIEW;  // which photo size the sensor is set up for
static int failures = 0;
static bool useTls = true;
static uint32_t previewsSent = 0;
static bool resetWindowOpen = false;

static WiFiMulti wifiMulti;
static WiFiClientSecure secureClient;
static WiFiClient plainClient;
static HTTPClient http;

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------

/** Trims spaces and trailing slashes: "https://site.vercel.app/" would otherwise become ".../ /api/cam/device". */
static String cleanUrl(String url) {
  url.trim();
  while (url.endsWith("/")) url.remove(url.length() - 1);
  return url;
}

static bool validUrl(const String &url) {
  return (url.startsWith("https://") || url.startsWith("http://")) && url.length() > 12 && url.length() <= 200;
}

/** Same rule as the server: 16 to 128 letters, numbers, "-" or "_". */
static bool validCode(const String &code) {
  if (code.length() < 16 || code.length() > 128) return false;
  for (size_t i = 0; i < code.length(); i++) {
    const char c = code[i];
    if (!(isalnum((unsigned char)c) || c == '-' || c == '_')) return false;
  }
  return true;
}

/** Reads the saved settings. Returns true when there is enough to run: a Wi-Fi network, a site and a code. */
static bool loadSettings() {
  cfg.ssid[0] = prefs.getString("ssid1", "");
  cfg.pass[0] = prefs.getString("pass1", "");
  cfg.ssid[1] = prefs.getString("ssid2", "");
  cfg.pass[1] = prefs.getString("pass2", "");
  cfg.url = prefs.getString("url", DEFAULT_URL);
  cfg.code = prefs.getString("code", "");
  return cfg.ssid[0].length() > 0 && validUrl(cfg.url) && validCode(cfg.code);
}

static void saveSettings() {
  prefs.putString("ssid1", cfg.ssid[0]);
  prefs.putString("pass1", cfg.pass[0]);
  prefs.putString("ssid2", cfg.ssid[1]);
  prefs.putString("pass2", cfg.pass[1]);
  prefs.putString("url", cfg.url);
  prefs.putString("code", cfg.code);
}

/** Counts power-ups. Returns true on the third one in a row that came within the reset window. */
static bool noteBoot() {
  const uint8_t boots = prefs.getUChar("boots", 0) + 1;
  prefs.putUChar("boots", boots);
  resetWindowOpen = true;
  if (boots >= 3) {
    prefs.putUChar("boots", 0);
    resetWindowOpen = false;
    return true;
  }
  return false;
}

/** Once the camera has been running a few seconds, the next power-up no longer counts as part of a series. */
static void closeResetWindow() {
  if (resetWindowOpen && millis() > RESET_WINDOW_MS) {
    prefs.putUChar("boots", 0);
    resetWindowOpen = false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Setup page: the camera becomes a Wi-Fi hotspot with a small web page
// ---------------------------------------------------------------------------------------------------------------

static WebServer portalServer(80);
static DNSServer portalDns;
static String found[24];  // networks seen by the scan (the ESP32 only sees 2.4 GHz ones)
static int foundCount = 0;
static String draftUrl;  // what was typed when the form had a mistake, so it is not lost
static String draftSsid[2];

static String esc(const String &text) {
  String out;
  out.reserve(text.length() + 8);
  for (size_t i = 0; i < text.length(); i++) {
    const char c = text[i];
    if (c == '&') out += F("&amp;");
    else if (c == '<') out += F("&lt;");
    else if (c == '>') out += F("&gt;");
    else if (c == '"') out += F("&quot;");
    else if (c == '\'') out += F("&#39;");
    else out += c;
  }
  return out;
}

static bool wasFound(const String &name) {
  for (int i = 0; i < foundCount; i++)
    if (found[i] == name) return true;
  return false;
}

static String networkFields(int index) {
  const String n = String(index + 1);
  const String saved = draftSsid[index].length() ? draftSsid[index] : cfg.ssid[index];
  String h;
  h += F("<fieldset><legend>Wi-Fi network ");
  h += n;
  if (index == 1) h += F(" (optional)");
  h += F("</legend><label>Pick one the camera can see</label><select name='s");
  h += n;
  h += F("'><option value=''>- not in the list -</option>");
  for (int i = 0; i < foundCount; i++) {
    h += F("<option");
    if (found[i] == saved) h += F(" selected");
    h += '>';
    h += esc(found[i]);
    h += F("</option>");
  }
  h += F("</select><label>...or type its name</label><input name='m");
  h += n;
  h += F("' autocapitalize='none' autocomplete='off' value='");
  if (saved.length() && !wasFound(saved)) h += esc(saved);
  h += F("'><label>Password</label><input type='password' name='p");
  h += n;
  h += F("' autocomplete='off' placeholder='");
  h += saved.length() && saved == cfg.ssid[index] ? F("leave empty to keep the saved password") : F("");
  h += F("'></fieldset>");
  return h;
}

static String setupPage(const String &message) {
  String h = F(
      "<!doctype html><html><head><meta charset='utf-8'>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'><title>EggplantCam setup</title><style>"
      "body{font:16px system-ui,sans-serif;margin:0;background:#f2f8f3;color:#0f2116}"
      "main{max-width:30rem;margin:0 auto;padding:1rem}h1{font-size:1.4rem}"
      "fieldset{border:1px solid #c1dec8;border-radius:12px;background:#fff;margin:0 0 1rem;padding:.5rem 1rem 1rem}"
      "legend{font-weight:600;padding:0 .4rem}label{display:block;margin:.7rem 0 .2rem;font-size:.9rem}"
      "input,select{width:100%;box-sizing:border-box;padding:.65rem;font-size:1rem;border:1px solid #95c6a3;"
      "border-radius:8px;background:#fff}button{width:100%;padding:.95rem;font-size:1rem;border:0;"
      "border-radius:12px;background:#285838;color:#fff}.msg{background:#ffe9b0;border-radius:8px;padding:.7rem .9rem}"
      "small{color:#456}</style></head><body><main><h1>EggplantCam setup</h1>");
  if (message.length()) {
    h += F("<p class='msg'>");
    h += esc(message);
    h += F("</p>");
  }
  h += F("<form method='post' action='/save'>");
  h += networkFields(0);
  h += networkFields(1);
  h += F("<fieldset><legend>Your site</legend><label>Site address</label>"
         "<input name='url' type='url' required autocapitalize='none' autocomplete='off' placeholder='https://your-app.vercel.app' value='");
  h += esc(draftUrl.length() ? draftUrl : cfg.url);
  h += F("'><label>Camera code</label><input name='code' autocapitalize='none' autocomplete='off' placeholder='");
  h += validCode(cfg.code) ? F("saved - leave empty to keep it") : F("16 or more letters and numbers");
  h += F("'></fieldset><button type='submit'>Save and restart</button></form>"
         "<p><small>Use the same camera code as ESP32_CAM_CODES on the site. The camera only supports 2.4 GHz Wi-Fi.</small></p>"
         "</main></body></html>");
  return h;
}

static void handleSave() {
  String ssid[2], pass[2];
  for (int i = 0; i < 2; i++) {
    const String n = String(i + 1);
    String chosen = portalServer.arg("s" + n);
    String typed = portalServer.arg("m" + n);
    chosen.trim();
    typed.trim();
    ssid[i] = chosen.length() ? chosen : typed;
    pass[i] = portalServer.arg("p" + n);
    draftSsid[i] = ssid[i];
    // An empty password box for the network that is already saved means "keep the saved password".
    if (ssid[i].length() && pass[i].length() == 0 && ssid[i] == cfg.ssid[i]) pass[i] = cfg.pass[i];
  }
  const String url = cleanUrl(portalServer.arg("url"));
  draftUrl = url;
  String code = portalServer.arg("code");
  code.trim();
  if (code.length() == 0) code = cfg.code;

  String problem;
  if (ssid[0].length() == 0) problem = "Choose or type the name of your Wi-Fi network.";
  else if (ssid[0].length() > 32 || ssid[1].length() > 32) problem = "A Wi-Fi name has at most 32 characters.";
  else if ((pass[0].length() > 0 && pass[0].length() < 8) || (ssid[1].length() > 0 && pass[1].length() > 0 && pass[1].length() < 8))
    problem = "A Wi-Fi password has at least 8 characters (leave it empty only for an open network).";
  else if (!validUrl(url)) problem = "The site address must start with https:// (or http:// for a test on your own computer).";
  else if (!validCode(code)) problem = "The camera code must be 16 to 128 letters, numbers, - or _.";
  if (problem.length()) {
    portalServer.send(400, "text/html", setupPage(problem));
    return;
  }

  cfg.ssid[0] = ssid[0];
  cfg.pass[0] = pass[0];
  cfg.ssid[1] = ssid[1];
  cfg.pass[1] = ssid[1].length() ? pass[1] : String("");
  cfg.url = url;
  cfg.code = code;
  saveSettings();
  portalServer.send(200, "text/html",
                    "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<body style='font:16px system-ui,sans-serif;padding:1.5rem'><h2>Saved</h2>"
                    "<p>The camera is restarting and will join your Wi-Fi. You can close this page and reconnect your phone "
                    "to its normal Wi-Fi.</p></body>");
  Serial.println("Settings saved. Restarting...");
  delay(1500);
  ESP.restart();
}

/** Phones probe a web address to see whether a Wi-Fi has a login page; sending every unknown address to the setup page opens it. */
static void redirectToPortal() {
  portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  portalServer.send(302, "text/plain", "");
}

/**
 * Turns the camera into a hotspot "EggplantCam-xxxx" with the setup page, and never returns: saving restarts the camera.
 * `canGiveUp` is true when settings already exist: after PORTAL_TIMEOUT_MS the camera restarts and tries them again.
 */
static void runSetupPortal(const char *reason, bool canGiveUp) {
  Serial.printf("\n=== Setup mode: %s ===\n", reason);
  pinMode(STATUS_LED_GPIO_NUM, OUTPUT);

  // Look for networks first: scanning while the hotspot is running would disturb it.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(200);
  const int count = WiFi.scanNetworks();
  foundCount = 0;
  for (int i = 0; i < count && foundCount < 24; i++) {
    const String name = WiFi.SSID(i);
    if (name.length() > 0 && !wasFound(name)) found[foundCount++] = name;
  }
  WiFi.scanDelete();

  String mac = WiFi.macAddress();
  mac.replace(":", "");
  const String apName = "EggplantCam-" + mac.substring(mac.length() - 4);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str(), SETUP_AP_PASSWORD);
  delay(300);
  const IPAddress ip = WiFi.softAPIP();
  portalDns.start(53, "*", ip);
  portalServer.on("/", HTTP_GET, []() { portalServer.send(200, "text/html", setupPage("")); });
  portalServer.on("/save", HTTP_POST, handleSave);
  portalServer.onNotFound(redirectToPortal);
  portalServer.begin();
  Serial.printf("On your phone join the Wi-Fi \"%s\" (password \"%s\"), then open http://%s\n", apName.c_str(),
                SETUP_AP_PASSWORD, ip.toString().c_str());

  const uint32_t started = millis();
  uint32_t lastBlink = 0;
  bool ledOn = false;
  for (;;) {
    portalDns.processNextRequest();
    portalServer.handleClient();
    if (millis() - lastBlink > 400) {
      ledOn = !ledOn;
      digitalWrite(STATUS_LED_GPIO_NUM, ledOn ? LOW : HIGH);
      lastBlink = millis();
    }
    if (canGiveUp && millis() - started > PORTAL_TIMEOUT_MS) {
      Serial.println("Setup page timed out. Restarting...");
      ESP.restart();
    }
    delay(2);
  }
}

/** "setup" opens the setup page, "forget" erases everything saved. Type them in the Serial Monitor. */
static void checkSerialCommands() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  line.toLowerCase();
  if (line == "setup") {
    runSetupPortal("requested from the Serial Monitor", true);
  } else if (line == "forget") {
    prefs.clear();
    Serial.println("Everything saved was erased. Restarting...");
    delay(500);
    ESP.restart();
  } else if (line.length() > 0) {
    Serial.println("Commands: setup | forget");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------------------------------------------

static bool startCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = PREVIEW_SIZE;
  config.jpeg_quality = PREVIEW_QUALITY;
  config.grab_mode = CAMERA_GRAB_LATEST;  // always hand over the newest frame, never a stale one

  if (psramFound()) {
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    Serial.println("WARNING: no PSRAM found. Check that Tools > Board is \"AI Thinker ESP32-CAM\". Captures may fail.");
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  const esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }
  return true;
}

/** Switches the sensor between the small preview size and the bigger capture size. */
static void useSize(Mode mode) {
  if (mode == MODE_IDLE || mode == sizedFor) return;
  sensor_t *sensor = esp_camera_sensor_get();
  if (!sensor) return;
  sensor->set_framesize(sensor, mode == MODE_CAPTURE ? CAPTURE_SIZE : PREVIEW_SIZE);
  sensor->set_quality(sensor, mode == MODE_CAPTURE ? CAPTURE_QUALITY : PREVIEW_QUALITY);
  sizedFor = mode;
  // Frames already waiting in the buffers still have the old size: throw them away.
  for (int i = 0; i < 2; i++) {
    camera_fb_t *old = esp_camera_fb_get();
    if (old) esp_camera_fb_return(old);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Wi-Fi and the relay
// ---------------------------------------------------------------------------------------------------------------

/** HTTPS needs the real date to check the server's certificate; a fresh ESP32 thinks it is 1970. */
static void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const uint32_t started = millis();
  while (time(nullptr) < 1700000000 && millis() - started < 20000) delay(250);
  Serial.println(time(nullptr) < 1700000000 ? "Clock: not set (HTTPS will probably fail)" : "Clock: set");
}

/** Joins a saved network. After `giveUpMs` without success it opens the setup page so the networks can be changed. */
static void connectWifi(uint32_t giveUpMs) {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.println("Wi-Fi: connecting...");
  const uint32_t started = millis();
  while (wifiMulti.run(15000) != WL_CONNECTED) {
    Serial.print('.');
    closeResetWindow();
    if (millis() - started > giveUpMs) {
      Serial.println("\nWi-Fi: could not join any saved network.");
      runSetupPortal("cannot reach the saved Wi-Fi", true);
    }
  }
  Serial.printf("\nWi-Fi: connected to \"%s\", IP %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  if (useTls) syncClock();
}

static String jsonString(const String &json, const char *key) {
  const String needle = String("\"") + key + "\":\"";
  int start = json.indexOf(needle);
  if (start < 0) return "";
  start += needle.length();
  const int end = json.indexOf('"', start);
  return end < 0 ? "" : json.substring(start, end);
}

static long jsonNumber(const String &json, const char *key) {
  const String needle = String("\"") + key + "\":";
  const int start = json.indexOf(needle);
  return start < 0 ? -1 : json.substring(start + needle.length()).toInt();
}

/** One POST to /api/cam/device, with the photo `fb` as its body (or no body for a heartbeat). Returns the HTTP status. */
static int post(camera_fb_t *fb, String &answer) {
  const String url = cfg.url + "/api/cam/device";
  const bool begun = useTls ? http.begin(secureClient, url) : http.begin(plainClient, url);
  if (!begun) return HTTPC_ERROR_CONNECTION_REFUSED;

  http.addHeader("x-cam-code", cfg.code);
  int status;
  if (fb) {
    http.addHeader("x-frame-kind", want == MODE_CAPTURE ? "capture" : "preview");
    if (want == MODE_CAPTURE) http.addHeader("x-capture-id", captureId);
    http.addHeader("Content-Type", "image/jpeg");
    status = http.POST(fb->buf, fb->len);
  } else {
    status = http.POST("");
  }
  if (status == 200) answer = http.getString();
  http.end();
  return status;
}

/** Sends what the server last asked for, then reads what it wants next. Returns false when the request failed. */
static bool exchange() {
  camera_fb_t *fb = nullptr;
  if (want != MODE_IDLE) {
    useSize(want);
    fb = esp_camera_fb_get();
    if (!fb) Serial.println("Camera: no frame, sending a heartbeat instead");
  } else {
    // A heartbeat every 10 s outlives the server's idle connection timeout: start each one fresh.
    secureClient.stop();
    plainClient.stop();
  }
  const size_t photoBytes = fb ? fb->len : 0;
  const Mode sent = fb ? want : MODE_IDLE;

  const uint32_t started = millis();
  String answer;
  int status = post(fb, answer);
  if (status < 0) {
    // A connection kept alive between photos may have been closed by the server: reconnect and try once more.
    secureClient.stop();
    plainClient.stop();
    status = post(fb, answer);
  }
  if (fb) esp_camera_fb_return(fb);

  if (status != 200) {
    if (status == 401) Serial.println("Server: wrong camera code. Press RST 3 times to open the setup page and change it.");
    else if (status == 503) Serial.println("Server: the ESP32 camera relay is not set up (ESP32_CAM_CODES / Upstash).");
    else if (status < 0) Serial.printf("Connection failed: %s\n", HTTPClient::errorToString(status).c_str());
    else Serial.printf("Server answered %d\n", status);
    return false;
  }

  if (sent == MODE_CAPTURE) {
    Serial.printf("Capture sent: %u bytes in %lu ms\n", (unsigned)photoBytes, (unsigned long)(millis() - started));
  } else if (sent == MODE_PREVIEW && ++previewsSent % 10 == 1) {
    Serial.printf("Preview sent: %u bytes in %lu ms (every 10th is logged)\n", (unsigned)photoBytes,
                  (unsigned long)(millis() - started));
  }

  const String next = jsonString(answer, "want");
  const Mode before = want;
  want = next == "preview" ? MODE_PREVIEW : next == "capture" ? MODE_CAPTURE : MODE_IDLE;
  captureId = want == MODE_CAPTURE ? jsonString(answer, "id") : "";
  if (want == MODE_CAPTURE && captureId.length() == 0) want = MODE_IDLE;
  const long wait = jsonNumber(answer, "nextMs");
  waitMs = wait >= 0 ? (uint32_t)wait : DEFAULT_WAIT_MS;
  if (want != before) Serial.printf("Mode: %s\n", want == MODE_PREVIEW ? "preview" : want == MODE_CAPTURE ? "capture" : "idle");
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nEggplantCare ESP32-CAM starting");
  Serial.println("Serial Monitor commands: setup (open the setup page) | forget (erase saved settings)");

#ifdef DISABLE_BROWNOUT_DETECTOR
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
#endif

  pinMode(FLASH_LED_GPIO_NUM, OUTPUT);  // the bright flash LED stays off
  digitalWrite(FLASH_LED_GPIO_NUM, LOW);
  pinMode(STATUS_LED_GPIO_NUM, OUTPUT);
  digitalWrite(STATUS_LED_GPIO_NUM, HIGH);

  prefs.begin("eggcam", false);
  const bool resetThreeTimes = noteBoot();
  const bool configured = loadSettings();
  if (!configured) runSetupPortal("nothing saved yet", false);
  if (resetThreeTimes) runSetupPortal("RST pressed 3 times", true);

  if (!startCamera()) {
    Serial.println("Restarting in 10 s...");
    delay(10000);
    ESP.restart();
  }

  useTls = cfg.url.startsWith("https://");
#ifdef HAS_ROOT_CA
  secureClient.setCACert(ROOT_CA_PEM);
#else
  Serial.println("WARNING: no root certificate in config.h. The connection is encrypted, but the server is not verified.");
  secureClient.setInsecure();
#endif
  http.setReuse(true);
  http.setTimeout(15000);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  for (int i = 0; i < 2; i++) {
    if (cfg.ssid[i].length() > 0) wifiMulti.addAP(cfg.ssid[i].c_str(), cfg.pass[i].length() > 0 ? cfg.pass[i].c_str() : nullptr);
  }
  Serial.printf("Site: %s\n", cfg.url.c_str());
  connectWifi(BOOT_WIFI_WAIT_MS);
}

void loop() {
  closeResetWindow();
  checkSerialCommands();
  connectWifi(LATER_WIFI_WAIT_MS);

  const uint32_t started = millis();
  if (exchange()) {
    failures = 0;
    const uint32_t spent = millis() - started;
    if (spent < waitMs) delay(waitMs - spent);
    return;
  }

  secureClient.stop();
  plainClient.stop();
  if (++failures >= MAX_FAILURES) ESP.restart();
  uint32_t pause = 2000UL * failures;  // back off: 2 s, 4 s, ... up to 30 s
  if (pause > 30000) pause = 30000;
  delay(pause);
}
