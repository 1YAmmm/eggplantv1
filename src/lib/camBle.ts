import { checkFrame, MAX_FRAME_BYTES, type FlashChoice } from "./camRelay";

/*
 * The direct Bluetooth link to the ESP32-CAM (Bluetooth Low Energy through Chrome's Web Bluetooth, so Android only):
 * the IDs and messages the app and the firmware share, and the code that puts photos back together.
 *
 * The phone writes text commands to the control characteristic. `code:<camera code>` must come first; until it
 * matches, the camera answers every other command with the status "locked". The camera answers on the photo
 * characteristic with packets whose first byte says what they are:
 *   START  [0x01, kind ("P" preview / "C" capture), JPEG length (uint32, little-endian), white LED lit (0 / 1)]
 *   DATA   [0x02, ...the next bytes of the JPEG]
 *   STATUS [0x04, ...UTF-8 text, see BleStatus]
 * The same numbers are in firmware/esp32cam-wifi/esp32cam-wifi.ino; change both together.
 */

export const BLE_SERVICE = "6078929d-d746-456d-b9f8-5925d43b2c39";
export const BLE_CONTROL = "014fcfe2-de44-4e5b-8244-beb1461316fe";
export const BLE_PHOTO = "30d8947f-62c7-46d2-8fdc-ee257049ea39";

export const PACKET_START = 0x01;
export const PACKET_DATA = 0x02;
export const PACKET_STATUS = 0x04;
const START_LENGTH = 7;

export type BleCommand = "preview" | "capture" | "stop" | `flash:${FlashChoice}` | `code:${string}`;

/** "ok": the camera code matched. "no-frame": the camera could not take a photo. The others refuse the phone. */
export type BleStatus = "ok" | "wrong-code" | "locked" | "no-code" | "no-frame";

export function loginCommand(code: string): BleCommand {
  return `code:${code}`;
}

/** What to tell the user when the camera refuses the phone or a photo. */
export function statusMessage(status: string): string {
  if (status === "no-code") return "This camera has no camera code yet. Set one on its setup page first.";
  if (status === "no-frame") return "The camera could not take a photo. Please try again.";
  return "The camera did not accept this camera code.";
}

export type BleKind = "preview" | "capture";
export type BlePhoto = { kind: BleKind; jpeg: Uint8Array<ArrayBuffer>; flash: boolean };
export type BleEvent =
  | { type: "start"; kind: BleKind; flash: boolean }
  | { type: "photo"; photo: BlePhoto }
  | { type: "status"; status: string };

/**
 * Puts the camera's photos back together from its notifications. Bluetooth delivers them in order, but a photo can
 * still be cut short (a dropped connection, a camera restart), so a new START drops a half-finished photo and a photo
 * is only handed over when it is complete and looks like a JPEG.
 */
export class FrameAssembler {
  private buffer: Uint8Array<ArrayBuffer> | null = null;
  private filled = 0;
  private kind: BleKind = "preview";
  private flash = false;

  push(packet: Uint8Array): BleEvent | null {
    if (packet.length === 0) return null;
    if (packet[0] === PACKET_STATUS) return { type: "status", status: new TextDecoder().decode(packet.subarray(1)) };

    if (packet[0] === PACKET_START) {
      this.buffer = null;
      if (packet.length < START_LENGTH) return null;
      const kind = packet[1] === 0x43 ? "capture" : packet[1] === 0x50 ? "preview" : null;
      const length = (packet[2] | (packet[3] << 8) | (packet[4] << 16) | (packet[5] << 24)) >>> 0;
      if (!kind || length === 0 || length > MAX_FRAME_BYTES) return null;
      this.buffer = new Uint8Array(length);
      this.filled = 0;
      this.kind = kind;
      this.flash = packet[6] === 1;
      return { type: "start", kind, flash: this.flash };
    }

    if (packet[0] !== PACKET_DATA || !this.buffer) return null;
    const data = packet.subarray(1);
    if (this.filled + data.length > this.buffer.length) {
      this.buffer = null;
      return null;
    }
    this.buffer.set(data, this.filled);
    this.filled += data.length;
    if (this.filled < this.buffer.length) return null;

    const photo: BlePhoto = { kind: this.kind, jpeg: this.buffer, flash: this.flash };
    this.buffer = null;
    return checkFrame(photo.jpeg) === "ok" ? { type: "photo", photo } : null;
  }
}
