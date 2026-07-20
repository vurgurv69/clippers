import fs from "fs";

const p = "src/components/editor/StudioEditor.tsx";
let s = fs.readFileSync(p, "utf8");
const startMarker = "          <StudioInspector";
const start = s.indexOf(startMarker);
if (start < 0) throw new Error("no StudioInspector");
const childrenStart = s.indexOf(">", start) + 1;
const endMarker = "          </StudioInspector>";
const end = s.indexOf(endMarker, childrenStart);
if (end < 0) throw new Error("no close");

const replacement = `
            <InspectorTabPanels
              ctx={{
                projectId: project.id,
                tab,
                selectedClip,
                selectedAsset: selectedAsset ?? null,
                selectedIds,
                selectedText,
                assets,
                assetById,
                music,
                musicTracks,
                musicAsset,
                total,
                uploadingMusic,
                fxSearch,
                setFxSearch,
                trSearch,
                setTrSearch,
                favTr,
                previewTransition,
                setPreviewTransition,
                demoKey,
                setDemoKey,
                defaultEase,
                defaultBezier,
                setDefaultBezier,
                patchClip,
                patchColor,
                patchTransform,
                patchMusic,
                patchText,
                setMusic,
                setMusicTracks,
                setAssets,
                addKeyframe,
                removeNearbyKeyframe,
                copyKeyframes,
                pasteKeyframes,
                setAllKeyframeEase,
                addEffect,
                updateEffect,
                moveEffect,
                removeEffect,
                detachClipAudio,
                relinkClipAudio,
                onMusicFile,
                addText,
                addSticker,
                deleteText,
                applyTransition,
                toggleFav,
                moveClip,
                duplicateClip,
                moveClipToLane,
                deleteClip,
                pushToast,
                gradeClipboardRef,
              }}
            />
`;

fs.writeFileSync(p, s.slice(0, childrenStart) + replacement + s.slice(end));
console.log("wired; new line count", fs.readFileSync(p, "utf8").split("\n").length);
