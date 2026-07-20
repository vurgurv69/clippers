import fs from "fs";

const p = "src/components/editor/StudioEditor.tsx";
let s = fs.readFileSync(p, "utf8");

if (!s.includes("StudioStatusBar")) {
  s = s.replace(
    'import { StudioTimeline } from "@/components/editor/StudioTimeline";',
    `import { StudioTimeline } from "@/components/editor/StudioTimeline";
import { StudioMediaBin } from "@/components/editor/StudioMediaBin";
import { StudioTopBar } from "@/components/editor/StudioTopBar";
import { StudioToolbar } from "@/components/editor/StudioToolbar";
import { StudioStatusBar } from "@/components/editor/StudioStatusBar";
import { ClipContextMenu } from "@/components/editor/ClipContextMenu";
import { KeymapDialog } from "@/components/editor/KeymapDialog";`,
  );
}

// Deduplicate StudioMediaBin import if we just doubled it
s = s.replace(
  /import \{ StudioMediaBin \} from "@\/components\/editor\/StudioMediaBin";\r?\nimport \{ StudioTimeline \}[\s\S]*?import \{ StudioMediaBin \} from "@\/components\/editor\/StudioMediaBin";\r?\n/,
  `import { StudioTimeline } from "@/components/editor/StudioTimeline";
import { StudioMediaBin } from "@/components/editor/StudioMediaBin";
`,
);

// Cleaner: ensure single set of chrome imports after StudioTimeline
{
  const chromeImports = `import { StudioTopBar } from "@/components/editor/StudioTopBar";
import { StudioToolbar } from "@/components/editor/StudioToolbar";
import { StudioStatusBar } from "@/components/editor/StudioStatusBar";
import { ClipContextMenu } from "@/components/editor/ClipContextMenu";
import { KeymapDialog } from "@/components/editor/KeymapDialog";
`;
  // Remove any duplicates of these imports
  for (const name of [
    "StudioTopBar",
    "StudioToolbar",
    "StudioStatusBar",
    "ClipContextMenu",
    "KeymapDialog",
  ]) {
    const re = new RegExp(
      `import \\{ ${name} \\} from "@/components/editor/${name}";\\r?\\n`,
      "g",
    );
    s = s.replace(re, "");
  }
  // Also remove duplicate MediaBin if present twice
  const mediaRe =
    /import \{ StudioMediaBin \} from "@\/components\/editor\/StudioMediaBin";\r?\n/g;
  const mediaMatches = s.match(mediaRe) || [];
  if (mediaMatches.length > 1) {
    let n = 0;
    s = s.replace(mediaRe, () => (++n === 1 ? mediaMatches[0] : ""));
  }
  if (!s.includes('from "@/components/editor/StudioTopBar"')) {
    s = s.replace(
      'import { StudioTimeline } from "@/components/editor/StudioTimeline";\n',
      'import { StudioTimeline } from "@/components/editor/StudioTimeline";\n' +
        chromeImports,
    );
  }
}

function replaceBlock(src, startNeedle, endNeedleInclusive, replacement, label) {
  const start = src.indexOf(startNeedle);
  if (start < 0) throw new Error("missing start " + label + ": " + startNeedle.slice(0, 40));
  const end = src.indexOf(endNeedleInclusive, start);
  if (end < 0) throw new Error("missing end " + label);
  return (
    src.slice(0, start) +
    replacement +
    src.slice(end + endNeedleInclusive.length)
  );
}

// Top bar: from <header className="studio-top"> through </header>
s = replaceBlock(
  s,
  '        <header className="studio-top">',
  "        </header>",
  `        <StudioTopBar
          aspect={aspect}
          setAspect={setAspect}
          darkTheme={darkTheme}
          setDarkTheme={setDarkTheme}
          canUndo={historyInfo.canUndo}
          canRedo={historyInfo.canRedo}
          onUndo={undo}
          onRedo={redo}
          onClose={onClose}
          exporting={exporting}
          onCancelExport={cancelExport}
          onExport={() => setShowExport(true)}
          canExport={clips.length > 0}
          onOpenKeymap={() => setShowKeymap(true)}
        />
`,
  "topbar",
);

// Toolbar
s = replaceBlock(
  s,
  '        <div className="studio-toolbar" role="toolbar" aria-label="Editing tools">',
  "        </div>\n\n        <div\n          className=\"studio-body\"",
  `        <StudioToolbar
          uploadingMusic={uploadingMusic}
          selectedId={selectedId}
          selectedTextId={selectedTextId}
          playing={playing}
          onUploadMedia={uploadFiles}
          onSplit={splitAtPlayhead}
          onDuplicate={() => selectedId && duplicateClip(selectedId)}
          onAddText={addText}
          onDelete={() => {
            if (selectedTextId) deleteText(selectedTextId);
            else if (selectedId) deleteClip(selectedId);
          }}
          onMusicFile={onMusicFile}
          onTogglePlay={togglePlay}
        />

        <div
          className="studio-body"`,
  "toolbar",
);

// Status bar
s = replaceBlock(
  s,
  "        {/* Status bar */}\n        <footer className=\"studio-statusbar\">",
  "        </footer>",
  `        {/* Status bar */}
        <StudioStatusBar
          clipCount={clips.length}
          selectedCount={selectedIds.length}
          textCount={texts.length}
          hasMusic={Boolean(music)}
          saving={saving}
          lastSavedAt={lastSavedAt}
          aspect={aspect}
          fps={FPS}
          pxPerSec={pxPerSec}
          current={current}
          total={total}
          fmt={fmt}
        />
`,
  "statusbar",
);

// Context menu
s = replaceBlock(
  s,
  "        {/* Clip context menu */}\n        {ctxMenu && (",
  "        )}\n\n        {/* Export window */}",
  `        {/* Clip context menu */}
        {ctxMenu && (
          <ClipContextMenu
            menu={ctxMenu}
            clips={clips}
            starts={starts}
            music={music}
            onClose={() => setCtxMenu(null)}
            onSeek={seek}
            onSplitAtPlayhead={splitAtPlayhead}
            onDuplicate={duplicateClip}
            onCopy={copySelection}
            onAddOpacityKeyframe={(id) => addKeyframe(id, "opacity")}
            onDetachAudio={detachClipAudio}
            onRelinkAudio={relinkClipAudio}
            onMoveToLane={moveClipToLane}
            onDelete={deleteClip}
          />
        )}

        {/* Export window */}`,
  "ctxmenu",
);

// Keymap dialog
s = replaceBlock(
  s,
  "        {showKeymap && (\n          <div className=\"export-backdrop\" onClick={() => setShowKeymap(false)}>",
  "        )}\n      </div>\n    </div>\n  );\n}",
  `        {showKeymap && (
          <KeymapDialog
            keymap={keymap}
            setKeymap={setKeymap}
            onClose={() => setShowKeymap(false)}
            pushToast={pushToast}
          />
        )}
      </div>
    </div>
  );
}`,
  "keymap",
);

// Remove unused DEFAULT_KEYMAP / saveKeymap / ShortcutAction if no longer referenced
if (!s.includes("DEFAULT_KEYMAP") && !s.includes("saveKeymap")) {
  s = s.replace(
    /import \{\r?\n  DEFAULT_KEYMAP,\r?\n  loadKeymap,\r?\n  saveKeymap,\r?\n  useKeyboardShortcuts,\r?\n  type ShortcutAction,\r?\n\} from "@\/hooks\/useKeyboardShortcuts";/,
    `import {
  loadKeymap,
  useKeyboardShortcuts,
  type ShortcutAction,
} from "@/hooks/useKeyboardShortcuts";`,
  );
}

// ASPECT_PRESETS may only be needed if still used outside TopBar
if (!s.includes("ASPECT_PRESETS[")) {
  // still might use ASPECT_PRESETS elsewhere - check
}

fs.writeFileSync(p, s);
console.log("wired chrome; lines", s.split("\n").length);
console.log("TopBar", s.includes("<StudioTopBar"));
console.log("Toolbar", s.includes("<StudioToolbar"));
console.log("StatusBar", s.includes("<StudioStatusBar"));
console.log("CtxMenu", s.includes("<ClipContextMenu"));
console.log("Keymap", s.includes("<KeymapDialog"));
