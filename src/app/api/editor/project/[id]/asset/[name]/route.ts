import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { assetsDir, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; name: string }> };

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4v": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".cube": "text/plain",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function GET(request: Request, { params }: Params) {
  const { id, name } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const safe = path.basename(name);
  const asset = project.assets.find((a) => a.filename === safe);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const filePath = path.join(assetsDir(id), safe);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const type = TYPES[path.extname(safe).toLowerCase()] || "application/octet-stream";

  // Support HTTP range requests so <video> can seek smoothly. We read only the
  // requested slice into a Buffer (a valid BodyInit) rather than streaming a
  // Node Readable, which the route response layer may not accept.
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      const fd = fs.openSync(filePath, "r");
      try {
        const chunkSize = end - start + 1;
        const buf = Buffer.alloc(chunkSize);
        fs.readSync(fd, buf, 0, chunkSize, start);
        return new NextResponse(buf, {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
            "Cache-Control": "no-store",
          },
        });
      } finally {
        fs.closeSync(fd);
      }
    }
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
