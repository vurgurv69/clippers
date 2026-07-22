"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { WorkspaceId } from "@/components/editor/StudioTopBar";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

export type StudioWorkspaceArgs = {
  setWorkspace: Dispatch<SetStateAction<WorkspaceId>>;
  setBinW: Dispatch<SetStateAction<number>>;
  setInspectorW: Dispatch<SetStateAction<number>>;
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

/** CapCut-style workspace presets (editing / color / audio / deliver). */
export function useStudioWorkspace(args: StudioWorkspaceArgs) {
  const {
    setWorkspace,
    setBinW,
    setInspectorW,
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
        setBinW(220);
        setInspectorW(320);
        setFloatBin(false);
        setFloatInspector(false);
        setExpanded(true);
        setSidebarTab("media");
        setTab("clip");
        setSidebarCollapsed(false);
        setInspectorCollapsed(false);
      } else if (w === "color") {
        setBinW(180);
        setInspectorW(400);
        setFloatBin(false);
        setFloatInspector(false);
        setSidebarTab("effects");
        setTab("color");
        setInspectorCollapsed(false);
      } else if (w === "audio") {
        setBinW(200);
        setInspectorW(340);
        setExpanded(true);
        setSidebarTab("media");
        setTab("audio");
        setInspectorCollapsed(false);
      } else if (w === "deliver") {
        setBinW(160);
        setInspectorW(280);
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
      setWorkspace,
    ],
  );

  return { applyWorkspace };
}
