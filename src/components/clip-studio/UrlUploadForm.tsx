"use client";

type Props = {
  url: string;
  file: File | null;
  busy: boolean;
  canSubmit: boolean;
  onUrlChange: (url: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function UrlUploadForm({
  url,
  file,
  busy,
  canSubmit,
  onUrlChange,
  onFileChange,
  onSubmit,
}: Props) {
  return (
    <>
      <form className="url-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="video-url">
          Video link
        </label>
        <input
          id="video-url"
          type="url"
          placeholder="Paste a YouTube / TikTok / Instagram link…"
          title="Full https URL works best. Short links sometimes fail."
          value={url}
          onChange={(e) => {
            onUrlChange(e.target.value);
            if (e.target.value.trim()) onFileChange(null);
          }}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !canSubmit}
          title={busy ? "Job running — pause or cancel below" : "Start download → captions → export"}
        >
          {busy ? "Working…" : "Make clips"}
        </button>
      </form>

      <div className="studio-actions">
        <label className={busy ? "upload-btn disabled" : "upload-btn"}>
          {file ? file.name : "Or upload MP4"}
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm"
            disabled={busy}
            hidden
            onChange={(e) => {
              const next = e.target.files?.[0] || null;
              onFileChange(next);
              if (next) onUrlChange("");
            }}
          />
        </label>
        {file && (
          <button
            type="button"
            className="upload-clear"
            disabled={busy}
            onClick={() => onFileChange(null)}
          >
            Clear
          </button>
        )}
      </div>
    </>
  );
}
