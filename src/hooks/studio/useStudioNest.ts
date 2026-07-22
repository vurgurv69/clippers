"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  clipLane,
  clipLength,
  DEFAULT_COLOR,
  DEFAULT_TRANSFORM,
  type ClipLayer,
  type ProjectAsset,
  type TimelineClip,
} from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioNestArgs = {
  projectId: string;
  viewClips: TimelineClip[];
  starts: number[];
  current: number;
  selectedId: string | null;
  selectedIds: string[];
  nestPath: string[];
  assetById: Map<string, ProjectAsset>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setNestPath: Dispatch<SetStateAction<string[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  setCurrent: Dispatch<SetStateAction<number>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  curRef: MutableRefObject<number>;
  musicRef: MutableRefObject<HTMLAudioElement | null>;
  sfxRefs: MutableRefObject<(HTMLAudioElement | null)[]>;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  pushToast: ToastFn;
};

/** Compound nest, multicam angles, and per-clip layer stack. */
export function useStudioNest(args: StudioNestArgs) {
  const {
    projectId,
    viewClips,
    starts,
    current,
    selectedId,
    selectedIds,
    nestPath,
    assetById,
    setViewClips,
    setNestPath,
    setSelectedId,
    setSelectedIds,
    setAssets,
    setCurrent,
    setPlaying,
    curRef,
    musicRef,
    sfxRefs,
    patchClip,
    pushToast,
  } = args;

  const addClipLayer = useCallback(
    (clipId: string, assetId: string, name?: string) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip) return;
      const asset = assetById.get(assetId);
      if (!asset || (asset.kind !== "video" && asset.kind !== "image")) {
        pushToast("Pick a video or photo for the layer", "info");
        return;
      }
      const n = (clip.layers?.length || 0) + 1;
      const layer: ClipLayer = {
        id: uid("lyr"),
        name: (name || "").trim() || `Layer #${n}`,
        assetId,
        enabled: true,
        opacity: 1,
      };
      patchClip(clipId, { layers: [...(clip.layers || []), layer] });
      pushToast(`Added ${layer.name}`, "success");
      return layer.id;
    },
    [assetById, patchClip, pushToast, viewClips],
  );

  const uploadClipLayerFile = useCallback(
    async (clipId: string, file: File, name?: string) => {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/editor/project/${projectId}/asset`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        const asset = data.asset as ProjectAsset;
        setAssets((prev) => [...prev, asset]);
        return addClipLayer(clipId, asset.id, name);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Layer upload failed", "error");
        return undefined;
      }
    },
    [addClipLayer, projectId, pushToast, setAssets],
  );

  const renameClipLayer = useCallback(
    (clipId: string, layerId: string, name: string) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip?.layers) return;
      const next = name.trim() || "Layer";
      patchClip(clipId, {
        layers: clip.layers.map((l) => (l.id === layerId ? { ...l, name: next } : l)),
      });
    },
    [patchClip, viewClips],
  );

  const removeClipLayer = useCallback(
    (clipId: string, layerId: string) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip?.layers) return;
      patchClip(clipId, { layers: clip.layers.filter((l) => l.id !== layerId) });
    },
    [patchClip, viewClips],
  );

  const patchClipLayer = useCallback(
    (clipId: string, layerId: string, patch: Partial<ClipLayer>) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip?.layers) return;
      patchClip(clipId, {
        layers: clip.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
      });
    },
    [patchClip, viewClips],
  );

  const enterCompound = useCallback(
    (id: string) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip?.compound || !clip.children?.length) {
        pushToast("Not a compound clip", "info");
        return;
      }
      setNestPath((p) => [...p, id]);
      const first = clip.children[0];
      setSelectedId(first?.id ?? null);
      setSelectedIds(first ? [first.id] : []);
      setCurrent(0);
      curRef.current = 0;
      setPlaying(false);
      musicRef.current?.pause();
      sfxRefs.current.forEach((a) => a?.pause());
      pushToast("Editing compound sequence", "info");
    },
    [
      curRef,
      musicRef,
      pushToast,
      setCurrent,
      setNestPath,
      setPlaying,
      setSelectedId,
      setSelectedIds,
      sfxRefs,
      viewClips,
    ],
  );

  const exitCompound = useCallback(() => {
    if (!nestPath.length) return;
    const parentId = nestPath[nestPath.length - 1];
    setNestPath((p) => p.slice(0, -1));
    setSelectedId(parentId);
    setSelectedIds([parentId]);
    setCurrent(0);
    curRef.current = 0;
    setPlaying(false);
  }, [curRef, nestPath, setCurrent, setNestPath, setPlaying, setSelectedId, setSelectedIds]);

  const createCompoundFromSelection = useCallback(() => {
    const ids = selectedIds.length > 1 ? selectedIds : selectedId ? [selectedId] : [];
    const mains = viewClips
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => ids.includes(c.id) && clipLane(c) === 0 && !c.compound);
    if (mains.length < 2) {
      pushToast("Select 2+ main-lane clips to compound", "info");
      return;
    }
    mains.sort((a, b) => a.i - b.i);
    const children = mains.map(({ c }) => JSON.parse(JSON.stringify(c)) as TimelineClip);
    const compound: TimelineClip = {
      id: uid("cmp"),
      assetId: children[0]?.assetId || "",
      inPoint: 0,
      outPoint: children.reduce((s, c) => s + clipLength(c), 0),
      speed: 1,
      transition: "none",
      transitionDuration: 0.5,
      color: { ...DEFAULT_COLOR },
      transform: { ...DEFAULT_TRANSFORM },
      effects: [],
      lane: 0,
      compound: true,
      children,
      linkedAudio: true,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    const victimIds = new Set(mains.map((m) => m.c.id));
    setViewClips((prev) => {
      const next: TimelineClip[] = [];
      let inserted = false;
      for (const c of prev) {
        if (victimIds.has(c.id)) {
          if (!inserted) {
            next.push(compound);
            inserted = true;
          }
          continue;
        }
        next.push(c);
      }
      return next;
    });
    setSelectedId(compound.id);
    setSelectedIds([compound.id]);
    pushToast(`Compound created (${children.length} clips)`, "success");
  }, [pushToast, selectedId, selectedIds, setSelectedId, setSelectedIds, setViewClips, viewClips]);

  const explodeCompound = useCallback(
    (clipId?: string) => {
      const id = clipId || selectedId;
      const parent = viewClips.find((c) => c.id === id);
      if (!parent?.compound || !parent.children?.length) {
        pushToast("Select a compound clip to explode", "info");
        return;
      }
      const kids = parent.children.map((c) => ({
        ...JSON.parse(JSON.stringify(c)),
        id: uid("clip"),
        lane: 0,
        compound: undefined,
        children: undefined,
      })) as TimelineClip[];
      setViewClips((prev) => {
        const next: TimelineClip[] = [];
        for (const c of prev) {
          if (c.id === parent.id) next.push(...kids);
          else next.push(c);
        }
        return next;
      });
      setSelectedId(kids[0]?.id ?? null);
      setSelectedIds(kids.map((k) => k.id));
      pushToast("Compound exploded", "success");
    },
    [pushToast, selectedId, setSelectedId, setSelectedIds, setViewClips, viewClips],
  );

  const setMulticamActive = useCallback(
    (clipId: string) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip?.multicamId) return;
      const gid = clip.multicamId;
      setViewClips((prev) =>
        prev.map((c) =>
          c.multicamId === gid ? { ...c, multicamActive: c.id === clipId } : c,
        ),
      );
      pushToast("Multicam angle live", "success");
    },
    [pushToast, setViewClips, viewClips],
  );

  const createMulticamFromSelection = useCallback(() => {
    const ids = selectedIds.length > 1 ? selectedIds : [];
    const targets = viewClips.filter(
      (c) => ids.includes(c.id) && clipLane(c) === 0 && !c.compound,
    );
    if (targets.length < 2) {
      pushToast("Select 2+ main clips for multicam", "info");
      return;
    }
    const groupId = uid("mc");
    setViewClips((prev) =>
      prev.map((c) => {
        if (!ids.includes(c.id)) return c;
        const active = c.id === targets[0].id;
        return { ...c, multicamId: groupId, multicamActive: active };
      }),
    );
    pushToast(`Multicam group (${targets.length} angles) — first is live`, "success");
  }, [pushToast, selectedIds, setViewClips, viewClips]);

  const syncMulticamGroup = useCallback(
    async (clipId?: string) => {
      const id = clipId || selectedId;
      const master = viewClips.find((c) => c.id === id);
      if (!master?.multicamId) {
        pushToast("Select a multicam clip to sync", "info");
        return;
      }
      const gid = master.multicamId;
      const angles = viewClips.filter((c) => c.multicamId === gid);
      const masterAsset = assetById.get(master.assetId);
      if (!masterAsset) {
        pushToast("Master media missing", "error");
        return;
      }
      pushToast("Syncing multicam audio…", "info");
      try {
        const res = await fetch(`/api/editor/project/${projectId}/multicam-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterAssetFile: masterAsset.filename,
            angleAssetFiles: angles
              .filter((c) => c.id !== master.id)
              .map((c) => ({
                clipId: c.id,
                filename: assetById.get(c.assetId)?.filename || "",
              }))
              .filter((a) => a.filename),
          }),
        });
        const data = await res.json();
        if (res.ok && data.offsets) {
          const offsets = data.offsets as Record<string, number>;
          setViewClips((prev) =>
            prev.map((c) => {
              if (c.multicamId !== gid) return c;
              if (c.id === master.id) return { ...c, multicamSync: 0 };
              return { ...c, multicamSync: offsets[c.id] ?? 0 };
            }),
          );
          pushToast("Multicam angles waveform-synced", "success");
          return;
        }
      } catch {
        // fall through to timeline offset
      }
      const masterStart = starts[viewClips.findIndex((c) => c.id === master.id)] ?? 0;
      setViewClips((prev) =>
        prev.map((c) => {
          if (c.multicamId !== gid) return c;
          const i = prev.findIndex((x) => x.id === c.id);
          const s = starts[i] ?? 0;
          return { ...c, multicamSync: s - masterStart };
        }),
      );
      pushToast("Multicam synced via timeline offsets", "success");
    },
    [assetById, projectId, pushToast, selectedId, setViewClips, starts, viewClips],
  );

  const cutMulticamAtPlayhead = useCallback(
    (clipId: string) => {
      const next = viewClips.find((c) => c.id === clipId);
      if (!next?.multicamId) return;
      const gid = next.multicamId;
      const live = viewClips.find((c) => c.multicamId === gid && c.multicamActive);
      if (!live || live.id === next.id) {
        setMulticamActive(clipId);
        return;
      }
      const liveIdx = viewClips.findIndex((c) => c.id === live.id);
      const liveStart = starts[liveIdx] ?? 0;
      const liveLen = clipLength(live);
      const local = current - liveStart;
      if (local > 0.15 && local < liveLen - 0.15) {
        const speed = live.speed || 1;
        const cutSrc = live.inPoint + local * speed;
        const left: TimelineClip = {
          ...live,
          id: uid("clip"),
          outPoint: cutSrc,
          multicamActive: true,
        };
        const right: TimelineClip = {
          ...live,
          id: uid("clip"),
          inPoint: cutSrc,
          multicamActive: false,
        };
        const activated: TimelineClip = {
          ...next,
          multicamActive: true,
          multicamSync: next.multicamSync ?? 0,
        };
        setViewClips((prev) => {
          const out: TimelineClip[] = [];
          for (const c of prev) {
            if (c.id === live.id) {
              out.push(left, { ...activated, id: uid("clip") }, right);
            } else if (c.multicamId === gid) {
              out.push({ ...c, multicamActive: false });
            } else {
              out.push(c);
            }
          }
          return out;
        });
        pushToast("Multicam cut recorded at playhead", "success");
      } else {
        setMulticamActive(clipId);
      }
    },
    [current, pushToast, setMulticamActive, setViewClips, starts, viewClips],
  );

  return {
    addClipLayer,
    uploadClipLayerFile,
    renameClipLayer,
    removeClipLayer,
    patchClipLayer,
    enterCompound,
    exitCompound,
    createCompoundFromSelection,
    explodeCompound,
    createMulticamFromSelection,
    setMulticamActive,
    syncMulticamGroup,
    cutMulticamAtPlayhead,
  };
}
