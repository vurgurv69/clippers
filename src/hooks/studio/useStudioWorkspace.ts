"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { WorkspaceId } from "@/components/editor/StudioTopBar";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";
import {
  DEFAULT_BIN_W,
  DEFAULT_INSPECTOR_W,
  DEFAULT_TIMELINE_H,
} from "@/lib/studio-panel-resize";

export type StudioWorkspaceArgs = {
  setWorkspace: Dispatch<SetStateAction<WorkspaceId>>;
  setBinW: Dispatch<SetStateAction<number>>;
  setInspectorW: Dispatch<SetStateAction<number>>;
  setTimelineHVh?: Dispatch<SetStateAction<number>>;
  setFloatBin: Dispatch<SetStateAction<boolean>>;
  setFloatInspector: Dispatch<SetStateAction<boolean>>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  setInspectorCollapsed: Dispatch<SetStateAction<boolean>>;
  setShowExport: Dispatch<SetStateAction<boolean>>;
  setShowGrowthHub: Dispatch<SetStateAction<boolean>>;
};

/** CapCut-style workspace presets including Studio 2.0 layouts. */
export function useStudioWorkspace(args: StudioWorkspaceArgs) {
  const {
    setWorkspace,
    setBinW,
    setInspectorW,
    setTimelineHVh,
    setFloatBin,
    setFloatInspector,
    setExpanded,
    setSidebarTab,
    setTab,
    setSidebarCollapsed,
    setInspectorCollapsed,
    setShowExport,
    setShowGrowthHub,
  } = args;

  const applyWorkspace = useCallback(
    (w: WorkspaceId) => {
      setWorkspace(w);
      if (w === "editing") {
        setBinW(DEFAULT_BIN_W);
        setInspectorW(DEFAULT_INSPECTOR_W);
        setTimelineHVh?.(DEFAULT_TIMELINE_H);
        setFloatBin(false);
        setFloatInspector(false);
        setExpanded(true);
        setSidebarTab("media");
        setTab("clip");
        setSidebarCollapsed(false);
        setInspectorCollapsed(false);
      } else if (w === "color") {
        setBinW(200);
        setInspectorW(380);
        setTimelineHVh?.(32);
        setFloatBin(false);
        setFloatInspector(false);
        setSidebarTab("filters");
        setTab("color");
        setInspectorCollapsed(false);
      } else if (w === "audio") {
        setBinW(220);
        setInspectorW(340);
        setTimelineHVh?.(44);
        setExpanded(true);
        setSidebarTab("media");
        setTab("audio");
        setInspectorCollapsed(false);
      } else if (w === "captions") {
        setBinW(260);
        setInspectorW(320);
        setTimelineHVh?.(36);
        setSidebarTab("ai");
        setTab("text");
        setSidebarCollapsed(false);
        setInspectorCollapsed(false);
      } else if (w === "compact") {
        setBinW(200);
        setInspectorW(240);
        setTimelineHVh?.(28);
        setFloatBin(false);
        setFloatInspector(false);
        setExpanded(false);
        setSidebarCollapsed(false);
      } else if (w === "wide") {
        setBinW(320);
        setInspectorW(300);
        setTimelineHVh?.(48);
        setFloatBin(true);
        setFloatInspector(true);
        setExpanded(true);
        setSidebarCollapsed(false);
        setInspectorCollapsed(false);
      } else if (w === "deliver") {
        setBinW(180);
        setInspectorW(260);
        setTimelineHVh?.(30);
        setShowExport(true);
        setShowGrowthHub(true);
      }
    },
    [
      setBinW,
      setExpanded,
      setFloatBin,
      setFloatInspector,
      setInspectorCollapsed,
      setInspectorW,
      setShowExport,
      setShowGrowthHub,
      setSidebarCollapsed,
      setSidebarTab,
      setTab,
      setTimelineHVh,
      setWorkspace,
    ],
  );

  return { applyWorkspace };
}
