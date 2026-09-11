/**
 * Sharp ships its own types, but tsconfig `"types": ["node"]` blocks auto-inclusion.
 * This ambient module keeps watermark / thumbnail pipelines type-clean.
 */
declare module "sharp" {
  type SharpInput =
    | Buffer
    | ArrayBuffer
    | Uint8Array
    | Uint8ClampedArray
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Float32Array
    | Float64Array
    | string;

  interface SharpInstance {
    metadata(): Promise<{ width?: number; height?: number; format?: string }>;
    resize(
      width?: number,
      height?: number,
      options?: { fit?: string; withoutEnlargement?: boolean },
    ): SharpInstance;
    greyscale(): SharpInstance;
    grayscale(): SharpInstance;
    raw(): SharpInstance;
    jpeg(options?: { quality?: number }): SharpInstance;
    png(options?: { quality?: number; compressionLevel?: number }): SharpInstance;
    toBuffer(): Promise<Buffer>;
    toBuffer(
      options: { resolveWithObject: true },
    ): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }>;
    toFile(path: string): Promise<{ width: number; height: number }>;
  }

  function sharp(input?: SharpInput, options?: object): SharpInstance;
  export default sharp;
}
