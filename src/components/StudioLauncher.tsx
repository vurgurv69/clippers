"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, ProjectAsset } from "@/lib/editor-types";
import { StudioEditor } from "./editor/StudioEditor";

type RecentRow = {
  id: string;
  name: string;
  aspect: string;
  assetCount: number;
  hasSpec: boolean;
  updatedAt: string;
};

/**
 * Home-page entry to the multi-clip editor. Drag videos/photos from your files
 * onto the zone (or click) — it spins up a project, uploads the media, and
 * opens the full CapCut-style editor.
 */
export function StudioLauncher() {
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/editor/project");
      const data = await res.json();
      if (res.ok) setRecent((data.projects || []).slice(0, 8));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  // Phase 30 — open project handed off from AI ClipStudio
  useEffect(() => {
    try {
      const id =
        sessionStorage.getItem("clippers.openProject") ||
        (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("studio")
          : null);
      if (!id) return;
      sessionStorage.removeItem("clippers.openProject");
      void reopenProject(id);
      const el = document.getElementById("studio");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot handoff on mount
  }, []);

  async function reopenProject(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/project/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open project");
      setProject(data.project as Project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open project");
    } finally {
      setBusy(false);
    }
  }

  const openWithFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/editor/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect: "9:16" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start a project");
      const proj = data.project as Project;

      const assets: ProjectAsset[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const up = await fetch(`/api/editor/project/${proj.id}/asset`, {
          method: "POST",
          body: form,
        });
        const upData = await up.json();
        if (!up.ok) throw new Error(upData.error || `Failed to add ${file.name}`);
        assets.push(upData.asset as ProjectAsset);
      }
      setProject({ ...proj, assets });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  async function openEmpty() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/editor/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect: "9:16" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start a project");
      setProject({ ...(data.project as Project), assets: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const mediaFiles = (list: FileList | null) =>
    Array.from(list || []).filter((f) => /^(video|image|audio)\//.test(f.type) || /\.(mp4|mov|webm|mkv|m4v|jpg|jpeg|png|webp|gif|bmp|mp3|m4a|aac|wav|ogg)$/i.test(f.name));

  return (
    <div className="launcher">
      <div
        className={`launcher-drop${dragOver ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = mediaFiles(e.dataTransfer.files);
          if (files.length) openWithFiles(files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          hidden
          onChange={(e) => {
            const files = mediaFiles(e.target.files);
            if (files.length) openWithFiles(files);
          }}
        />
        <div className="launcher-inner">
          <span className="launcher-icon">✥</span>
          <p className="launcher-title">
            {busy ? "Loading your media…" : "Drag videos or photos here"}
          </p>
          <p className="launcher-sub">
            Multi-clip editor · trim, split, reorder, transitions, color & audio
          </p>
          <div className="launcher-actions">
            <button
              type="button"
              className="btn primary"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={busy}
            >
              Choose files
            </button>
            <button
              type="button"
              className="btn ghost light"
              onClick={(e) => {
                e.stopPropagation();
                openEmpty();
              }}
              disabled={busy}
            >
              Open empty editor
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="launcher-recent">
          <p className="tool-label">Recent projects</p>
          <div className="recent-list">
            {recent.map((p) => (
              <button
                key={p.id}
                className="recent-item"
                disabled={busy}
                onClick={() => reopenProject(p.id)}
                title={p.updatedAt}
              >
                <span className="recent-name">{p.name}</span>
                <span className="recent-meta">
                  {p.aspect} · {p.assetCount} media{p.hasSpec ? " · saved" : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {project && (
        <StudioEditor
          project={project}
          onClose={() => {
            setProject(null);
            refreshRecent();
          }}
        />
      )}
    </div>
  );
}
