"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { CommandItem } from "@/components/editor/CommandPalette";
import type { ToolId } from "@/lib/edit-tools";
import type { WorkspaceId } from "@/components/editor/StudioTopBar";
import type { SidebarTab } from "@/components/editor/StudioSidebar";
import type { SpeedRampKind } from "@/lib/speed-ramp";
import { activeMainIndex } from "@/lib/studio-timeline";
import type { TimelineClip } from "@/lib/editor-types";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioCommandActions = {
  togglePlay: () => void;
  splitAtPlayhead: () => void;
  setShowExport: Dispatch<SetStateAction<boolean>>;
  saveProjectState: (silent?: boolean) => void | Promise<void>;
  undo: () => void;
  redo: () => void;
  addText: () => void;
  addAdjustmentLayer: () => void;
  addMarker: () => void;
  seekPrevMarker: () => void;
  seekNextMarker: () => void;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  applyWorkspace: (w: WorkspaceId) => void;
  setShowGrowthHub: Dispatch<SetStateAction<boolean>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  runAiAnalyze: () => void | Promise<void>;
  runAiReframe: () => void | Promise<void>;
  suggestAndInsertBroll: () => void | Promise<void>;
  createShareLink: () => void | Promise<void>;
  exportThumbnail: (headline?: string) => void | Promise<void>;
  setFloatBin: Dispatch<SetStateAction<boolean>>;
  setFloatInspector: Dispatch<SetStateAction<boolean>>;
  setUseProxy: Dispatch<SetStateAction<boolean>>;
  generateProxiesBatch: () => void | Promise<void>;
  duckAllMusicBeds: () => void;
  applySpeedRamp: (clipId: string, kind: SpeedRampKind) => void;
  selectedId: string | null;
  viewClips: TimelineClip[];
  starts: number[];
  current: number;
  pushToast: ToastFn;
  setDarkTheme: Dispatch<SetStateAction<boolean>>;
  setShowKeymap: Dispatch<SetStateAction<boolean>>;
  setEditTool: Dispatch<SetStateAction<ToolId>>;
};

/**
 * Command palette entries. Empty deps match the prior StudioEditor freeze —
 * handlers close over first-render bindings (same as before extraction).
 */
export function useStudioCommands(actions: StudioCommandActions): CommandItem[] {
  return useMemo(
    () => {
      const a = actions;
      return [
        { id: "play", label: "Play / Pause", shortcut: "Space", run: () => a.togglePlay() },
        { id: "split", label: "Split at playhead", shortcut: "S", run: () => a.splitAtPlayhead() },
        { id: "export", label: "Export video", run: () => a.setShowExport(true) },
        { id: "save", label: "Save project", shortcut: "Ctrl+S", run: () => void a.saveProjectState(false) },
        { id: "undo", label: "Undo", shortcut: "Ctrl+Z", run: () => a.undo() },
        { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", run: () => a.redo() },
        { id: "text", label: "Add text", run: () => a.addText() },
        { id: "adj", label: "Add adjustment layer", run: () => a.addAdjustmentLayer() },
        { id: "marker", label: "Add marker", shortcut: "Shift+M", run: () => a.addMarker() },
        { id: "marker-prev", label: "Previous marker", shortcut: "[", run: () => a.seekPrevMarker() },
        { id: "marker-next", label: "Next marker", shortcut: "]", run: () => a.seekNextMarker() },
        { id: "history", label: "Show undo history", run: () => a.setHistoryOpen(true) },
        { id: "ws-edit", label: "Workspace: Editing", hint: "layout", run: () => a.applyWorkspace("editing") },
        { id: "ws-color", label: "Workspace: Color", hint: "layout", run: () => a.applyWorkspace("color") },
        { id: "ws-audio", label: "Workspace: Audio", hint: "layout", run: () => a.applyWorkspace("audio") },
        { id: "ws-deliver", label: "Workspace: Deliver", hint: "layout", run: () => a.applyWorkspace("deliver") },
        {
          id: "growth-hub",
          label: "Open Growth Hub",
          hint: "AI",
          run: () => a.setShowGrowthHub(true),
        },
        {
          id: "ai-analyze",
          label: "AI: Analyze timeline",
          hint: "AI",
          run: () => {
            a.setSidebarTab("ai");
            void a.runAiAnalyze();
          },
        },
        {
          id: "ai-search",
          label: "AI: Search transcript",
          hint: "AI",
          run: () => a.setSidebarTab("ai"),
        },
        {
          id: "ai-reframe",
          label: "AI: Reframe to face",
          hint: "AI",
          run: () => void a.runAiReframe(),
        },
        {
          id: "ai-broll-suggest",
          label: "AI: Suggest B-roll",
          hint: "AI",
          run: () => {
            a.setSidebarTab("broll");
            void a.suggestAndInsertBroll();
          },
        },
        {
          id: "share-review",
          label: "Share review link",
          hint: "collab",
          run: () => void a.createShareLink(),
        },
        {
          id: "export-thumb",
          label: "Export thumbnail PNG",
          hint: "AI",
          run: () => void a.exportThumbnail(),
        },
        { id: "float-bin", label: "Toggle float media bin", run: () => a.setFloatBin((v) => !v) },
        { id: "float-insp", label: "Toggle float inspector", run: () => a.setFloatInspector((v) => !v) },
        { id: "proxy", label: "Toggle proxy preview", run: () => a.setUseProxy((v) => !v) },
        {
          id: "proxy-batch",
          label: "Generate proxies for all media",
          run: () => void a.generateProxiesBatch(),
        },
        {
          id: "duck-all",
          label: "Duck all music beds",
          run: () => a.duckAllMusicBeds(),
        },
        {
          id: "ramp-in",
          label: "Speed ramp in (slow→1×)",
          run: () => {
            const id =
              a.selectedId || a.viewClips[activeMainIndex(a.viewClips, a.starts, a.current)]?.id;
            if (id) a.applySpeedRamp(id, "ramp-in");
            else a.pushToast("Select a clip first", "info");
          },
        },
        {
          id: "ramp-out",
          label: "Speed ramp out (1×→slow)",
          run: () => {
            const id =
              a.selectedId || a.viewClips[activeMainIndex(a.viewClips, a.starts, a.current)]?.id;
            if (id) a.applySpeedRamp(id, "ramp-out");
            else a.pushToast("Select a clip first", "info");
          },
        },
        {
          id: "slow-mo",
          label: "Slow-mo punch ramp",
          run: () => {
            const id =
              a.selectedId || a.viewClips[activeMainIndex(a.viewClips, a.starts, a.current)]?.id;
            if (id) a.applySpeedRamp(id, "slow-mo");
            else a.pushToast("Select a clip first", "info");
          },
        },
        { id: "theme", label: "Toggle day / night theme", run: () => a.setDarkTheme((v) => !v) },
        { id: "keymap", label: "Keyboard shortcuts", run: () => a.setShowKeymap(true) },
        { id: "tool-select", label: "Tool: Select", shortcut: "V", run: () => a.setEditTool("select") },
        { id: "tool-blade", label: "Tool: Blade", shortcut: "C", run: () => a.setEditTool("blade") },
        { id: "tool-trim", label: "Tool: Trim", shortcut: "T", run: () => a.setEditTool("trim") },
        { id: "tool-ripple", label: "Tool: Ripple", shortcut: "R", run: () => a.setEditTool("ripple") },
        { id: "tool-slip", label: "Tool: Slip", shortcut: "Y", run: () => a.setEditTool("slip") },
        { id: "tool-slide", label: "Tool: Slide", shortcut: "U", run: () => a.setEditTool("slide") },
        { id: "tool-roll", label: "Tool: Roll", shortcut: "N", run: () => a.setEditTool("roll") },
        { id: "tool-hand", label: "Tool: Hand", shortcut: "H", run: () => a.setEditTool("hand") },
        { id: "tool-zoom", label: "Tool: Zoom", shortcut: "Z", run: () => a.setEditTool("zoom") },
      ];
    },
    // Freeze once — matches prior StudioEditor command palette.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
