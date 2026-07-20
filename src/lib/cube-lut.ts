/** Parse Adobe/.cube 3D LUT files for WebGL preview. */

export type CubeLut = {
  title: string;
  size: number;
  /** RGB triples, length size³, blue-major then green then red (standard DOMAIN). */
  data: Float32Array;
};

export function parseCubeLut(text: string): CubeLut {
  const lines = text.split(/\r?\n/);
  let size = 0;
  let title = "LUT";
  const values: number[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TITLE")) {
      const m = line.match(/TITLE\s+"?([^"]+)"?/i);
      if (m) title = m[1].trim();
      continue;
    }
    if (/^LUT_3D_SIZE\s+/i.test(line)) {
      size = Number.parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (/^(DOMAIN_|LUT_1D_|LUT_3D_INPUT)/i.test(line)) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }
  if (size < 2 || size > 65) {
    throw new Error("Unsupported LUT size");
  }
  const need = size * size * size * 3;
  if (values.length < need) {
    throw new Error("Incomplete .cube data");
  }
  return { title, size, data: new Float32Array(values.slice(0, need)) };
}

/**
 * Pack LUT into an RGBA8 texture: width = size*size, height = size.
 * Slice index = blue, within slice x=red y=green.
 */
export function cubeToTextureRGBA(lut: CubeLut): {
  width: number;
  height: number;
  pixels: Uint8Array;
} {
  const n = lut.size;
  const width = n * n;
  const height = n;
  const pixels = new Uint8Array(width * height * 4);
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const i = ((b * n + g) * n + r) * 3;
        const x = b * n + r;
        const y = g;
        const p = (y * width + x) * 4;
        pixels[p] = Math.round(Math.max(0, Math.min(1, lut.data[i])) * 255);
        pixels[p + 1] = Math.round(Math.max(0, Math.min(1, lut.data[i + 1])) * 255);
        pixels[p + 2] = Math.round(Math.max(0, Math.min(1, lut.data[i + 2])) * 255);
        pixels[p + 3] = 255;
      }
    }
  }
  return { width, height, pixels };
}

/** Tiny identity LUT used when no file is loaded. */
export function identityCube(size = 2): CubeLut {
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        data[i++] = r / (size - 1);
        data[i++] = g / (size - 1);
        data[i++] = b / (size - 1);
      }
    }
  }
  return { title: "Identity", size, data };
}
