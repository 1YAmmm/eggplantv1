// Lets `node --test` import the app's TypeScript modules, which use extensionless relative imports.
// Used as: node --import ./tests/register.mjs --test tests/*.test.mjs
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
