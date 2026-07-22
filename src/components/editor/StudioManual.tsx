"use client";

type Props = {
  onClose: () => void;
};

const CHAPTERS: {
  title: string;
  blurb: string;
  items: { name: string; body: string }[];
}[] = [
  {
    title: "Getting started",
    blurb: "How media moves from the library onto the timeline.",
    items: [
      {
        name: "Media bin",
        body: "Import video, photos, audio, fonts, or LUTs on the left. Click an item to place it at the playhead.",
      },
      {
        name: "Playhead",
        body: "The gray line on the timeline is where playback and new clips land. Drag it even on an empty project, then add media.",
      },
      {
        name: "Tracks",
        body: "Video is the main picture. Overlay tracks sit on top. Audio holds music and SFX. Text holds titles.",
      },
    ],
  },
  {
    title: "Timeline tools",
    blurb: "Editing moves that reshape your cut.",
    items: [
      {
        name: "Pointer / Blade / Trim",
        body: "Pointer selects and moves. Blade cuts at a click. Trim pulls clip edges.",
      },
      {
        name: "Split",
        body: "Cuts the clip under the playhead into two pieces (shortcut S).",
      },
      {
        name: "Duplicate",
        body: "Copies the selected clip. Lives on the top tool strip, right side.",
      },
      {
        name: "Delete",
        body: "Removes the selected clip or text (trash icon next to Split).",
      },
      {
        name: "Zoom & Tall",
        body: "Zoom stretches time on the ruler. Tall expands track height for easier handles.",
      },
      {
        name: "Speed",
        body: "Preview playback rate only — it does not change exported clip speed. Pick a rate from the compact menu.",
      },
    ],
  },
  {
    title: "Clip · Layers",
    blurb: "Stack pictures or video on top of a selected clip.",
    items: [
      {
        name: "Base layer",
        body: "Layer 1 is always the clip itself. It cannot be deleted.",
      },
      {
        name: "Add layer",
        body: "Press + and pick a file or library item. Layers always include real media — name alone is not enough.",
      },
      {
        name: "Search",
        body: "Filter the stack by layer name when you have many overlays.",
      },
    ],
  },
  {
    title: "Transform",
    blurb: "Move, size, spin, and fade the selected clip in the frame.",
    items: [
      {
        name: "Position",
        body: "X slides left/right. Y slides up/down. Zero is center.",
      },
      {
        name: "Scale",
        body: "Grow or shrink. Lock keeps width and height matched. 100% resets size.",
      },
      {
        name: "Rotation & Opacity",
        body: "Rotation spins the clip. Opacity fades it from solid to invisible.",
      },
      {
        name: "Keyframes",
        body: "Add diamonds at the playhead so values change over time (animate in/out).",
      },
    ],
  },
  {
    title: "Color",
    blurb: "Look and feel of the picture.",
    items: [
      {
        name: "Presets",
        body: "One-click looks. After a preset, any slider turns the grade Custom.",
      },
      {
        name: "Basics",
        body: "Brightness, contrast, saturation, sharpen, and vignette cover everyday fixes.",
      },
      {
        name: "HSL & wheels",
        body: "Hue/lightness fine-tune color. Lift/Gamma/Gain wheels shape shadows, midtones, and highlights.",
      },
      {
        name: "Speed (Color tab)",
        body: "Clip playback speed for the cut itself — different from the timeline preview Speed control.",
      },
    ],
  },
  {
    title: "Audio",
    blurb: "Levels and tone for clip sound and music.",
    items: [
      {
        name: "Mixer",
        body: "Faders for clip, music, and SFX. Solo hears one bus; mute silences it.",
      },
      {
        name: "EQ & dynamics",
        body: "Bass/treble shape tone. Compressor, denoise, gate, and limiter clean loud or noisy tracks.",
      },
      {
        name: "Fades",
        body: "Fade in/out softens the start and end of a sound.",
      },
    ],
  },
  {
    title: "Extra options",
    blurb: "Optional timeline behavior — kept in the right panel so the timeline stays clear.",
    items: [
      {
        name: "Proxy",
        body: "Lighter preview files for smooth scrubbing. Turn off for full-quality preview.",
      },
      {
        name: "Snap",
        body: "Edges pull together when you drag near another clip or the playhead.",
      },
      {
        name: "Magnet",
        body: "Stronger pull while dragging; gaps tend to close when you release.",
      },
      {
        name: "Ripple",
        body: "When you delete or shorten, later clips slide left to close the hole.",
      },
      {
        name: "Free / Pack",
        body: "Free lets V1 clips sit anywhere (gaps OK). Pack keeps the main track gapless.",
      },
    ],
  },
  {
    title: "Export & settings",
    blurb: "Finish and project prefs.",
    items: [
      {
        name: "Export",
        body: "Renders your timeline to a downloadable file. Wait for the queue to finish.",
      },
      {
        name: "Settings",
        body: "Aspect ratio, workspace, theme, shortcuts, and layout floats.",
      },
    ],
  },
];

/** Book-style feature manual for the Studio editor. */
export function StudioManual({ onClose }: Props) {
  return (
    <div className="export-overlay studio-manual-overlay" onClick={onClose}>
      <div
        className="export-dialog studio-manual"
        role="dialog"
        aria-label="Studio manual"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="studio-manual-head">
          <div>
            <p className="studio-manual-kicker">Clippers Studio</p>
            <h3>Manual</h3>
            <p className="tool-hint">A short guide to every main feature, by category.</p>
          </div>
          <button type="button" className="btn tiny" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="studio-manual-body">
          {CHAPTERS.map((ch) => (
            <section key={ch.title} className="studio-manual-chapter">
              <h4>{ch.title}</h4>
              <p className="studio-manual-blurb">{ch.blurb}</p>
              <ol className="studio-manual-list">
                {ch.items.map((it) => (
                  <li key={it.name}>
                    <strong>{it.name}</strong>
                    <span>{it.body}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <footer className="studio-manual-foot">
          <button type="button" className="btn primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
