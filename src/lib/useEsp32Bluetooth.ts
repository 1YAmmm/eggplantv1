import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { BLE_CONTROL, BLE_PHOTO, BLE_SERVICE, FrameAssembler, loginCommand, statusMessage, type BleCommand, type BlePhoto } from "./camBle";
import { drawPhoto, squarePhoto } from "./camPhoto";
import type { FlashChoice } from "./camRelay";
import type { CamState, CapturePhase, Esp32Link } from "./useEsp32Camera";

/*
 * The phone's side of the direct Bluetooth link to the ESP32-CAM (see camBle.ts). `connect()` must run inside the
 * user's tap: it shows Chrome's list of nearby cameras, connects and sends the camera code. While `active`, the camera
 * streams previews, drawn on the canvas, and `capture()` asks for one full-size photo. The link stays open between
 * scans, so "Scan another" does not show the list again, and closes after a while without scanning: while it is open
 * the camera pauses its Wi-Fi relay.
 */

/** Web Bluetooth, as far as this file uses it; not in TypeScript's DOM types yet. */
type Characteristic = EventTarget & {
  value?: DataView;
  startNotifications(): Promise<Characteristic>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
};
type GattServer = {
  connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<Characteristic> }>;
};
type Device = EventTarget & { gatt?: GattServer };
type Bluetooth = { requestDevice(options: { filters: { services: string[] }[] }): Promise<Device> };

const LOGIN_TIMEOUT_MS = 8_000;
/** A Capture takes the camera about 1 s, then 40-130 KB over Bluetooth. */
const CAPTURE_TIMEOUT_MS = 20_000;
/** Previews arrive several times a second, so a long gap means the camera has stopped. */
const STALE_AFTER_MS = 8_000;
const RECONNECT_TRIES = 3;
/** The link closes after this long without scanning, so the camera goes back to its Wi-Fi relay. */
const IDLE_DISCONNECT_MS = 120_000;

const NO_BLUETOOTH = "This browser has no Bluetooth. Use Chrome on Android, or connect by Wi-Fi.";
const NO_CAMERA = "The camera is not connected.";
const PICK = "Pick your EggplantCam in the list.";
const CONNECTING = "Connecting to the camera over Bluetooth…";
const CONNECT_FAILED = "Could not connect to the camera over Bluetooth. Move closer to it and try again.";
const RECONNECTING = "The Bluetooth connection dropped. Reconnecting…";
const LOST = "The Bluetooth connection was lost. Move closer to the camera, then press Cancel and scan again.";
const NOT_RESPONDING = "The camera is not sending photos. Check that it is powered and close by.";

/** The camera answered, but refused this phone (wrong or missing camera code): trying again will not help. */
class RefusedError extends Error {}

type Waiter<T> = { resolve: (value: T) => void; reject: (err: Error) => void };

/** `flash` is the user's choice for the camera's white LED, as for the Wi-Fi relay ("auto": the camera's own setting). */
export function useEsp32Bluetooth(
  code: string,
  active: boolean,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  flash: FlashChoice = "auto",
): Esp32Link & { connected: boolean; connect: () => Promise<boolean>; disconnect: () => void } {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<CamState>("waking");
  const [message, setMessage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("asking");
  const [cameraFlash, setCameraFlash] = useState<boolean | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const controlRef = useRef<Characteristic | null>(null);
  /** Web Bluetooth allows one operation at a time, so commands queue up behind each other. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const assemblerRef = useRef(new FrameAssembler());
  const statusWaiter = useRef<Waiter<string> | null>(null);
  const captureWaiter = useRef<Waiter<BlePhoto> | null>(null);
  const activeRef = useRef(active);
  const codeRef = useRef(code);
  const lastPhotoAt = useRef(0);
  const drawing = useRef(false);
  const reconnecting = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    activeRef.current = active;
    codeRef.current = code;
  }, [active, code]);

  const send = useCallback((command: BleCommand) => {
    const control = controlRef.current;
    if (!control) return Promise.reject(new Error(NO_CAMERA));
    const next = queueRef.current
      .catch(() => {})
      .then(() => control.writeValueWithResponse(new TextEncoder().encode(command)));
    queueRef.current = next;
    return next;
  }, []);

  const onPacket = useCallback(
    (event: Event) => {
      const value = (event.target as Characteristic).value;
      if (!value) return;
      const result = assemblerRef.current.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      if (!result) return;

      if (result.type === "status") {
        if (statusWaiter.current) statusWaiter.current.resolve(result.status);
        else if (result.status === "no-frame") captureWaiter.current?.reject(new Error(statusMessage(result.status)));
        return;
      }
      if (result.type === "start") {
        setCameraFlash(result.flash);
        if (result.kind === "capture") setCapturePhase("receiving");
        return;
      }

      const { photo } = result;
      lastPhotoAt.current = Date.now();
      if (photo.kind === "capture") {
        captureWaiter.current?.resolve(photo);
        return;
      }
      const canvas = canvasRef.current;
      if (!activeRef.current || !canvas || drawing.current) return;
      drawing.current = true;
      drawPhoto(new Blob([photo.jpeg], { type: "image/jpeg" }), canvas)
        .then(() => {
          setState("live");
          setMessage(null);
        })
        // A damaged preview is skipped; the next one is a moment away.
        .catch(() => {})
        .finally(() => {
          drawing.current = false;
        });
    },
    [canvasRef],
  );

  /** Connects to a camera the user already picked, and logs in with the camera code. */
  const open = useCallback(
    async (device: Device) => {
      if (!device.gatt) throw new Error(CONNECT_FAILED);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE);
      const control = await service.getCharacteristic(BLE_CONTROL);
      const photo = await service.getCharacteristic(BLE_PHOTO);
      photo.removeEventListener("characteristicvaluechanged", onPacket);
      photo.addEventListener("characteristicvaluechanged", onPacket);
      await photo.startNotifications();
      controlRef.current = control;
      queueRef.current = Promise.resolve();
      assemblerRef.current = new FrameAssembler();

      const status = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => done(() => reject(new Error(CONNECT_FAILED))), LOGIN_TIMEOUT_MS);
        function done(settle: () => void) {
          clearTimeout(timer);
          statusWaiter.current = null;
          settle();
        }
        statusWaiter.current = {
          resolve: (value) => done(() => resolve(value)),
          reject: (err) => done(() => reject(err)),
        };
        send(loginCommand(codeRef.current)).catch((err: Error) => statusWaiter.current?.reject(err));
      });
      if (status !== "ok") throw new RefusedError(statusMessage(status));
      lastPhotoAt.current = Date.now();
      setConnected(true);
    },
    [onPacket, send],
  );

  /** Closes the link on purpose: no reconnecting. */
  const forget = useCallback(() => {
    clearTimeout(idleTimer.current);
    const device = deviceRef.current;
    deviceRef.current = null;
    controlRef.current = null;
    captureWaiter.current?.reject(new Error(NO_CAMERA));
    setConnected(false);
    if (device?.gatt?.connected) device.gatt.disconnect();
  }, []);

  const onDisconnected = useCallback(
    (event: Event) => {
      const device = event.target as Device;
      if (device !== deviceRef.current) return; // closed on purpose
      controlRef.current = null;
      setConnected(false);
      captureWaiter.current?.reject(new Error(LOST));
      if (reconnecting.current) return;
      reconnecting.current = true;
      setState("waking");
      setMessage(RECONNECTING);
      void (async () => {
        try {
          for (let i = 0; i < RECONNECT_TRIES && deviceRef.current === device; i++) {
            try {
              await open(device);
              return;
            } catch (err) {
              if (err instanceof RefusedError) {
                forget();
                setState("error");
                setMessage(err.message);
                return;
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          if (deviceRef.current === device) {
            forget();
            setState("offline");
            setMessage(LOST);
          }
        } finally {
          reconnecting.current = false;
        }
      })();
    },
    [open, forget],
  );

  /**
   * Shows Chrome's list of nearby cameras, then connects and logs in. Call it straight from the user's tap. Resolves to
   * false when the user closes the list without picking one; rejects with a message that can be shown to the user.
   */
  const connect = useCallback(async (): Promise<boolean> => {
    const bluetooth = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
    if (!bluetooth) throw new Error(NO_BLUETOOTH);
    setState("waking");
    setMessage(PICK);
    let device: Device;
    try {
      // The first await: the browser only shows its list during the user's tap.
      device = await bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") return false;
      throw new Error(CONNECT_FAILED);
    }
    forget();
    deviceRef.current = device;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    setMessage(CONNECTING);
    try {
      await open(device);
      return true;
    } catch (err) {
      device.removeEventListener("gattserverdisconnected", onDisconnected);
      forget();
      throw err instanceof RefusedError ? err : new Error(CONNECT_FAILED);
    }
  }, [forget, onDisconnected, open]);

  // Previews flow while the scanner is open. Closing it stops them, and the link closes after a while without scanning.
  useEffect(() => {
    if (!active || !connected) return;
    clearTimeout(idleTimer.current);
    lastPhotoAt.current = Date.now();
    send("preview").catch(() => {});
    const watchdog = setInterval(() => {
      if (Date.now() - lastPhotoAt.current > STALE_AFTER_MS) {
        setState("offline");
        setMessage(NOT_RESPONDING);
      }
    }, 1000);
    return () => {
      clearInterval(watchdog);
      if (controlRef.current) send("stop").catch(() => {});
      idleTimer.current = setTimeout(forget, IDLE_DISCONNECT_MS);
      // The next scan waits for a fresh preview. A message (such as "Reconnecting…") stays.
      setState((current) => (current === "live" ? "waking" : current));
      setCameraFlash(null);
    };
  }, [active, connected, send, forget]);

  useEffect(() => {
    if (connected) send(`flash:${flash}`).catch(() => {});
  }, [connected, flash, send]);

  useEffect(() => forget, [forget]);

  /** Asks the camera for one full-size photo and waits for it (cropped to the viewfinder's square). */
  const capture = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!controlRef.current) throw new Error(NO_CAMERA);
    setCapturePhase("asking");
    setCapturing(true);
    try {
      const photo = await new Promise<BlePhoto>((resolve, reject) => {
        const timer = setTimeout(
          () => fail(new Error("The camera did not send the photo. Move closer to it and try again.")),
          CAPTURE_TIMEOUT_MS,
        );
        function fail(err: Error) {
          clearTimeout(timer);
          captureWaiter.current = null;
          reject(err);
        }
        captureWaiter.current = {
          resolve: (value) => {
            clearTimeout(timer);
            captureWaiter.current = null;
            resolve(value);
          },
          reject: fail,
        };
        send("capture").catch(() => fail(new Error(LOST)));
      });
      return await squarePhoto(new Blob([photo.jpeg], { type: "image/jpeg" }));
    } catch (err) {
      if (err instanceof DOMException) throw new Error("The photo from the camera was damaged. Please try again.");
      throw err;
    } finally {
      setCapturing(false);
    }
  }, [send]);

  return {
    state: active ? state : "idle",
    message: active ? message : null,
    capturing,
    capturePhase,
    cameraFlash: active ? cameraFlash : null,
    capture,
    connected,
    connect,
    disconnect: forget,
  };
}
