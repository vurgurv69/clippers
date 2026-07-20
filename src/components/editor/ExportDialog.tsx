"use client";

import { useEffect, useMemo, useState } from "react";
import type { AspectRatio } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import {
  DEFAULT_EXPORT,
  EXPORT_CODECS,
  EXPORT_FORMATS,
  EXPORT_FPS,
  EXPORT_QUALITIES,
  EXPORT_RESOLUTIONS,
  type ExportCodec,
  type ExportOptions,
} from "@/lib/editor-types";

const FAV_EXPORT_KEY = "clippers.fav.exportPresets";

type NamedPreset = { id: string; label: string; options: ExportOptions };

const BUILTIN: NamedPreset[] = [
  {
    id: "yt-1080",
    label: "YouTube 1080",
    options: { ...DEFAULT_EXPORT, format: "mp4", codec: "h264", resolution: 1080, fps: 30, quality: "high" },
  },
  {
    id: "reels-1080",
    label: "Reels / TikTok",
    options: { ...DEFAULT_EXPORT, format: "mp4", codec: "h264", resolution: 1080, fps: 30, quality: "high" },
  },
  {
    id: "4k-hq",
    label: "4K High",
    options: { ...DEFAULT_EXPORT, format: "mp4", codec: "h264", resolution: 2160, fps: 30, quality: "high" },
  },
  {
    id: "web-fast",
    label: "Web Fast",
    options: { ...DEFAULT_EXPORT, format: "mp4", codec: "h264", resolution: 720, fps: 30, quality: "medium" },
  },
  {
    id: "gif-share",
    label: "GIF",
    options: { ...DEFAULT_EXPORT, format: "gif", resolution: 720, fps: 20, quality: "medium" },
  },
];

function loadFavs(): NamedPreset[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_EXPORT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function ExportDialog({
  options,
  setOptions,
  duration,
  aspect,
  onCancel,
  onConfirm,
  onOpenGrowthHub,
}: {
  options: ExportOptions;
  setOptions: (o: ExportOptions) => void;
  duration: number;
  aspect: AspectRatio;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenGrowthHub?: () => void;
}) {
  const [hwLabel, setHwLabel] = useState("Detecting…");
  const [hwAvailable, setHwAvailable] = useState(false);
  const [favs, setFavs] = useState<NamedPreset[]>(() => loadFavs());

  const codec: ExportCodec =
    options.format === "gif"
      ? "h264"
      : options.format === "webm"
        ? options.codec === "av1"
          ? "av1"
          : "vp9"
        : options.codec === "hevc" || options.codec === "av1"
          ? options.codec
          : "h264";

  const codecsForFormat = useMemo(
    () => EXPORT_CODECS.filter((c) => c.formats.includes(options.format)),
    [options.format],
  );

  useEffect(() => {
    let alive = true;
    const q = codec === "vp9" ? "h264" : codec;
    fetch(`/api/editor/hw?codec=${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setHwAvailable(Boolean(d.available));
        setHwLabel(d.label || "CPU");
      })
      .catch(() => {
        if (!alive) return;
        setHwAvailable(false);
        setHwLabel("CPU");
      });
    return () => {
      alive = false;
    };
  }, [codec]);

  const preset = ASPECT_PRESETS[aspect] || ASPECT_PRESETS["9:16"];
  const scale = options.resolution / 1080;
  const outW = Math.round((preset.w * scale) / 2) * 2;
  const outH = Math.round((preset.h * scale) / 2) * 2;

  const baseMbps =
    options.resolution >= 4320
      ? 80
      : options.resolution >= 2160
        ? 35
        : options.resolution >= 1440
          ? 16
          : options.resolution >= 1080
            ? 8
            : 5;
  const codecFactor = codec === "av1" ? 0.55 : codec === "hevc" ? 0.7 : codec === "vp9" ? 0.65 : 1;
  const qFactor = options.quality === "high" ? 1 : options.quality === "medium" ? 0.7 : 0.45;
  const fpsFactor = options.fps / 30;
  const mbps = options.format === "gif" ? 0 : baseMbps * qFactor * fpsFactor * codecFactor;
  const sizeMB =
    options.format === "gif" ? Math.max(1, duration * 1.2) : Math.max(0.1, (mbps * duration) / 8);

  const hwEligible =
    (options.format === "mp4" || options.format === "mov") &&
    (codec === "h264" || codec === "hevc" || codec === "av1");

  // Rough encode ETA: realtime factor by codec/res/hw
  const speedFactor =
    (hwEligible && options.hwEncode !== false && hwAvailable ? 2.2 : 0.85) *
    (codec === "av1" ? 0.25 : codec === "hevc" ? 0.45 : codec === "vp9" ? 0.5 : 1) *
    (options.resolution >= 2160 ? 0.55 : options.resolution >= 1440 ? 0.75 : 1);
  const etaSec = Math.max(2, duration / Math.max(0.08, speedFactor));
  const etaLabel =
    etaSec >= 60
      ? `${Math.floor(etaSec / 60)}m ${Math.round(etaSec % 60)}s`
      : `${Math.round(etaSec)}s`;

  function setFormat(format: ExportOptions["format"]) {
    let nextCodec: ExportCodec = codec;
    if (format === "webm") nextCodec = codec === "av1" ? "av1" : "vp9";
    else if (format === "gif") nextCodec = "h264";
    else if (codec === "vp9") nextCodec = "h264";
    setOptions({ ...options, format, codec: nextCodec });
  }

  function encoderHint() {
    if (options.format === "gif") return "palette";
    if (hwEligible && options.hwEncode !== false && hwAvailable) return hwLabel;
    if (codec === "hevc") return "CPU (libx265)";
    if (codec === "av1") return "CPU (libaom-av1)";
    if (codec === "vp9") return "CPU (libvpx-vp9)";
    return "CPU (libx264)";
  }

  function saveFavorite() {
    const label = window.prompt("Preset name", `${options.resolution}p ${options.format}`);
    if (!label?.trim()) return;
    const next: NamedPreset = {
      id: `fav-${Date.now()}`,
      label: label.trim(),
      options: { ...options },
    };
    const list = [...favs, next].slice(-12);
    setFavs(list);
    try {
      localStorage.setItem(FAV_EXPORT_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }

  const allPresets = [...BUILTIN, ...favs];

  return (
    <div className="export-overlay" role="dialog" aria-modal="true" aria-label="Export settings">
      <div className="export-dialog">
        <header className="export-head">
          <h3>Export video</h3>
          <button className="btn ghost" onClick={onCancel}>
            ✕
          </button>
        </header>

        <div className="export-body">
          <div className="export-group">
            <span className="export-label">Presets</span>
            <div className="seg wrap">
              {allPresets.map((p) => (
                <button
                  key={p.id}
                  className="seg-btn"
                  onClick={() => setOptions({ ...options, ...p.options })}
                  title={p.label}
                >
                  {p.label}
                </button>
              ))}
              <button className="seg-btn" onClick={saveFavorite} title="Save current as favorite">
                ★ Save
              </button>
            </div>
          </div>

          <div className="export-group">
            <span className="export-label">Format</span>
            <div className="seg">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  className={options.format === f.id ? "seg-btn on" : "seg-btn"}
                  onClick={() => setFormat(f.id)}
                  title={f.hint}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {options.format !== "gif" && codecsForFormat.length > 1 && (
            <div className="export-group">
              <span className="export-label">Codec</span>
              <div className="seg">
                {codecsForFormat.map((c) => (
                  <button
                    key={c.id}
                    className={codec === c.id ? "seg-btn on" : "seg-btn"}
                    onClick={() => setOptions({ ...options, codec: c.id })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="export-group">
            <span className="export-label">Resolution</span>
            <div className="seg">
              {EXPORT_RESOLUTIONS.map((r) => (
                <button
                  key={r.id}
                  className={options.resolution === r.id ? "seg-btn on" : "seg-btn"}
                  onClick={() => setOptions({ ...options, resolution: r.id })}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="export-group">
            <span className="export-label">Frame rate</span>
            <div className="seg">
              {EXPORT_FPS.map((f) => (
                <button
                  key={f}
                  className={options.fps === f ? "seg-btn on" : "seg-btn"}
                  onClick={() => setOptions({ ...options, fps: f })}
                  disabled={options.format === "gif" && f > 30}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="export-group">
            <span className="export-label">Quality</span>
            <div className="seg">
              {EXPORT_QUALITIES.map((q) => (
                <button
                  key={q.id}
                  className={options.quality === q.id ? "seg-btn on" : "seg-btn"}
                  onClick={() => setOptions({ ...options, quality: q.id })}
                  disabled={options.format === "gif"}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {hwEligible && (
            <label className="export-group seg-row">
              <span className="export-label">
                Hardware encode {hwAvailable ? `(${hwLabel})` : "(not available)"}
              </span>
              <input
                type="checkbox"
                checked={options.hwEncode !== false && hwAvailable}
                disabled={!hwAvailable}
                onChange={(e) => setOptions({ ...options, hwEncode: e.target.checked })}
              />
            </label>
          )}

          <label className="export-group seg-row">
            <span className="export-label">
              Karaoke captions (Whisper words)
            </span>
            <input
              type="checkbox"
              checked={Boolean(options.karaokeCaptions)}
              onChange={(e) =>
                setOptions({ ...options, karaokeCaptions: e.target.checked })
              }
            />
          </label>
          {options.karaokeCaptions && (
            <p className="tool-hint">
              Burns word-level captions from a cached transcript. Transcribe in the Script
              tab first.
            </p>
          )}

          <div className="export-estimate">
            <div>
              <span className="est-k">Output</span>
              <span className="est-v">
                {options.format === "gif" ? "640" : outW}×
                {options.format === "gif" ? Math.round((outH / outW) * 640) : outH} ·{" "}
                {options.format.toUpperCase()}
                {options.format !== "gif" ? ` · ${codec.toUpperCase()}` : ""}
              </span>
            </div>
            <div>
              <span className="est-k">Duration</span>
              <span className="est-v">{duration.toFixed(1)}s</span>
            </div>
            <div>
              <span className="est-k">Est. size</span>
              <span className="est-v">
                {sizeMB >= 1 ? `${sizeMB.toFixed(0)} MB` : `${(sizeMB * 1024).toFixed(0)} KB`}
              </span>
            </div>
            <div>
              <span className="est-k">Est. time</span>
              <span className="est-v">~{etaLabel}</span>
            </div>
            <div>
              <span className="est-k">Encoder</span>
              <span className="est-v">{encoderHint()}</span>
            </div>
            <div>
              <span className="est-k">Frames</span>
              <span className="est-v">{Math.round(duration * options.fps).toLocaleString()}</span>
            </div>
          </div>
          {options.format === "gif" && (
            <p className="tool-hint">GIF has no audio and is capped at 640px / 20fps.</p>
          )}
          {codec === "av1" && (
            <p className="tool-hint">AV1 is slower to encode but much smaller files.</p>
          )}
          {options.resolution >= 4320 && (
            <p className="tool-hint">8K exports need a lot of RAM and time.</p>
          )}
        </div>

        <footer className="export-foot">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          {onOpenGrowthHub && (
            <button type="button" className="btn" onClick={onOpenGrowthHub}>
              Growth Hub
            </button>
          )}
          <button className="btn primary" onClick={onConfirm}>
            ⤓ Render {options.format.toUpperCase()}
          </button>
        </footer>
      </div>
    </div>
  );
}
