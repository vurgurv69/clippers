/**
 * Child-process export worker.
 * Parent sends one IPC message: { projectId, spec, exportOptions }
 * Child replies: { ok: true, outName } | { ok: false, error }
 *
 * Run with:
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/export-worker.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const renderUrl = pathToFileURL(
  path.join(__dirname, "..", "src", "lib", "editor-render.ts"),
).href;

let abortController = null;

process.on("message", async (msg) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "abort") {
    abortController?.abort();
    return;
  }
  if (msg.type !== "render") return;

  abortController = new AbortController();
  try {
    const { renderProject } = await import(renderUrl);
    const { outName } = await renderProject({
      projectId: msg.projectId,
      spec: msg.spec,
      exportOptions: msg.exportOptions,
      signal: abortController.signal,
    });
    process.send?.({ ok: true, outName });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    process.send?.({ ok: false, error });
  } finally {
    process.exit(0);
  }
});

process.send?.({ ready: true });
