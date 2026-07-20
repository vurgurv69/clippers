import fs from "fs";

const p = "src/components/editor/StudioEditor.tsx";
let s = fs.readFileSync(p, "utf8");

// --- imports ---
if (!s.includes("StudioMediaBin")) {
  s = s.replace(
    'import { InspectorTabPanels } from "@/components/editor/inspector/InspectorTabPanels";',
    `import { InspectorTabPanels } from "@/components/editor/inspector/InspectorTabPanels";
import { StudioMediaBin } from "@/components/editor/StudioMediaBin";
import { StudioTimeline } from "@/components/editor/StudioTimeline";`,
  );
}

// Drop unused imports that moved into StudioTimeline (if only used there)
// ClipStrip, TrackHeader, TimelineMinimap — check after replacement

function replaceBetween(src, startNeedle, endNeedle, replacement, label) {
  const start = src.indexOf(startNeedle);
  if (start < 0) throw new Error("missing start: " + label);
  const end = src.indexOf(endNeedle, start);
  if (end < 0) throw new Error("missing end: " + label);
  return src.slice(0, start) + replacement + src.slice(end + endNeedle.length);
}

const mediaBin = `          {/* Media bin */}
          <StudioMediaBin
            assets={assets}
            uploading={uploading}
            mediaSearch={mediaSearch}
            setMediaSearch={setMediaSearch}
            favAssets={favAssets}
            assetUrl={assetUrl}
            onUpload={uploadFiles}
            onCleanupUnused={cleanupUnusedMedia}
            onAdd={addAssetToTimeline}
            onToggleFav={toggleFavAsset}
            onRename={renameMediaAsset}
            onReplace={replaceMediaAsset}
            onDelete={deleteMediaAsset}
          />
`;

s = replaceBetween(
  s,
  "          {/* Media bin */}",
  "          </aside>",
  mediaBin,
  "media-bin",
);

const timeline = `        {/* Timeline */}
        <StudioTimeline
          ctx={{
            expanded,
            setExpanded,
            total,
            current,
            fmt,
            snapEnabled,
            setSnapEnabled,
            magnetic,
            setMagnetic,
            rippleEnabled,
            setRippleEnabled,
            pxPerSec,
            setPxPerSec,
            trackRef,
            setViewScroll,
            timelineWidth,
            minorTicks,
            ticks,
            snapSec,
            timeFromClientX,
            seek,
            splitAtPlayhead,
            tracks,
            patchTrack,
            clips,
            starts,
            marquee,
            setMarquee,
            selectedIds,
            setSelectedIds,
            setSelectedId,
            selectedTextId,
            setSelectedTextId,
            setTab,
            pushToast,
            clipInView,
            assetById,
            selectClip,
            setCtxMenu,
            reorderTo,
            thumbUrl,
            waveformUrl,
            moveKeyframe,
            dragHandle,
            patchClip,
            music,
            musicAsset,
            patchMusic,
            texts,
            patchText,
          }}
        />
`;

s = replaceBetween(
  s,
  "        {/* Timeline */}",
  "        </section>",
  timeline,
  "timeline",
);

// Remove imports only used by extracted timeline UI
const stillUsesClipStrip = s.includes("<ClipStrip") || s.includes("ClipStrip ");
const stillUsesTrackHeader = s.includes("<TrackHeader") || s.includes("TrackHeader ");
const stillUsesMinimap = s.includes("<TimelineMinimap") || s.includes("TimelineMinimap ");

if (!stillUsesClipStrip) {
  s = s.replace(
    /import \{ ClipStrip \} from "@\/components\/editor\/ClipStrip";\r?\n/,
    "",
  );
}
if (!stillUsesTrackHeader) {
  s = s.replace(
    /import \{ TrackHeader, type TrackChrome \} from "@\/components\/editor\/TrackHeader";\r?\n/,
    'import type { TrackChrome } from "@/components/editor/TrackHeader";\n',
  );
}
if (!stillUsesMinimap) {
  s = s.replace(
    /import \{ TimelineMinimap \} from "@\/components\/editor\/TimelineMinimap";\r?\n/,
    "",
  );
}

fs.writeFileSync(p, s);
console.log("wired; lines", s.split("\n").length);
console.log("ClipStrip kept?", stillUsesClipStrip);
console.log("TrackHeader kept?", stillUsesTrackHeader);
console.log("Minimap kept?", stillUsesMinimap);
