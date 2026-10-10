// Copies the LiteRT.js WebAssembly runtime into public/litert/ so the browser can load it
// (see WASM_DIR in src/lib/model.ts). Runs automatically after `npm install`.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = `${root}node_modules/@litertjs/core/wasm`;
const dest = `${root}public/litert`;

// The two variants loadLiteRt() picks between without the `threads`/`jspi` options:
// relaxed-SIMD builds for modern browsers, and a compat build for the rest.
const variants = ["litert_wasm_internal", "litert_wasm_compat_internal"];

mkdirSync(dest, { recursive: true });
for (const name of variants) {
  for (const ext of [".js", ".wasm"]) copyFileSync(`${src}/${name}${ext}`, `${dest}/${name}${ext}`);
}
console.log(`Copied LiteRT.js runtime to ${dest}`);
