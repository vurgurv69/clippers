/**
 * Node ESM loader bootstrap for extensionless .ts imports.
 * Usage: node --import ./scripts/ts-resolve.mjs --experimental-strip-types ...
 */
import { register } from "node:module";

register(new URL("./ts-resolve-hooks.mjs", import.meta.url));
