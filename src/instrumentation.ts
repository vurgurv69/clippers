/**
 * Server boot — warm Whisper singleton + ensure cache dirs exist.
 * Placed under `src/` so Next loads it once per Node process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const root = path.join(process.cwd(), ".data", "cache");
    await fs.mkdir(path.join(root, "downloads"), { recursive: true });
  } catch {
    // ignore
  }
  try {
    const { warmWhisper } = await import("@/lib/whisper");
    void warmWhisper("fast");
  } catch (err) {
    console.warn(
      "[boot] Whisper warm skipped",
      err instanceof Error ? err.message : err,
    );
  }
}
