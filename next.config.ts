import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker / Railway use full node_modules + `next start` (Whisper needs native deps).
  serverExternalPackages: [
    "ffmpeg-static",
    "ffprobe-static",
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
  ],
};

export default nextConfig;
