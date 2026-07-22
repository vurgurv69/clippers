"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { PanelBlock, inspMatch } from "@/components/editor/InspSection";
import {
  TEXT_FONTS,
  type ProjectAsset,
  type TextAlign,
  type TextOverlay,
} from "@/lib/editor-types";

type TextPanelCtx = {
  inspSearch?: string;
  selectedText: TextOverlay | null;
  assets: ProjectAsset[];
  projectId: string;
  addText: () => void;
  patchText: (id: string, patch: Partial<TextOverlay>) => void;
  deleteText: (id: string) => void;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
};

/** Size shown as a friendly percent of frame width. */
function sizeLabel(size: number) {
  return `${Math.round(size * 100)}%`;
}

function FontDropdown({
  selectedText,
  assets,
  onPickSystem,
  onPickUpload,
}: {
  selectedText: TextOverlay;
  assets: ProjectAsset[];
  onPickSystem: (font: string) => void;
  onPickUpload: (asset: ProjectAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const customFonts = assets.filter((a) => a.kind === "font");
  const currentLabel = selectedText.fontFile
    ? customFonts.find((a) => a.filename === selectedText.fontFile)?.name.replace(/\.[^.]+$/, "") ||
      selectedText.font ||
      "Custom"
    : selectedText.font || "Arial";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="font-dropdown" ref={wrapRef}>
      <button
        type="button"
        className="font-dropdown-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-dropdown-preview" style={{ fontFamily: `"${currentLabel}", sans-serif` }}>
          {currentLabel}
        </span>
        <span className="font-dropdown-caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul className="font-dropdown-menu" role="listbox">
          {TEXT_FONTS.map((f) => (
            <li key={f} role="option" aria-selected={!selectedText.fontFile && selectedText.font === f}>
              <button
                type="button"
                className={
                  !selectedText.fontFile && (selectedText.font || "Arial") === f
                    ? "font-dropdown-item on"
                    : "font-dropdown-item"
                }
                style={{ fontFamily: `"${f}", sans-serif` }}
                onClick={() => {
                  onPickSystem(f);
                  setOpen(false);
                }}
              >
                {f}
              </button>
            </li>
          ))}
          {customFonts.map((a) => {
            const name = a.name.replace(/\.[^.]+$/, "");
            return (
              <li key={a.id} role="option">
                <button
                  type="button"
                  className={
                    selectedText.fontFile === a.filename
                      ? "font-dropdown-item on"
                      : "font-dropdown-item"
                  }
                  onClick={() => {
                    onPickUpload(a);
                    setOpen(false);
                  }}
                >
                  ↑ {name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TextPanel({ ctx }: { ctx: TextPanelCtx }) {
  const {
    selectedText,
    assets,
    projectId,
    addText,
    patchText,
    deleteText,
    setAssets,
    pushToast,
  } = ctx;

  const q = ctx.inspSearch || "";

  return (
    <div className="tool text-tool">
      <PanelBlock
        title="Text"
        hint="Add a title or caption, then style it below."
        filterMatch={inspMatch(q, "text", "title", "caption", "font")}
      >
        <button type="button" className="btn wide primary" onClick={addText}>
          Add text block
        </button>
      </PanelBlock>

      {!selectedText ? (
        <p className="tool-hint">Select a text block on the Text track to edit it.</p>
      ) : (
        <>
          <PanelBlock
            title="Content"
            hint="What the viewer reads on screen."
            filterMatch={inspMatch(q, "content", "text", "words")}
          >
            <label className="field">
              <span className="slider-title">Words</span>
              <textarea
                rows={3}
                value={selectedText.text}
                onChange={(e) => patchText(selectedText.id, { text: e.target.value })}
                placeholder="Type your text…"
              />
            </label>
          </PanelBlock>

          <PanelBlock
            title="Font"
            hint="Open the menu — each name is shown in its own typeface."
            filterMatch={inspMatch(q, "font", "typeface", "family")}
          >
            <FontDropdown
              selectedText={selectedText}
              assets={assets}
              onPickSystem={(font) =>
                patchText(selectedText.id, { font, fontFile: undefined })
              }
              onPickUpload={(asset) =>
                patchText(selectedText.id, {
                  fontFile: asset.filename,
                  font: asset.name.replace(/\.[^.]+$/, ""),
                })
              }
            />
            <label className="btn tiny wide">
              Upload font (.ttf / .otf)
              <input
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const form = new FormData();
                  form.append("file", f);
                  const res = await fetch(`/api/editor/project/${projectId}/asset`, {
                    method: "POST",
                    body: form,
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    pushToast(data.error || "Font upload failed", "error");
                    return;
                  }
                  const asset = data.asset as ProjectAsset;
                  setAssets((prev) => [...prev, asset]);
                  patchText(selectedText.id, {
                    fontFile: asset.filename,
                    font: asset.name.replace(/\.[^.]+$/, ""),
                  });
                  pushToast("Font applied", "success");
                  e.target.value = "";
                }}
              />
            </label>
          </PanelBlock>

          <PanelBlock
            title="Style"
            hint="Weight, emphasis, size, color, and alignment."
            filterMatch={inspMatch(q, "style", "bold", "italic", "size", "align", "color")}
          >
            <p className="tool-label">Emphasis</p>
            <div className="seg-row compact">
              <button
                type="button"
                className={selectedText.bold ? "seg-btn on" : "seg-btn"}
                style={{ fontWeight: 800 }}
                onClick={() => patchText(selectedText.id, { bold: !selectedText.bold })}
              >
                Bold
              </button>
              <button
                type="button"
                className={selectedText.italic ? "seg-btn on" : "seg-btn"}
                style={{ fontStyle: "italic" }}
                onClick={() =>
                  patchText(selectedText.id, { italic: !selectedText.italic })
                }
              >
                Italic
              </button>
              <button
                type="button"
                className={selectedText.underline ? "seg-btn on" : "seg-btn"}
                style={{ textDecoration: "underline" }}
                onClick={() =>
                  patchText(selectedText.id, { underline: !selectedText.underline })
                }
              >
                Underline
              </button>
            </div>

            <Slider
              label={`Size · ${sizeLabel(selectedText.size)}`}
              hint="How large the text is in the frame."
              min={0.03}
              max={0.25}
              value={selectedText.size}
              onChange={(v) => patchText(selectedText.id, { size: v })}
            />
            <div className="seg-row compact">
              {(
                [
                  [0.05, "S"],
                  [0.08, "M"],
                  [0.12, "L"],
                  [0.18, "XL"],
                ] as const
              ).map(([sz, label]) => (
                <button
                  key={label}
                  type="button"
                  className={
                    Math.abs(selectedText.size - sz) < 0.01 ? "seg-btn on" : "seg-btn"
                  }
                  onClick={() => patchText(selectedText.id, { size: sz })}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="field row text-color-row">
              <span className="slider-title">Color</span>
              <input
                type="color"
                value={selectedText.color}
                onChange={(e) => patchText(selectedText.id, { color: e.target.value })}
              />
            </label>

            <p className="tool-label">Align</p>
            <div className="seg-row compact">
              {(["left", "center", "right"] as TextAlign[]).map((al) => (
                <button
                  key={al}
                  type="button"
                  className={selectedText.align === al ? "seg-btn on" : "seg-btn"}
                  onClick={() => patchText(selectedText.id, { align: al })}
                >
                  {al === "left" ? "Left" : al === "center" ? "Center" : "Right"}
                </button>
              ))}
            </div>
          </PanelBlock>

          <PanelBlock
            title="Timing & place"
            hint="When it appears and where it sits in the frame."
            filterMatch={inspMatch(q, "timing", "position", "duration", "start")}
          >
            <Slider
              label="Start"
              hint="Seconds from the beginning of the timeline."
              min={0}
              max={120}
              value={selectedText.start}
              onChange={(v) => patchText(selectedText.id, { start: v })}
            />
            <Slider
              label="Duration"
              hint="How long it stays on screen."
              min={0.5}
              max={20}
              value={selectedText.duration}
              onChange={(v) => patchText(selectedText.id, { duration: v })}
            />
            <Slider
              label="Horizontal"
              hint="0 = left edge, 0.5 = center, 1 = right."
              min={0}
              max={1}
              value={selectedText.x}
              onChange={(v) => patchText(selectedText.id, { x: v })}
            />
            <Slider
              label="Vertical"
              hint="0 = top, 0.5 = middle, 1 = bottom."
              min={0}
              max={1}
              value={selectedText.y}
              onChange={(v) => patchText(selectedText.id, { y: v })}
            />
            <button
              type="button"
              className="btn tiny danger"
              onClick={() => deleteText(selectedText.id)}
            >
              Delete text
            </button>
          </PanelBlock>
        </>
      )}
    </div>
  );
}
