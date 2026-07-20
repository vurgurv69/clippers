/** Parse captions on/off from API body, form data, or stored job JSON. */
export function parseCaptionsEnabled(value: unknown, fallback = true): boolean {
  if (value === false || value === 0) return false;
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["false", "0", "off", "no", "none"].includes(v)) return false;
    if (["true", "1", "on", "yes"].includes(v)) return true;
  }
  return fallback;
}
