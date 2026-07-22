"use client";

import { useState } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { BezierEditor } from "@/components/editor/BezierEditor";
import { ColorWheelsRow, HueColorWheel } from "@/components/editor/ColorWheels";
import { TransitionChip } from "@/components/editor/TransitionWidgets";
import {
  EffectPreview,
  TransitionPreview,
} from "@/components/editor/library/FxPreviewBox";
import { TRANSITION_UI_IDS } from "@/lib/capcut-catalog";
import {
  COLOR_PRESETS,
  DEFAULT_TRANSFORM,
  EFFECT_DEFS,
  KEYFRAME_EASES,
  TRANSITION_DEFS,
  clipLane,
  clipLength,
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type ProjectAsset,
  type TransitionKind,
} from "@/lib/editor-types";
import { InspSection, PanelBlock, inspMatch } from "@/components/editor/InspSection";
import { AudioMixerStrip } from "@/components/editor/AudioMixerStrip";
import { KeyframeGraph } from "@/components/editor/KeyframeGraph";
import { panelCtx, type InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

const TRANSITION_UI = new Set<string>(TRANSITION_UI_IDS);
const TRANSITIONS = TRANSITION_DEFS.filter(
  (t) => t.id === "none" || TRANSITION_UI.has(t.id),
);
import { YoutubeAudioImport } from "@/components/editor/inspector/YoutubeAudioImport";

export function AudioPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    selectedAsset,
    music,
    musicAsset,
    musicTracks,
    assetById,
    total,
    uploadingMusic,
    setUploadingMusic,
    projectId,
    patchClip,
    patchMusic,
    setMusic,
    setMusicTracks,
    mixerSolo,
    setMixerSolo,
    setAssets,
    addKeyframe,
    detachClipAudio,
    relinkClipAudio,
    onMusicFile,
    onExtractAudioFromVideo,
    onImportYoutubeAudio,
    pushToast,
    markers,
    addMarker,
    patchMarker,
    removeMarker,
    addAdjustmentLayer,
  } = panelCtx(ctx);
  return (
    <div className="tool">
                      <PanelBlock
                        title="Mixer"
                        hint="Faders for the selected clip, music, and SFX. Solo hears one bus."
                        filterMatch={inspMatch(ctx.inspSearch || "", "mixer", "bus", "fader", "audio", "volume")}
                      >
                        <AudioMixerStrip
                          channels={[
                            ...(selectedClip && selectedAsset?.kind !== "image"
                              ? [
                                  {
                                    id: "clip",
                                    label: "Clip",
                                    color: "#29c3a9",
                                    volume: selectedClip.volume ?? 1,
                                    muted: (selectedClip.volume ?? 1) < 0.01,
                                    solo: mixerSolo === "clip",
                                    onVolume: (v: number) =>
                                      patchClip(selectedClip.id, { volume: v }),
                                    onMute: () =>
                                      patchClip(selectedClip.id, {
                                        volume: (selectedClip.volume ?? 1) < 0.01 ? 1 : 0,
                                      }),
                                    onSolo: () =>
                                      setMixerSolo((s) => (s === "clip" ? null : "clip")),
                                  },
                                ]
                              : []),
                            ...(music
                              ? [
                                  {
                                    id: "music",
                                    label: "Music",
                                    color: "#5daeff",
                                    volume: music.volume ?? 0.8,
                                    muted: (music.volume ?? 0.8) < 0.01,
                                    solo: mixerSolo === "music",
                                    onVolume: (v: number) => patchMusic({ volume: v }),
                                    onMute: () =>
                                      patchMusic({
                                        volume: (music.volume ?? 0.8) < 0.01 ? 0.8 : 0,
                                      }),
                                    onSolo: () =>
                                      setMixerSolo((s) => (s === "music" ? null : "music")),
                                  },
                                ]
                              : []),
                            ...musicTracks.map((mt, i) => ({
                              id: `sfx-${i}`,
                              label: `SFX ${i + 1}`,
                              color: "#f4b942",
                              volume: mt.volume ?? 0.8,
                              muted: (mt.volume ?? 0.8) < 0.01,
                              solo: mixerSolo === `sfx-${i}`,
                              onVolume: (v: number) =>
                                setMusicTracks((prev) =>
                                  prev.map((m, j) => (j === i ? { ...m, volume: v } : m)),
                                ),
                              onMute: () =>
                                setMusicTracks((prev) =>
                                  prev.map((m, j) =>
                                    j === i
                                      ? { ...m, volume: (m.volume ?? 0.8) < 0.01 ? 0.8 : 0 }
                                      : m,
                                  ),
                                ),
                              onSolo: () =>
                                setMixerSolo((s) =>
                                  s === `sfx-${i}` ? null : `sfx-${i}`,
                                ),
                            })),
                          ]}
                        />
                      </PanelBlock>
                      {selectedClip && selectedAsset?.kind !== "image" && (
                        <PanelBlock
                          title="Clip audio"
                          hint="Loudness, tone, and cleanup for this clip’s own sound."
                          filterMatch={inspMatch(ctx.inspSearch || "", "volume", "eq", "bass", "gate", "compress", "audio", "fade")}
                        >
                          <Slider
                            label="Volume"
                            hint="0 = mute, 1 = normal, above 1 = boost."
                            min={0}
                            max={2}
                            value={selectedClip.volume}
                            onChange={(v) => patchClip(selectedClip.id, { volume: v })}
                          />
                          <button
                            className="btn tiny"
                            onClick={() => addKeyframe(selectedClip.id, "volume")}
                            title="Add volume keyframe at playhead"
                          >
                            ◆ Volume keyframe
                          </button>
                          <p className="tool-label">Tone</p>
                          <Slider
                            label="Bass"
                            hint="Low frequencies."
                            min={-20}
                            max={20}
                            value={selectedClip.bass ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { bass: v })}
                          />
                          <Slider
                            label="Treble"
                            hint="High frequencies."
                            min={-20}
                            max={20}
                            value={selectedClip.treble ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { treble: v })}
                          />
                          <Slider
                            label="Balance"
                            hint="−1 left, 0 center, +1 right."
                            min={-1}
                            max={1}
                            value={selectedClip.balance ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { balance: v })}
                          />
                          <label className="seg-row">
                            <span>Normalize</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedClip.normalize)}
                              onChange={(e) =>
                                patchClip(selectedClip.id, { normalize: e.target.checked })
                              }
                            />
                          </label>
                          <p className="tool-label">Cleanup</p>
                          <Slider
                            label="Compressor"
                            hint="Evens out loud and quiet parts."
                            min={0}
                            max={1}
                            value={selectedClip.compress ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { compress: v })}
                          />
                          <Slider
                            label="Denoise"
                            hint="Reduces hiss and background noise."
                            min={0}
                            max={1}
                            value={selectedClip.denoise ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { denoise: v })}
                          />
                          <Slider
                            label="Noise gate"
                            hint="Cuts sound below a threshold (room tone)."
                            min={0}
                            max={1}
                            value={selectedClip.gate ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { gate: v })}
                          />
                          <label className="seg-row">
                            <span>Limiter</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedClip.limiter)}
                              onChange={(e) =>
                                patchClip(selectedClip.id, { limiter: e.target.checked })
                              }
                            />
                          </label>
                          <p className="tool-hint">These bake into export.</p>
                          {selectedAsset?.kind === "video" && selectedAsset.hasAudio && (
                            <button
                              className="btn tiny wide"
                              onClick={() => detachClipAudio(selectedClip.id)}
                              title="Move this clip's audio to the music lane (linked)"
                            >
                              Detach audio
                            </button>
                          )}
                          {music?.linkedClipId === selectedClip.id && (
                            <button
                              className="btn tiny wide"
                              onClick={() => relinkClipAudio(selectedClip.id)}
                              title="Restore audio onto the clip"
                            >
                              Re-link audio
                            </button>
                          )}
                          <Slider
                            label="Fade in"
                            hint="Soft start in seconds."
                            min={0}
                            max={3}
                            value={selectedClip.fadeIn}
                            onChange={(v) => patchClip(selectedClip.id, { fadeIn: v })}
                          />
                          <Slider
                            label="Fade out"
                            hint="Soft end in seconds."
                            min={0}
                            max={3}
                            value={selectedClip.fadeOut}
                            onChange={(v) => patchClip(selectedClip.id, { fadeOut: v })}
                          />
                        </PanelBlock>
                      )}

                      <InspSection
                        id="bg-music"
                        title="Background music"
                        filterMatch={inspMatch(ctx.inspSearch || "", "music", "duck", "sfx")}
                      >
                      {music && musicAsset ? (
                        <>
                          <div className="music-chip">
                            <span className="music-ico">♪</span>
                            <span className="music-name">
                              {musicAsset.name}
                              {music.linkedClipId ? " · linked A/V" : ""}
                            </span>
                            <button className="music-remove" title="Remove music" onClick={() => setMusic(null)}>
                              ✕
                            </button>
                          </div>
                          {music.linkedClipId && (
                            <div className="chip-row">
                              <button
                                className="chip"
                                onClick={() => relinkClipAudio(music.linkedClipId)}
                              >
                                <span>Re-link to clip</span>
                              </button>
                              <button
                                className="chip"
                                onClick={() =>
                                  setMusic((m) => (m ? { ...m, linkedClipId: undefined } : m))
                                }
                                title="Keep music but stop following the clip"
                              >
                                <span>Break link</span>
                              </button>
                            </div>
                          )}
                          <Slider
                            label="Music volume"
                            min={0}
                            max={2}
                            value={music.volume}
                            onChange={(v) => patchMusic({ volume: v })}
                          />
                          <Slider
                            label="Duck"
                            min={0}
                            max={1}
                            value={music.duck ?? 0}
                            onChange={(v) => patchMusic({ duck: v })}
                          />
                          <Slider
                            label="Start at"
                            min={0}
                            max={Math.max(1, total)}
                            value={music.start}
                            onChange={(v) => patchMusic({ start: v })}
                          />
                          <Slider
                            label="Music fade in"
                            min={0}
                            max={5}
                            value={music.fadeIn}
                            onChange={(v) => patchMusic({ fadeIn: v })}
                          />
                          <Slider
                            label="Music fade out"
                            min={0}
                            max={5}
                            value={music.fadeOut}
                            onChange={(v) => patchMusic({ fadeOut: v })}
                          />
                          <p className="tool-hint">Drag the music bar on the timeline to move or trim it.</p>
                        </>
                      ) : null}
                      <div className="audio-import-stack">
                        <p className="tool-label">{music ? "Add more audio" : "Add audio"}</p>
                        <label className="btn wide">
                          {uploadingMusic ? "Uploading…" : "Audio file"}
                          <input
                            type="file"
                            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                            hidden
                            disabled={uploadingMusic}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onMusicFile(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {onExtractAudioFromVideo && (
                          <label className="btn wide ghost">
                            {uploadingMusic ? "Working…" : "Extract from video"}
                            <input
                              type="file"
                              accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
                              hidden
                              disabled={uploadingMusic}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void onExtractAudioFromVideo(f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                        {onImportYoutubeAudio && (
                          <YoutubeAudioImport
                            busy={uploadingMusic}
                            onImport={onImportYoutubeAudio}
                          />
                        )}
                      </div>
                      {music && (
                        <>
                          <p className="tool-label">Extra music lanes ({musicTracks.length})</p>
                          {musicTracks.map((m, i) => {
                            const a = assetById.get(m.assetId);
                            return (
                              <div key={`${m.assetId}-${i}`}>
                                <div className="music-chip">
                                  <span className="music-ico">♪</span>
                                  <span className="music-name">{a?.name || "Track"}</span>
                                  <button
                                    className="music-remove"
                                    title="Remove lane"
                                    onClick={() =>
                                      setMusicTracks((prev) => prev.filter((_, j) => j !== i))
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                                <Slider
                                  label="Volume"
                                  min={0}
                                  max={2}
                                  value={m.volume}
                                  onChange={(v) =>
                                    setMusicTracks((prev) =>
                                      prev.map((t, j) => (j === i ? { ...t, volume: v } : t)),
                                    )
                                  }
                                />
                                <Slider
                                  label="Duck"
                                  min={0}
                                  max={1}
                                  value={m.duck ?? 0}
                                  onChange={(v) =>
                                    setMusicTracks((prev) =>
                                      prev.map((t, j) => (j === i ? { ...t, duck: v } : t)),
                                    )
                                  }
                                />
                              </div>
                            );
                          })}
                          <label className="btn tiny wide">
                            ＋ Add music lane
                            <input
                              type="file"
                              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                              hidden
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setUploadingMusic(true);
                                try {
                                  const form = new FormData();
                                  form.append("file", f);
                                  const res = await fetch(`/api/editor/project/${projectId}/asset`, {
                                    method: "POST",
                                    body: form,
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || "Upload failed");
                                  const asset = data.asset as ProjectAsset;
                                  setAssets((prev) => [...prev, asset]);
                                  setMusicTracks((prev) => [
                                    ...prev,
                                    {
                                      assetId: asset.id,
                                      start: 0,
                                      inPoint: 0,
                                      outPoint: asset.duration || 30,
                                      volume: 0.7,
                                      fadeIn: 0.5,
                                      fadeOut: 1,
                                    },
                                  ]);
                                } catch (err) {
                                  pushToast(
                                    err instanceof Error ? err.message : "Upload failed",
                                    "error",
                                  );
                                } finally {
                                  setUploadingMusic(false);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                        </>
                      )}
                      </InspSection>

                      {(addMarker || (markers && markers.length > 0)) && (
                        <>
                          <hr className="tool-sep" />
                          <p className="tool-label">Markers</p>
                          {addMarker && (
                            <button className="btn tiny wide" onClick={addMarker}>
                              ＋ Add marker at playhead
                            </button>
                          )}
                          {addAdjustmentLayer && (
                            <button className="btn tiny wide" onClick={addAdjustmentLayer}>
                              ▨ Add adjustment layer (V2)
                            </button>
                          )}
                          {markers && markers.length > 0 && (
                            <div className="marker-list">
                              {markers.map((mk) => (
                                <div key={mk.id} className="marker-row">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={Number(mk.t.toFixed(2))}
                                    onChange={(e) =>
                                      patchMarker?.(mk.id, {
                                        t: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    aria-label="Marker time"
                                    title="Time (seconds)"
                                  />
                                  <input
                                    value={mk.label}
                                    onChange={(e) =>
                                      patchMarker?.(mk.id, { label: e.target.value })
                                    }
                                    aria-label="Marker label"
                                  />
                                  <input
                                    type="color"
                                    value={mk.color || "#e2a03f"}
                                    onChange={(e) =>
                                      patchMarker?.(mk.id, { color: e.target.value })
                                    }
                                    aria-label="Marker color"
                                    title="Color"
                                  />
                                  <button
                                    className="btn tiny"
                                    title="Delete marker"
                                    onClick={() => removeMarker?.(mk.id)}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
  );
}

