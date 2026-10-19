import assert from "node:assert/strict";
import { test } from "node:test";
import { BLURRY, focusPercent, sharpness } from "../src/lib/sharpness.ts";

const SIZE = 64;

/** An RGBA image whose grey value at (x, y) is `grey(x, y)`. */
function image(grey) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = grey(x, y);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** A checkerboard of 4 px squares, like the fine texture of a leaf in focus. */
const checker = (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 200 : 50);

/** Averages each pixel with its neighbours `radius` px around: a lens out of focus. */
function blurred(grey, radius) {
  return (x, y) => {
    let sum = 0;
    let n = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        sum += grey(Math.min(SIZE - 1, Math.max(0, x + dx)), Math.min(SIZE - 1, Math.max(0, y + dy)));
        n++;
      }
    }
    return sum / n;
  };
}

test("sharpness: a sharp texture scores above BLURRY, the same texture out of focus below it", () => {
  const sharp = sharpness(image(checker), SIZE, SIZE);
  const soft = sharpness(image(blurred(checker, 1)), SIZE, SIZE);
  const verySoft = sharpness(image(blurred(checker, 3)), SIZE, SIZE);
  assert.ok(sharp > soft && soft > verySoft, `${sharp} > ${soft} > ${verySoft}`);
  assert.ok(sharp > BLURRY);
  assert.ok(verySoft < BLURRY);
});

test("sharpness: a flat or smoothly shaded image scores about 0", () => {
  assert.equal(sharpness(image(() => 128), SIZE, SIZE), 0);
  assert.ok(sharpness(image((x) => x * 3), SIZE, SIZE) < 1);
  assert.equal(sharpness(new Uint8ClampedArray(0), 0, 0), 0);
});

test("focusPercent: 0 to 100, rising with the score", () => {
  assert.equal(focusPercent(0), 0);
  assert.equal(focusPercent(1e9), 100);
  let last = -1;
  for (const score of [1, 10, 40, 100, 350, 1000, 1500]) {
    const percent = focusPercent(score);
    assert.ok(percent >= last && percent >= 0 && percent <= 100, `${score} -> ${percent}`);
    last = percent;
  }
  assert.ok(focusPercent(BLURRY) < focusPercent(350));
});
