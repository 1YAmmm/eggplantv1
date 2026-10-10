// Resolve hook: "./pests" -> "./pests.ts" for relative imports without an extension.
export async function resolve(specifier, context, nextResolve) {
  if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // fall through to the default resolution
    }
  }
  return nextResolve(specifier, context);
}
