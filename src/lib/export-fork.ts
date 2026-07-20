import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { pathToFileURL } from "url";
import type { ExportOptions, ProjectSpec } from "./editor-types";

type RenderArgs = {
  projectId: string;
  spec: ProjectSpec;
  exportOptions?: Partial<ExportOptions>;
  signal?: AbortSignal;
};

/**
 * Run renderProject in a child Node process so FFmpeg orchestration
 * doesn't pin the Next.js event loop. Falls back to in-process on failure.
 */
export async function renderInFork(
  args: RenderArgs,
  inProcess: (opts: RenderArgs) => Promise<{ outName: string }>,
): Promise<{ outName: string }> {
  try {
    return await forkOnce(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Abort should not fall back — caller cancelled.
    if (args.signal?.aborted || msg === "Cancelled") throw err;
    console.warn("[export-fork] child failed, falling back in-process:", msg);
    return inProcess(args);
  }
}

function workerFiles() {
  // Build paths at runtime so Turbopack does not treat them as bundle entries.
  const root = process.cwd();
  const scripts = ["scr", "ipts"].join("");
  const worker = ["export", "worker"].join("-") + ".mjs";
  const hook = ["ts", "resolve"].join("-") + ".mjs";
  return {
    workerPath: path.join(root, scripts, worker),
    resolveHook: pathToFileURL(path.join(root, scripts, hook)).href,
  };
}

function forkOnce(args: RenderArgs): Promise<{ outName: string }> {
  return new Promise((resolve, reject) => {
    if (args.signal?.aborted) {
      reject(new Error("Cancelled"));
      return;
    }

    const { workerPath, resolveHook } = workerFiles();

    let child: ChildProcess;
    try {
      // spawn (not fork) — avoids Turbopack resolving the script as a module graph entry.
      child = spawn(
        process.execPath,
        [
          `--import=${resolveHook}`,
          "--experimental-strip-types",
          "--no-warnings",
          workerPath,
        ],
        {
          stdio: ["ignore", "inherit", "inherit", "ipc"],
          env: process.env,
          windowsHide: true,
        },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      args.signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const onAbort = () => {
      try {
        child.send?.({ type: "abort" });
      } catch {
        // ignore
      }
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      finish(() => reject(new Error("Cancelled")));
    };
    args.signal?.addEventListener("abort", onAbort, { once: true });

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      finish(() => reject(new Error("Export worker timed out waiting for ready")));
    }, 30_000);

    child.on("message", (msg: { ready?: boolean; ok?: boolean; outName?: string; error?: string }) => {
      if (msg?.ready) {
        clearTimeout(timeout);
        try {
          child.send?.({
            type: "render",
            projectId: args.projectId,
            spec: args.spec,
            exportOptions: args.exportOptions,
          });
        } catch (err) {
          finish(() =>
            reject(err instanceof Error ? err : new Error(String(err))),
          );
        }
        return;
      }
      if (msg?.ok === true && msg.outName) {
        finish(() => resolve({ outName: msg.outName! }));
        return;
      }
      if (msg?.ok === false) {
        finish(() => reject(new Error(msg.error || "Export worker failed")));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      finish(() => reject(err));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (!settled) {
        finish(() =>
          reject(new Error(`Export worker exited early (code ${code ?? "?"})`)),
        );
      }
    });
  });
}
