import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { exportsDir, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; name: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id, name } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const safe = path.basename(name);
  const ext = path.extname(safe).toLowerCase();
  const TYPES: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".gif": "image/gif",
    ".mov": "video/quicktime",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  const allowed =
    (safe.startsWith("export-") && Boolean(TYPES[ext])) ||
    (safe.startsWith("thumb_export_") && (ext === ".png" || ext === ".jpg"));
  if (!allowed || !TYPES[ext]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(exportsDir(id), safe);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const type = TYPES[ext];
  const download = new URL(request.url).searchParams.get("download") === "1";
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(buffer.length),
      "Content-Disposition": download
        ? `attachment; filename="clippers-edit${ext}"`
        : `inline; filename="clippers-edit${ext}"`,
      "Cache-Control": "no-store",
    },
  });
}
