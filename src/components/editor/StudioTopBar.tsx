"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AspectRatio } from "@/lib/types";
import { ASPECT_PRESETS } from "@/lib/types";

export type WorkspaceId = "editing" | "color" | "audio" | "deliver";

type Props = {
  projectName?: string;
  aspect: AspectRatio;
  setAspect: Dispatch<SetStateAction<AspectRatio>>;
  darkTheme: boolean;
  setDarkTheme: Dispatch<SetStateAction<boolean>>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
  exporting: boolean;
  onCancelExport: () => void;
  onExport: () => void;
  canExport: boolean;
  onOpenKeymap: () => void;
  onOpenManual?: () => void;
  floatBin?: boolean;
  floatInspector?: boolean;
  onToggleFloatBin?: () => void;
  onToggleFloatInspector?: () => void;
  onAddMarker?: () => void;
  onAddAdjustment?: () => void;
  nestDepth?: number;
  onExitCompound?: () => void;
  useProxy?: boolean;
  onToggleProxy?: () => void;
  workspace?: WorkspaceId;
  onWorkspace?: (w: WorkspaceId) => void;
  onOpenCommands?: () => void;
  uiLarge?: boolean;
  onToggleUiLarge?: () => void;
};

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: "editing", label: "Editing" },
  { id: "color", label: "Color" },
  { id: "audio", label: "Audio" },
  { id: "deliver", label: "Deliver" },
];

/** CapCut-simple header: Logo · Project · Undo/Redo · Settings · Export */
export function StudioTopBar({
  projectName = "Untitled",
  aspect,
  setAspect,
  darkTheme,
  setDarkTheme,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
  exporting,
  onCancelExport,
  onExport,
  canExport,
  onOpenKeymap,
  onOpenManual,
  floatBin,
  floatInspector,
  onToggleFloatBin,
  onToggleFloatInspector,
  onAddMarker,
  onAddAdjustment,
  nestDepth = 0,
  onExitCompound,
  useProxy = true,
  onToggleProxy,
  workspace = "editing",
  onWorkspace,
  onOpenCommands,
  uiLarge,
  onToggleUiLarge,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [settingsOpen]);

  return (
    <header className="studio-top cc-top">
      <div className="top-left">
        <button
          type="button"
          className="btn ghost tiny cc-back"
          onClick={onClose}
          title="Save and return to Clippers home"
        >
          ← Back
        </button>
        <div className="studio-brand cc-brand">
          Clip<em>pers</em>
        </div>
        <span className="top-sep" aria-hidden />
        <span className="project-name" title={projectName}>
          {projectName}
        </span>
        {nestDepth > 0 && onExitCompound && (
          <button type="button" className="btn tiny ghost" onClick={onExitCompound}>
            Exit nest
          </button>
        )}
      </div>

      <div className="top-center">
        <button type="button" className="btn icon-ghost" onClick={onUndo} disabled={!canUndo} title="Undo">
          ↶
        </button>
        <button type="button" className="btn icon-ghost" onClick={onRedo} disabled={!canRedo} title="Redo">
          ↷
        </button>
      </div>

      <div className="top-right" ref={menuRef}>
        <div className="top-actions">
          {onOpenManual && (
            <button
              type="button"
              className="btn cc-top-btn cc-manual-btn"
              onClick={onOpenManual}
              title="Studio manual"
            >
              <span className="cc-manual-ico" aria-hidden>
                <svg viewBox="0 0 16 16" width="13" height="13">
                  <path
                    d="M2.5 3.2h4.2c.9 0 1.7.4 2.3 1 .6-.6 1.4-1 2.3-1h4.2v9.1h-4.4c-.8 0-1.5.3-2.1.8-.6-.5-1.3-.8-2.1-.8H2.5V3.2z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path d="M8 4.4v7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </span>
              Manual
            </button>
          )}
          <div className="settings-wrap">
            <button
              type="button"
              className={settingsOpen ? "btn cc-top-btn on" : "btn cc-top-btn"}
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              title="Settings"
            >
              Settings
            </button>
            {settingsOpen && (
              <div className="settings-menu cc-menu" role="menu">
                <p className="settings-heading">Aspect</p>
                <div className="settings-chips">
                  {(Object.keys(ASPECT_PRESETS) as AspectRatio[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={aspect === k ? "chip on" : "chip"}
                      onClick={() => setAspect(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {onWorkspace && (
                  <>
                    <p className="settings-heading">Workspace</p>
                    <div className="settings-chips">
                      {WORKSPACES.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          className={workspace === w.id ? "chip on" : "chip"}
                          onClick={() => onWorkspace(w.id)}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <p className="settings-heading">Options</p>
                <button type="button" role="menuitem" onClick={() => setDarkTheme((d) => !d)}>
                  Theme: {darkTheme ? "Dark" : "Light"}
                </button>
                {onToggleProxy && (
                  <button type="button" role="menuitem" onClick={onToggleProxy}>
                    Preview: {useProxy ? "Proxy" : "Full"}
                  </button>
                )}
                {onToggleUiLarge && (
                  <button type="button" role="menuitem" onClick={onToggleUiLarge}>
                    UI: {uiLarge ? "Large" : "Compact"}
                  </button>
                )}
                {onToggleFloatBin && (
                  <button type="button" role="menuitem" onClick={onToggleFloatBin}>
                    {floatBin ? "Dock media" : "Float media"}
                  </button>
                )}
                {onToggleFloatInspector && (
                  <button type="button" role="menuitem" onClick={onToggleFloatInspector}>
                    {floatInspector ? "Dock inspector" : "Float inspector"}
                  </button>
                )}
                {onOpenCommands && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenCommands();
                      setSettingsOpen(false);
                    }}
                  >
                    Commands
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenKeymap();
                    setSettingsOpen(false);
                  }}
                >
                  Shortcuts
                </button>
                {onAddMarker && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddMarker();
                      setSettingsOpen(false);
                    }}
                  >
                    Add marker
                  </button>
                )}
                {onAddAdjustment && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAddAdjustment();
                      setSettingsOpen(false);
                    }}
                  >
                    Adjustment layer
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    onClose();
                    setSettingsOpen(false);
                  }}
                >
                  Save &amp; back to Clippers
                </button>
              </div>
            )}
          </div>

          {exporting ? (
            <button type="button" className="btn cc-top-btn" onClick={onCancelExport}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="btn primary cc-export"
              onClick={onExport}
              disabled={!canExport}
            >
              Export
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
