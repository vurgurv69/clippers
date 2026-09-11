/**
 * Server-side upload validation via magic numbers (not client MIME/extension).
 */

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const MAX_UPLOAD_BYTES = 800 * 1024 * 1024;
const MIN_UPLOAD_BYTES = 50_000;

type MagicRule = {
  label: string;
  /** Return true if buffer matches this container. */
  test: (buf: Buffer) => boolean;
};

function hasBox(buf: Buffer, brand: string, offset = 4): boolean {
  if (buf.length < offset + 8) return false;
  return buf.subarray(offset, offset + 4).toString("ascii") === brand;
}

/** ISO BMFF (MP4/MOV/M4V) — ftyp box near start. */
function isIsoBmff(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // size(4) + 'ftyp'(4) + brand(4)
  if (hasBox(buf, "ftyp", 4)) return true;
  // Some files pad; scan first 64 bytes for ftyp
  const head = buf.subarray(0, Math.min(64, buf.length));
  for (let i = 0; i < head.length - 4; i++) {
    if (head.subarray(i, i + 4).toString("ascii") === "ftyp") return true;
  }
  return false;
}

function isWebmOrMatroska(buf: Buffer): boolean {
  // EBML header 0x1A45DFA3
  return (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  );
}

function isAvi(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "AVI "
  );
}

const VIDEO_RULES: MagicRule[] = [
  { label: "MP4/MOV", test: isIsoBmff },
  { label: "WebM/MKV", test: isWebmOrMatroska },
  { label: "AVI", test: isAvi },
];

export function assertVideoMagic(buf: Buffer): string {
  if (!buf || buf.length < 12) {
    throw new UploadValidationError("File is too small or empty.");
  }
  for (const rule of VIDEO_RULES) {
    if (rule.test(buf)) return rule.label;
  }
  throw new UploadValidationError(
    "File is not a recognized video container (MP4/MOV/WebM/AVI). Extension alone is not enough.",
  );
}

export function assertUploadSize(size: number) {
  if (size < MIN_UPLOAD_BYTES) {
    throw new UploadValidationError("File is too small to be a video.");
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError("File is too large (max ~800MB).");
  }
}

export { MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES };
