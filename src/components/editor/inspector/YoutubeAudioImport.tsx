"use client";

import { useState } from "react";

export function YoutubeAudioImport({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (url: string) => void | Promise<void>;
}) {
  const [url, setUrl] = useState("");
  return (
    <div className="yt-audio-import">
      <input
        className="clip-layers-search"
        placeholder="Paste YouTube link…"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim()) void onImport(url.trim());
        }}
        aria-label="YouTube URL"
      />
      <button
        type="button"
        className="btn tiny"
        disabled={busy || !url.trim()}
        onClick={() => void onImport(url.trim())}
      >
        {busy ? "…" : "Get audio"}
      </button>
    </div>
  );
}
