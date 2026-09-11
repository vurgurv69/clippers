"use client";

import type { ReactNode } from "react";
import { CAPTION_THEMES } from "@/lib/caption-polish";
import type { CaptionAlign, CaptionFontFamily } from "@/lib/caption-style";
import { ASPECT_PRESETS } from "@/lib/types";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ClipMode,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  WhisperQuality,
} from "@/lib/types";
import { ColorPickerPopover } from "@/components/ui/ColorPickerPopover";
import { FontSelect } from "@/components/ui/FontSelect";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { TimeRangeSlider } from "@/components/ui/TimeRangeSlider";

const THEME_LIST = Object.values(CAPTION_THEMES);

export type ClipStudioControlValues = {
  clipMode: ClipMode;
  aspectRatio: AspectRatio;
  layoutMode: LayoutMode;
  captionsEnabled: boolean;
  whisperQuality: WhisperQuality;
  captionTheme: CaptionThemeId;
  captionReadMode: CaptionReadMode;
  captionEmojis: boolean;
  exportQuality: ExportQuality;
  exportCodec: ExportCodec;
  preferHwEncode: boolean;
  clipCount: number;
  manualStartTime: string;
  manualEndTime: string;
  captionPrimary: string;
  captionHighlight: string;
  captionFont: CaptionFontFamily;
  captionAlign: CaptionAlign;
  captionFontSize: number;
  captionOutline: number;
  captionBox: boolean;
  removeWatermark: boolean;
  stripBurnIn: boolean;
};

type Props = {
  value: ClipStudioControlValues;
  onChange: (patch: Partial<ClipStudioControlValues>) => void;
  busy?: boolean;
};

const label = "csc-label";

function Field({
  title,
  children,
  hint,
  center,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
  center?: boolean;
}) {
  return (
    <label className={center ? "csc-field-wrap center" : "csc-field-wrap"}>
      <span className={label}>{title}</span>
      {children}
      {hint ? <span className="csc-hint">{hint}</span> : null}
    </label>
  );
}

function CaptionStyleFields({
  v,
  set,
  busy,
}: {
  v: ClipStudioControlValues;
  set: (patch: Partial<ClipStudioControlValues>) => void;
  busy?: boolean;
}) {
  if (!v.captionsEnabled) return null;
  return (
    <>
      <div className="csc-grid-2">
        <Field title="Font">
          <FontSelect
            value={v.captionFont}
            disabled={busy}
            onChange={(captionFont) => set({ captionFont })}
          />
        </Field>
        <Field title="Position">
          <MenuSelect
            value={v.captionAlign}
            disabled={busy}
            aria-label="Caption position"
            onChange={(captionAlign) => set({ captionAlign: captionAlign as CaptionAlign })}
            options={[
              { value: "bottom", label: "Bottom" },
              { value: "middle", label: "Middle" },
              { value: "top", label: "Top" },
            ]}
          />
        </Field>
      </div>
      <div className="csc-grid-2">
        <Field title="Fill color" hint="Resting word color" center>
          <div className="csc-color-row">
            <ColorPickerPopover
              label="Caption fill color"
              value={v.captionPrimary}
              disabled={busy}
              onChange={(captionPrimary) => set({ captionPrimary })}
            />
          </div>
        </Field>
        <Field title="Highlight" hint="Active word color" center>
          <div className="csc-color-row">
            <ColorPickerPopover
              label="Caption highlight color"
              value={v.captionHighlight}
              disabled={busy}
              onChange={(captionHighlight) => set({ captionHighlight })}
            />
          </div>
        </Field>
      </div>
      <div className="csc-grid-3">
        <Field title={`Size ${v.captionFontSize}`}>
          <input
            type="range"
            min={36}
            max={110}
            value={v.captionFontSize}
            disabled={busy}
            onChange={(e) => set({ captionFontSize: Number(e.target.value) })}
            className="csc-range"
          />
        </Field>
        <Field title={`Outline ${v.captionOutline}`}>
          <input
            type="range"
            min={0}
            max={14}
            value={v.captionOutline}
            disabled={busy}
            onChange={(e) => set({ captionOutline: Number(e.target.value) })}
            className="csc-range"
          />
        </Field>
        <Field title="Box">
          <MenuSelect
            value={v.captionBox ? "on" : "off"}
            disabled={busy}
            aria-label="Caption box"
            onChange={(val) => set({ captionBox: val === "on" })}
            options={[
              { value: "off", label: "Shadow / stroke" },
              { value: "on", label: "Background box" },
            ]}
          />
        </Field>
      </div>
    </>
  );
}

export function ClipStudioControls({ value, onChange, busy }: Props) {
  const v = value;
  const set = onChange;
  const viral = v.clipMode !== "social";

  function setMode(mode: ClipMode) {
    if (mode === "social") {
      set({
        clipMode: "social",
        clipCount: 1,
        removeWatermark: true,
        exportQuality: "maximum",
        exportCodec: "h264",
        aspectRatio: "9:16",
        layoutMode: "fill",
        stripBurnIn: v.stripBurnIn,
      });
      return;
    }
    set({ clipMode: "viral" });
  }

  return (
    <section className="csc-panel">
      <div className="csc-head">
        <p className="csc-title">Clip mode</p>
        <p className="csc-sub">
          {viral
            ? "Long videos → find the best moments to share"
            : "Short / quick videos · no watermark, ready to post"}
        </p>
      </div>

      <div className="csc-mode-switch" role="tablist" aria-label="Clip mode">
        <button
          type="button"
          role="tab"
          aria-selected={viral}
          disabled={busy}
          onClick={() => setMode("viral")}
          className={viral ? "csc-mode on viral" : "csc-mode"}
          title="Best moments from longer videos"
        >
          Long videos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!viral}
          disabled={busy}
          onClick={() => setMode("social")}
          className={!viral ? "csc-mode on social" : "csc-mode"}
          title="Short or quick clips without watermarks"
        >
          Quick videos
        </button>
      </div>

      <div className="csc-body">
        {viral ? (
          <>
            <div>
              <p className={`${label} csc-mb`}>How many clips</p>
              <div className="csc-pills" role="group" aria-label="Number of clips">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const on = v.clipCount === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={busy}
                      aria-pressed={on}
                      onClick={() => set({ clipCount: n })}
                      className={on ? "csc-pill on" : "csc-pill"}
                      title={`Make ${n} clip${n === 1 ? "" : "s"}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <TimeRangeSlider
              start={v.manualStartTime}
              end={v.manualEndTime}
              disabled={busy}
              onChange={(patch) => set(patch)}
            />

            <div className="csc-grid-3">
              <Field title="Frame">
                <MenuSelect
                  value={v.aspectRatio}
                  disabled={busy}
                  aria-label="Frame"
                  onChange={(aspectRatio) =>
                    set({ aspectRatio: aspectRatio as AspectRatio })
                  }
                  options={(Object.keys(ASPECT_PRESETS) as AspectRatio[]).map((key) => ({
                    value: key,
                    label: `${ASPECT_PRESETS[key].label} — ${ASPECT_PRESETS[key].hint}`,
                  }))}
                />
              </Field>
              <Field title="Layout">
                <MenuSelect
                  value={v.layoutMode === "auto" ? "fill" : v.layoutMode}
                  disabled={busy}
                  aria-label="Layout"
                  onChange={(layoutMode) => set({ layoutMode: layoutMode as LayoutMode })}
                  options={[
                    { value: "fill", label: "Fill + blur bars" },
                    { value: "face-top", label: "Face-top split" },
                  ]}
                />
              </Field>
              <Field title="Captions">
                <MenuSelect
                  value={v.captionsEnabled ? "on" : "off"}
                  disabled={busy}
                  aria-label="Captions"
                  onChange={(val) => set({ captionsEnabled: val === "on" })}
                  options={[
                    { value: "on", label: "Word highlight" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </Field>
            </div>

            <CaptionStyleFields v={v} set={set} busy={busy} />

            <div className="csc-grid-4">
              <Field title="Speech speed">
                <MenuSelect
                  value={v.whisperQuality}
                  disabled={busy}
                  aria-label="Speech speed"
                  onChange={(whisperQuality) =>
                    set({ whisperQuality: whisperQuality as WhisperQuality })
                  }
                  options={[
                    { value: "fast", label: "Fast" },
                    { value: "balanced", label: "Balanced" },
                    { value: "best", label: "Best" },
                  ]}
                />
              </Field>
              <Field title="Quality">
                <MenuSelect
                  value={v.exportQuality}
                  disabled={busy}
                  aria-label="Quality"
                  onChange={(exportQuality) =>
                    set({ exportQuality: exportQuality as ExportQuality })
                  }
                  options={[
                    { value: "high", label: "High" },
                    { value: "very-high", label: "Very high" },
                    { value: "maximum", label: "Maximum" },
                  ]}
                />
              </Field>
              <Field title="Format">
                <MenuSelect
                  value={v.exportCodec}
                  disabled={busy}
                  aria-label="Format"
                  onChange={(exportCodec) => set({ exportCodec: exportCodec as ExportCodec })}
                  options={[
                    { value: "h264", label: "Standard MP4" },
                    { value: "hevc", label: "Smaller file" },
                    { value: "av1", label: "Modern (slower)" },
                    { value: "vp9", label: "Web video" },
                  ]}
                />
              </Field>
              <Field title="Encode">
                <MenuSelect
                  value={v.preferHwEncode ? "hw" : "soft"}
                  disabled={busy}
                  aria-label="Encode"
                  onChange={(val) => set({ preferHwEncode: val === "hw" })}
                  options={[
                    { value: "hw", label: "Faster" },
                    { value: "soft", label: "Reliable" },
                  ]}
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="csc-grid-2">
              <Field title="Burned-in text">
                <MenuSelect
                  value={v.stripBurnIn ? "strip" : "keep"}
                  disabled={busy}
                  aria-label="Burned-in text"
                  onChange={(val) => set({ stripBurnIn: val === "strip" })}
                  options={[
                    { value: "strip", label: "Hide original captions" },
                    { value: "keep", label: "Keep original text" },
                  ]}
                />
              </Field>
              <Field title="Fresh captions">
                <MenuSelect
                  value={v.captionsEnabled ? "on" : "off"}
                  disabled={busy}
                  aria-label="Fresh captions"
                  onChange={(val) => set({ captionsEnabled: val === "on" })}
                  options={[
                    { value: "on", label: "Add word highlight" },
                    { value: "off", label: "Clean video only" },
                  ]}
                />
              </Field>
            </div>

            <CaptionStyleFields v={v} set={set} busy={busy} />

            <div className="csc-grid-2">
              <Field title="Speech speed">
                <MenuSelect
                  value={v.whisperQuality}
                  disabled={busy}
                  aria-label="Speech speed"
                  onChange={(whisperQuality) =>
                    set({ whisperQuality: whisperQuality as WhisperQuality })
                  }
                  options={[
                    { value: "fast", label: "Fast" },
                    { value: "balanced", label: "Balanced" },
                    { value: "best", label: "Best" },
                  ]}
                />
              </Field>
              <Field title="Encode">
                <MenuSelect
                  value={v.preferHwEncode ? "hw" : "soft"}
                  disabled={busy}
                  aria-label="Encode"
                  onChange={(val) => set({ preferHwEncode: val === "hw" })}
                  options={[
                    { value: "hw", label: "Faster" },
                    { value: "soft", label: "Reliable" },
                  ]}
                />
              </Field>
            </div>
          </>
        )}

        {v.captionsEnabled && (
          <div className="csc-grid-2">
            <Field title="Look">
              <MenuSelect
                value={v.captionTheme}
                disabled={busy}
                aria-label="Caption look"
                onChange={(captionTheme) =>
                  set({ captionTheme: captionTheme as CaptionThemeId })
                }
                options={THEME_LIST.map((theme) => ({
                  value: theme.id,
                  label: theme.label,
                }))}
              />
            </Field>
            <Field title="Wording">
              <MenuSelect
                value={v.captionReadMode}
                disabled={busy}
                aria-label="Wording"
                onChange={(captionReadMode) =>
                  set({ captionReadMode: captionReadMode as CaptionReadMode })
                }
                options={[
                  { value: "verbatim", label: "What was said" },
                  { value: "readable", label: "Readable" },
                  { value: "minimal", label: "Minimal" },
                ]}
              />
            </Field>
          </div>
        )}
      </div>
    </section>
  );
}
