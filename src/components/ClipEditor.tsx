"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AspectRatio, Job, RenderedClip } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";
import {
  defaultEditSpec,
  type EditSpec,
  type TextOverlay,
  type TransitionKind,
} from "@/lib/edit-types";

type Tab = "trim" | "text" | "color" | "audio" | "transitions";

function fmt(t: number) {
  if (!Number.isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

const TRANSITIONS: { id: TransitionKind; label: string }[] = [
  { id: "none", label: "Hard cut" },
  { id: "fade", label: "Crossfade" },
  { id: "fadeblack", label: "Dip to black" },
  { id: "fadewhite", label: "Dip to white" },
];

export function ClipEditor({
  job,
  clip,
  onClose,
}: {
  job: Job;
  clip: RenderedClip;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [duration, setDuration] = useState(clip.duration || 0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [spec, setSpec] = useState<EditSpec>(() =>
    defaultEditSpec(clip.duration || 0),
  );
  const [tab, setTab] = useState<Tab>("trim");
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(80);
  const [expanded, setExpanded] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ previewUrl: string; downloadUrl: string } | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const aspect = (job.aspectRatio || "9:16") as AspectRatio;
  const preset = ASPECT_PRESETS[aspect];

  const colorFilter = useMemo(
    () =>
      `brightness(${spec.color.brightness}) contrast(${spec.color.contrast}) saturate(${spec.color.saturation})`,
    [spec.color],
  );

  const segments = spec.segments;

  const isInGap = useCallback(
    (t: number) => !segments.some((s) => t >= s.start - 0.001 && t <= s.end + 0.001),
    [segments],
  );

  // Keep playhead in sync + skip removed gaps during playback
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime;
      if (playing && isInGap(t)) {
        const next = segments
          .filter((s) => s.start > t)
          .sort((a, b) => a.start - b.start)[0];
        if (next) {
          v.currentTime = next.start;
        } else {
          v.pause();
        }
      }
      setCurrent(v.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => {
      const d = v.duration || clip.duration || 0;
      setDuration(d);
      setSpec((prev) => {
        if (prev.segments.length === 1 && prev.segments[0].end === 0) {
          return defaultEditSpec(d);
        }
        return prev;
      });
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [playing, isInGap, segments, clip.duration]);

  // Sync optional music preview to the video
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.currentTime = current;
      a.volume = Math.min(1, spec.audio.volume);
      a.play().catch(() => {});
    } else {
      a.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (isInGap(v.currentTime)) {
        const first = segments[0];
        if (first) v.currentTime = first.start;
      }
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
    setCurrent(v.currentTime);
  }

  // ---- timeline pointer helpers ----
  function timeFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(duration, x / pxPerSec));
  }

  function startDrag(
    onMove: (t: number) => void,
    onUp?: () => void,
  ) {
    const move = (e: PointerEvent) => onMove(timeFromClientX(e.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onUp?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- segment ops ----
  function splitAtPlayhead() {
    const t = current;
    setSpec((prev) => {
      const segs = [...prev.segments];
      const idx = segs.findIndex((s) => t > s.start + 0.1 && t < s.end - 0.1);
      if (idx === -1) return prev;
      const s = segs[idx];
      const a = { id: uid("seg"), start: s.start, end: t };
      const b = { id: uid("seg"), start: t, end: s.end };
      segs.splice(idx, 1, a, b);
      return { ...prev, segments: segs };
    });
  }

  function deleteSegment(id: string) {
    setSpec((prev) => {
      if (prev.segments.length <= 1) return prev;
      return { ...prev, segments: prev.segments.filter((s) => s.id !== id) };
    });
  }

  function updateSegment(id: string, patch: Partial<{ start: number; end: number }>) {
    setSpec((prev) => ({
      ...prev,
      segments: prev.segments.map((s) => {
        if (s.id !== id) return s;
        let start = patch.start ?? s.start;
        let end = patch.end ?? s.end;
        start = Math.max(0, Math.min(start, end - 0.2));
        end = Math.min(duration, Math.max(end, start + 0.2));
        return { ...s, start, end };
      }),
    }));
  }

  // ---- text ops ----
  function addText() {
    const start = current;
    const end = Math.min(duration, current + 3);
    const t: TextOverlay = {
      id: uid("txt"),
      text: "New text",
      start,
      end,
      x: 0.5,
      y: 0.5,
      size: 0.07,
      color: "#ffffff",
      bold: true,
      background: false,
    };
    setSpec((prev) => ({ ...prev, texts: [...prev.texts, t] }));
    setSelectedText(t.id);
    setTab("text");
  }

  function updateText(id: string, patch: Partial<TextOverlay>) {
    setSpec((prev) => ({
      ...prev,
      texts: prev.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function removeText(id: string) {
    setSpec((prev) => ({ ...prev, texts: prev.texts.filter((t) => t.id !== id) }));
    if (selectedText === id) setSelectedText(null);
  }

  function dragTextOnPreview(id: string, e: React.PointerEvent) {
    e.preventDefault();
    const box = previewRef.current;
    if (!box) return;
    const move = (ev: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      updateText(id, {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- audio ----
  async function onAudioFile(file: File) {
    setUploadingAudio(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/edit/${job.id}/${clip.id}/audio`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setAudioName(file.name);
      setSpec((prev) => ({ ...prev, audio: { ...prev.audio, filename: data.filename } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setUploadingAudio(false);
    }
  }

  // ---- export ----
  async function exportEdit() {
    setExporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/edit/${job.id}/${clip.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      setResult({ previewUrl: data.previewUrl, downloadUrl: data.downloadUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const visibleTexts = spec.texts.filter(
    (t) => current >= t.start && current <= t.end,
  );

  const timelineWidth = Math.max(320, duration * pxPerSec);
  const ticks = useMemo(() => {
    const step = pxPerSec < 40 ? 5 : pxPerSec < 90 ? 2 : 1;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return out;
  }, [duration, pxPerSec]);

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true">
      <div className="editor-shell">
        <header className="editor-top">
          <div>
            <p className="editor-kicker">Editing</p>
            <h2 className="editor-title">{clip.title}</h2>
          </div>
          <div className="editor-top-actions">
            <button className="btn ghost" onClick={onClose} title="Back to Clippers">
              ← Back
            </button>
            <button className="btn primary" onClick={exportEdit} disabled={exporting}>
              {exporting ? "Exporting…" : "Export video"}
            </button>
          </div>
        </header>

        <div className="editor-main">
          <div className="editor-stage">
            <div
              className="editor-preview"
              ref={previewRef}
              style={{ aspectRatio: `${preset.w} / ${preset.h}` }}
            >
              <video
                ref={videoRef}
                src={clip.previewUrl}
                playsInline
                preload="auto"
                style={{ filter: colorFilter }}
                onClick={togglePlay}
              />
              {visibleTexts.map((t) => (
                <div
                  key={t.id}
                  className={`overlay-text${selectedText === t.id ? " selected" : ""}${t.background ? " boxed" : ""}`}
                  style={{
                    left: `${t.x * 100}%`,
                    top: `${t.y * 100}%`,
                    color: t.color,
                    fontSize: `clamp(10px, ${t.size * 100}cqw, 200px)`,
                    fontWeight: t.bold ? 800 : 500,
                  }}
                  onPointerDown={(e) => {
                    setSelectedText(t.id);
                    setTab("text");
                    dragTextOnPreview(t.id, e);
                  }}
                >
                  {t.text || " "}
                </div>
              ))}
              {spec.audio.filename && (
                <audio
                  ref={audioRef}
                  src={`/api/edit/${job.id}/${clip.id}/audio-file?name=${encodeURIComponent(spec.audio.filename)}`}
                />
              )}
            </div>

            <div className="editor-transport">
              <button className="btn round" onClick={() => seek(current - 1)} title="Back 1s">
                ‹
              </button>
              <button className="btn round big" onClick={togglePlay}>
                {playing ? "❚❚" : "►"}
              </button>
              <button className="btn round" onClick={() => seek(current + 1)} title="Forward 1s">
                ›
              </button>
              <span className="editor-time">
                {fmt(current)} <em>/ {fmt(duration)}</em>
              </span>
            </div>
          </div>

          <aside className="editor-panel">
            <nav className="editor-tabs">
              {(["trim", "text", "color", "audio", "transitions"] as Tab[]).map((id) => (
                <button
                  key={id}
                  className={tab === id ? "tab on" : "tab"}
                  onClick={() => setTab(id)}
                >
                  {id}
                </button>
              ))}
            </nav>

            <div className="editor-panel-body">
              {tab === "trim" && (
                <div className="tool">
                  <p className="tool-hint">
                    Split at the playhead, then delete parts you don’t want.
                  </p>
                  <button className="btn wide" onClick={splitAtPlayhead}>
                    ✂ Split at playhead
                  </button>
                  <div className="seg-list">
                    {segments.map((s, i) => (
                      <div key={s.id} className="seg-row">
                        <span>
                          Clip {i + 1}: {fmt(s.start)} – {fmt(s.end)}
                        </span>
                        <button
                          className="btn tiny danger"
                          disabled={segments.length <= 1}
                          onClick={() => deleteSegment(s.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "text" && (
                <div className="tool">
                  <button className="btn wide" onClick={addText}>
                    ＋ Add text
                  </button>
                  {spec.texts.length === 0 && (
                    <p className="tool-hint">No text yet. Add one, then drag it on the video.</p>
                  )}
                  {spec.texts.map((t) => (
                    <div
                      key={t.id}
                      className={`text-card${selectedText === t.id ? " on" : ""}`}
                      onClick={() => setSelectedText(t.id)}
                    >
                      <input
                        className="field"
                        value={t.text}
                        onChange={(e) => updateText(t.id, { text: e.target.value })}
                      />
                      <div className="row">
                        <label>Color</label>
                        <input
                          type="color"
                          value={t.color}
                          onChange={(e) => updateText(t.id, { color: e.target.value })}
                        />
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={t.bold}
                            onChange={(e) => updateText(t.id, { bold: e.target.checked })}
                          />
                          Bold
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={t.background}
                            onChange={(e) => updateText(t.id, { background: e.target.checked })}
                          />
                          Box
                        </label>
                      </div>
                      <div className="row">
                        <label>Size</label>
                        <input
                          type="range"
                          min={0.03}
                          max={0.2}
                          step={0.005}
                          value={t.size}
                          onChange={(e) => updateText(t.id, { size: Number(e.target.value) })}
                        />
                      </div>
                      <div className="row">
                        <label>Show</label>
                        <span className="mono">
                          {fmt(t.start)}–{fmt(t.end)}
                        </span>
                        <button
                          className="btn tiny"
                          onClick={() => updateText(t.id, { start: current })}
                        >
                          Set start
                        </button>
                        <button
                          className="btn tiny"
                          onClick={() => updateText(t.id, { end: current })}
                        >
                          Set end
                        </button>
                      </div>
                      <button className="btn tiny danger" onClick={() => removeText(t.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {tab === "color" && (
                <div className="tool">
                  <Slider
                    label="Brightness"
                    min={0}
                    max={2}
                    value={spec.color.brightness}
                    onChange={(v) =>
                      setSpec((p) => ({ ...p, color: { ...p.color, brightness: v } }))
                    }
                  />
                  <Slider
                    label="Contrast"
                    min={0}
                    max={2}
                    value={spec.color.contrast}
                    onChange={(v) =>
                      setSpec((p) => ({ ...p, color: { ...p.color, contrast: v } }))
                    }
                  />
                  <Slider
                    label="Saturation"
                    min={0}
                    max={3}
                    value={spec.color.saturation}
                    onChange={(v) =>
                      setSpec((p) => ({ ...p, color: { ...p.color, saturation: v } }))
                    }
                  />
                  <button
                    className="btn wide"
                    onClick={() =>
                      setSpec((p) => ({
                        ...p,
                        color: { brightness: 1, contrast: 1, saturation: 1 },
                      }))
                    }
                  >
                    Reset color
                  </button>
                </div>
              )}

              {tab === "audio" && (
                <div className="tool">
                  <label className="btn wide">
                    {uploadingAudio ? "Uploading…" : audioName ? `♪ ${audioName}` : "＋ Add music / sound"}
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onAudioFile(f);
                      }}
                    />
                  </label>
                  <Slider
                    label="Original audio"
                    min={0}
                    max={2}
                    value={spec.audio.originalVolume}
                    onChange={(v) =>
                      setSpec((p) => ({ ...p, audio: { ...p.audio, originalVolume: v } }))
                    }
                  />
                  {spec.audio.filename && (
                    <>
                      <Slider
                        label="Added track"
                        min={0}
                        max={2}
                        value={spec.audio.volume}
                        onChange={(v) =>
                          setSpec((p) => ({ ...p, audio: { ...p.audio, volume: v } }))
                        }
                      />
                      <button
                        className="btn tiny danger"
                        onClick={() => {
                          setAudioName(null);
                          setSpec((p) => ({ ...p, audio: { ...p.audio, filename: undefined } }));
                        }}
                      >
                        Remove track
                      </button>
                    </>
                  )}
                </div>
              )}

              {tab === "transitions" && (
                <div className="tool">
                  <p className="tool-label">Between cuts</p>
                  <div className="chip-row">
                    {TRANSITIONS.map((tr) => (
                      <button
                        key={tr.id}
                        className={spec.cutTransition === tr.id ? "chip on" : "chip"}
                        onClick={() => setSpec((p) => ({ ...p, cutTransition: tr.id }))}
                      >
                        <span>{tr.label}</span>
                      </button>
                    ))}
                  </div>
                  <Slider
                    label="Transition length"
                    min={0.1}
                    max={2}
                    value={spec.cutTransitionDuration}
                    onChange={(v) => setSpec((p) => ({ ...p, cutTransitionDuration: v }))}
                  />
                  <Slider
                    label="Fade in"
                    min={0}
                    max={4}
                    value={spec.fadeIn}
                    onChange={(v) => setSpec((p) => ({ ...p, fadeIn: v }))}
                  />
                  <Slider
                    label="Fade out"
                    min={0}
                    max={4}
                    value={spec.fadeOut}
                    onChange={(v) => setSpec((p) => ({ ...p, fadeOut: v }))}
                  />
                </div>
              )}
            </div>

            {error && <p className="form-error">{error}</p>}
            {result && (
              <div className="export-result">
                <p>Export ready</p>
                <a className="btn primary wide" href={result.downloadUrl} download>
                  Download edited MP4
                </a>
              </div>
            )}
          </aside>
        </div>

        <section className={`editor-timeline${expanded ? " expanded" : ""}`}>
          <div className="timeline-bar">
            <span className="timeline-label">Timeline · {fmt(duration)}</span>
            <div className="timeline-tools">
              <button className="btn tiny" onClick={() => setPxPerSec((p) => Math.max(20, p - 20))}>
                −
              </button>
              <span className="mono">zoom</span>
              <button className="btn tiny" onClick={() => setPxPerSec((p) => Math.min(240, p + 20))}>
                ＋
              </button>
              <button className="btn tiny" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Minimize" : "Maximize"}
              </button>
            </div>
          </div>

          <div className="timeline-scroll" ref={trackRef}>
            <div className="timeline-inner" style={{ width: timelineWidth }}>
              <div
                className="ruler"
                onPointerDown={(e) => {
                  seek(timeFromClientX(e.clientX));
                  startDrag((t) => seek(t));
                }}
              >
                {ticks.map((t) => (
                  <span key={t} className="tick" style={{ left: t * pxPerSec }}>
                    {fmt(t).replace(/\.\d+$/, "")}
                  </span>
                ))}
              </div>

              <div className="track track-video">
                {segments.map((s) => (
                  <div
                    key={s.id}
                    className="seg-block"
                    style={{ left: s.start * pxPerSec, width: (s.end - s.start) * pxPerSec }}
                  >
                    <span
                      className="seg-handle left"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startDrag((t) => updateSegment(s.id, { start: t }));
                      }}
                    />
                    <span className="seg-mid">clip</span>
                    <span
                      className="seg-handle right"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startDrag((t) => updateSegment(s.id, { end: t }));
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="track track-text">
                {spec.texts.map((t) => (
                  <div
                    key={t.id}
                    className={`text-block${selectedText === t.id ? " on" : ""}`}
                    style={{ left: t.start * pxPerSec, width: (t.end - t.start) * pxPerSec }}
                    onPointerDown={(e) => {
                      setSelectedText(t.id);
                      setTab("text");
                      const grabStart = t.start;
                      const grabEnd = t.end;
                      const t0 = timeFromClientX(e.clientX);
                      startDrag((tt) => {
                        const delta = tt - t0;
                        const len = grabEnd - grabStart;
                        let ns = Math.max(0, Math.min(duration - len, grabStart + delta));
                        updateText(t.id, { start: ns, end: ns + len });
                      });
                    }}
                  >
                    {t.text}
                  </div>
                ))}
              </div>

              {spec.audio.filename && (
                <div className="track track-audio">
                  <div className="audio-block" style={{ width: timelineWidth }}>
                    ♪ {audioName || "added track"}
                  </div>
                </div>
              )}

              <div className="playhead" style={{ left: current * pxPerSec }} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider">
      <div className="slider-top">
        <label>{label}</label>
        <span className="mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
