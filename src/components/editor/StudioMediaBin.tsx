"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ProjectAsset } from "@/lib/editor-types";

type Props = {
  assets: ProjectAsset[];
  uploading: boolean;
  mediaSearch: string;
  setMediaSearch: Dispatch<SetStateAction<string>>;
  favAssets: string[];
  assetUrl: (a: ProjectAsset) => string;
  onUpload: (files: FileList) => void;
  onCleanupUnused: () => void;
  onAdd: (a: ProjectAsset) => void;
  onAddOverlay?: (a: ProjectAsset) => void;
  onToggleFav: (id: string) => void;
  onRename: (a: ProjectAsset) => void;
  onReplace: (a: ProjectAsset, file: File) => void;
  onGenerateProxy?: (a: ProjectAsset) => void;
  onGenerateProxiesBatch?: () => void;
  onDelete: (a: ProjectAsset) => void;
};

type FolderId = "all" | "video" | "image" | "audio" | "broll";

const FOLDERS: { id: FolderId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Images" },
  { id: "broll", label: "B-roll" },
];

function assetHasBrollTag(tags?: string[]) {
  if (!tags?.length) return false;
  return tags.some((t) => {
    const lower = t.toLowerCase();
    return (
      lower.includes("broll") ||
      lower.includes("b-roll") ||
      lower === "stock" ||
      lower.startsWith("stock-")
    );
  });
}

export function StudioMediaBin({
  assets,
  uploading,
  mediaSearch,
  setMediaSearch,
  favAssets,
  assetUrl,
  onUpload,
  onCleanupUnused,
  onAdd,
  onAddOverlay,
  onToggleFav,
  onRename,
  onReplace,
  onGenerateProxy,
  onGenerateProxiesBatch,
  onDelete,
}: Props) {
  const [folder, setFolder] = useState<FolderId>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      for (const t of a.tags || []) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const visible = useMemo(() => {
    let list = [...assets];
    if (folder === "broll") {
      list = list.filter((a) => assetHasBrollTag(a.tags));
    } else if (folder === "video" || folder === "image" || folder === "audio") {
      list = list.filter(
        (a) => a.kind === folder || (folder === "image" && a.kind === "lut"),
      );
    }
    if (tagFilter) {
      list = list.filter((a) => a.tags?.includes(tagFilter));
    }
    const q = mediaSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.kind.includes(q) ||
          (a.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list.sort((a, b) => {
      const af = favAssets.includes(a.id) ? 0 : 1;
      const bf = favAssets.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  }, [assets, folder, tagFilter, favAssets, mediaSearch]);

  if (assets.length === 0) {
    return (
      <aside className="studio-bin cc-media">
        <div className="bin-empty pro-empty">
          <div className="empty-illustration" aria-hidden>
            <span className="empty-film" />
          </div>
          <p className="empty-title">Add media to start</p>
          <p className="empty-hint">Videos, photos, or audio — then drop them on the timeline</p>
          <label className="btn primary empty-import cc-import">
            {uploading ? "Uploading…" : "Import Media"}
            <input
              type="file"
              accept="video/*,image/*,audio/*,.cube,.ttf,.otf,.woff,.woff2"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </aside>
    );
  }

  return (
    <aside className="studio-bin cc-media">
      <label className="btn wide primary cc-import">
        {uploading ? "Uploading…" : "Import Media"}
        <input
          type="file"
          accept="video/*,image/*,audio/*,.cube,.ttf,.otf,.woff,.woff2"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <input
        className="cc-search"
        placeholder="Search media…"
        value={mediaSearch}
        onChange={(e) => setMediaSearch(e.target.value)}
        aria-label="Search media"
      />

      <div className="cc-cats" role="tablist" aria-label="Folders">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={folder === f.id}
            className={folder === f.id ? "cc-cat on" : "cc-cat"}
            onClick={() => setFolder(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="cc-cats cc-tag-filters" role="group" aria-label="Tag filters">
          <button
            type="button"
            className={!tagFilter ? "cc-cat on" : "cc-cat"}
            onClick={() => setTagFilter(null)}
          >
            All tags
          </button>
          {allTags.slice(0, 12).map((t) => (
            <button
              key={t}
              type="button"
              className={tagFilter === t ? "cc-cat on" : "cc-cat"}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="bin-mode-row cc-media-actions">
        <button type="button" className="btn tiny ghost" onClick={onCleanupUnused} title="Remove unused">
          Clean unused
        </button>
        {onGenerateProxiesBatch && (
          <button
            type="button"
            className="btn tiny ghost"
            onClick={onGenerateProxiesBatch}
            title="Build low-res proxies for all video/image"
          >
            Proxies all
          </button>
        )}
      </div>

      <div className="bin-grid" role="list" aria-label="Media library">
        {visible.map((a) => (
          <div key={a.id} className="bin-item-wrap" role="listitem">
            <button
              className={`bin-item${a.proxyFile ? " has-proxy" : ""}`}
              title={`${a.name} — drag or click to add`}
              aria-label={`Add ${a.name}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-clippers-asset", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={(e) => {
                if (
                  (e.shiftKey || e.altKey) &&
                  onAddOverlay &&
                  (a.kind === "image" || a.kind === "video")
                ) {
                  onAddOverlay(a);
                } else {
                  onAdd(a);
                }
              }}
            >
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(a)} alt={a.name} />
              ) : a.kind === "video" ? (
                <video src={assetUrl(a)} muted preload="metadata" />
              ) : a.kind === "lut" ? (
                <div className="bin-audio">LUT</div>
              ) : (
                <div className="bin-audio">Audio</div>
              )}
              <span>{a.name}</span>
              {a.tags && a.tags.length > 0 && (
                <em className="cc-asset-tags">{a.tags.slice(0, 3).join(" · ")}</em>
              )}
            </button>
            <div className="bin-actions">
              <button
                className={favAssets.includes(a.id) ? "th-btn on" : "th-btn"}
                title="Favorite"
                onClick={() => onToggleFav(a.id)}
              >
                ★
              </button>
              <button className="th-btn" title="Rename" onClick={() => onRename(a)}>
                Rename
              </button>
              <label className="th-btn" title="Replace">
                Replace
                <input
                  type="file"
                  hidden
                  accept={
                    a.kind === "audio"
                      ? "audio/*"
                      : a.kind === "lut"
                        ? ".cube"
                        : a.kind === "image"
                          ? "image/*"
                          : "video/*"
                  }
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onReplace(a, f);
                    e.target.value = "";
                  }}
                />
              </label>
              {onGenerateProxy && (a.kind === "video" || a.kind === "image") && (
                <button className="th-btn" title="Proxy" onClick={() => onGenerateProxy(a)}>
                  Proxy
                </button>
              )}
              <button className="th-btn" title="Remove from library" onClick={() => onDelete(a)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="cc-empty">Nothing in this folder</p>}
      </div>
    </aside>
  );
}
