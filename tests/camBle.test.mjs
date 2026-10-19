import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLE_CONTROL,
  BLE_PHOTO,
  BLE_SERVICE,
  FrameAssembler,
  PACKET_DATA,
  PACKET_START,
  PACKET_STATUS,
  loginCommand,
  statusMessage,
} from "../src/lib/camBle.ts";
import { MAX_FRAME_BYTES } from "../src/lib/camRelay.ts";

/** A fake JPEG: starts with FF D8, ends with FF D9. */
function jpeg(size) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 251;
  bytes.set([0xff, 0xd8], 0);
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

/** The packets the firmware sends for one photo: START, then DATA pieces of at most `chunk` bytes. */
function packets(photo, { kind = "P", flash = false, chunk = 511, length = photo.length } = {}) {
  const start = new Uint8Array(7);
  start[0] = PACKET_START;
  start[1] = kind.charCodeAt(0);
  new DataView(start.buffer).setUint32(2, length, true);
  start[6] = flash ? 1 : 0;
  const out = [start];
  for (let at = 0; at < photo.length; at += chunk) {
    const piece = photo.subarray(at, at + chunk);
    const packet = new Uint8Array(piece.length + 1);
    packet[0] = PACKET_DATA;
    packet.set(piece, 1);
    out.push(packet);
  }
  return out;
}

const status = (text) => new Uint8Array([PACKET_STATUS, ...new TextEncoder().encode(text)]);

function feed(assembler, list) {
  return list.map((packet) => assembler.push(packet)).filter(Boolean);
}

test("ids: lowercase 128-bit UUIDs, as Web Bluetooth requires", () => {
  for (const id of [BLE_SERVICE, BLE_CONTROL, BLE_PHOTO]) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(new Set([BLE_SERVICE, BLE_CONTROL, BLE_PHOTO]).size, 3);
});

test("FrameAssembler: a photo comes back whole, whatever the piece size", () => {
  const photo = jpeg(5000);
  for (const chunk of [19, 244, 511]) {
    const events = feed(new FrameAssembler(), packets(photo, { kind: "C", flash: true, chunk }));
    assert.deepEqual(events[0], { type: "start", kind: "capture", flash: true });
    assert.equal(events.length, 2);
    assert.equal(events[1].type, "photo");
    assert.equal(events[1].photo.kind, "capture");
    assert.equal(events[1].photo.flash, true);
    assert.deepEqual(events[1].photo.jpeg, photo);
  }
});

test("FrameAssembler: a new START drops a half-finished photo, and the next one still arrives", () => {
  const first = packets(jpeg(3000), { chunk: 500 });
  const second = jpeg(1200);
  const events = feed(new FrameAssembler(), [...first.slice(0, 3), ...packets(second, { chunk: 500 })]);
  const photos = events.filter((e) => e.type === "photo");
  assert.equal(photos.length, 1);
  assert.deepEqual(photos[0].photo.jpeg, second);
});

test("FrameAssembler: damaged or impossible photos are not handed over", () => {
  const assembler = new FrameAssembler();
  // Too long for a camera photo.
  assert.equal(assembler.push(packets(jpeg(10), { length: MAX_FRAME_BYTES + 1 })[0]), null);
  // More data than announced.
  assert.equal(feed(assembler, packets(jpeg(600), { length: 400, chunk: 300 })).filter((e) => e.type === "photo").length, 0);
  // Complete, but not a JPEG.
  const notJpeg = new Uint8Array(100).fill(7);
  assert.equal(feed(assembler, packets(notJpeg)).filter((e) => e.type === "photo").length, 0);
  // DATA without a START, a short START and unknown packets are ignored.
  assert.equal(assembler.push(new Uint8Array([PACKET_DATA, 1, 2, 3])), null);
  assert.equal(assembler.push(new Uint8Array([PACKET_START, 0x50, 1])), null);
  assert.equal(assembler.push(new Uint8Array([0x09, 1])), null);
  assert.equal(assembler.push(new Uint8Array(0)), null);
});

test("FrameAssembler: status packets are read as text", () => {
  const assembler = new FrameAssembler();
  assert.deepEqual(assembler.push(status("ok")), { type: "status", status: "ok" });
  assert.deepEqual(assembler.push(status("wrong-code")), { type: "status", status: "wrong-code" });
});

test("commands and messages", () => {
  assert.equal(loginCommand("Abcdefgh12345678"), "code:Abcdefgh12345678");
  assert.match(statusMessage("wrong-code"), /camera code/);
  assert.match(statusMessage("locked"), /camera code/);
  assert.match(statusMessage("no-code"), /setup page/);
  assert.match(statusMessage("no-frame"), /photo/);
});
