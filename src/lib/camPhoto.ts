/** Turning the ESP32 camera's JPEGs into canvases. Shared by the Wi-Fi relay and the Bluetooth link. */

/** Decodes a JPEG onto a canvas, resizing the canvas to the photo. */
export async function drawPhoto(jpeg: Blob, canvas: HTMLCanvasElement) {
  const bitmap = await createImageBitmap(jpeg);
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
}

/**
 * Decodes the Capture photo and keeps only its centre square (1024x768 -> 768x768). The model was trained on square
 * photos and the viewfinder shows exactly this square; stretching the whole 4:3 photo instead would squash everything
 * by 25% and add edges the user never saw.
 */
export async function squarePhoto(jpeg: Blob) {
  const bitmap = await createImageBitmap(jpeg);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, side, side);
  bitmap.close();
  return canvas;
}
