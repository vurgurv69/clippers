/** Resolve hooks for extensionless TypeScript imports (export worker). */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-zA-Z0-9]+$/.test(specifier)
  ) {
    for (const ext of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // try next extension
      }
    }
  }
  return nextResolve(specifier, context);
}
