"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";

export type WorkspaceId = "editing" | "color" | "audio" | "deliver";

type Props = {
  projectName?: string;
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
  nestDepth?: number;
  onExitCompound?: () => void;
  useProxy?: boolean;
  onToggleProxy?: () => void;
  onOpenCommands?: () => void;
  uiLarge?: boolean;
  onToggleUiLarge?: () => void;
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  magnetic?: boolean;
  onToggleMagnetic?: () => void;
  rippleEnabled?: boolean;
  onToggleRipple?: () => void;
};

/** CapCut-simple header: Logo · Project · Undo/Redo · Theme · Settings · Export */
export function StudioTopBar({
  projectName = "Untitled",
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
  nestDepth = 0,
  onExitCompound,
  useProxy = true,
  onToggleProxy,
  onOpenCommands,
  uiLarge,
  onToggleUiLarge,
  snapEnabled = true,
  onToggleSnap,
  magnetic = false,
  onToggleMagnetic,
  rippleEnabled = false,
  onToggleRipple,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!settingsOpen || !settingsBtnRef.current) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const r = settingsBtnRef.current!.getBoundingClientRect();
      setMenuPos({
        top: Math.round(r.bottom + 8),
        right: Math.round(window.innerWidth - r.right),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (settingsBtnRef.current?.contains(t)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const settingsMenu =
    settingsOpen &&
    menuPos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        className="settings-menu cc-menu cc-settings-panel"
        role="menu"
        data-theme={darkTheme ? "dark" : "light"}
        style={{ top: menuPos.top, right: menuPos.right }}
      >
        <p className="settings-heading">Appearance</p>
        {onToggleUiLarge && (
          <label className="cc-set-row">
            <span>UI size</span>
            <button type="button" className="cc-set-toggle" onClick={onToggleUiLarge}>
              {uiLarge ? "Large" : "Compact"}
            </button>
          </label>
        )}

        <p className="settings-heading">Playback</p>
        {onToggleProxy && (
          <label className="cc-set-row">
            <span>Preview quality</span>
            <button type="button" className="cc-set-toggle" onClick={onToggleProxy}>
              {useProxy ? "Proxy (faster)" : "Full"}
            </button>
          </label>
        )}

        <p className="settings-heading">Timeline</p>
        {onToggleSnap && (
          <label className="cc-set-row">
            <span>Snap to edges</span>
            <button
              type="button"
              className={snapEnabled ? "cc-set-toggle on" : "cc-set-toggle"}
              onClick={onToggleSnap}
            >
              {snapEnabled ? "On" : "Off"}
            </button>
          </label>
        )}
        {onToggleMagnetic && (
          <label className="cc-set-row">
            <span>Magnet drag</span>
            <button
              type="button"
              className={magnetic ? "cc-set-toggle on" : "cc-set-toggle"}
              onClick={onToggleMagnetic}
            >
              {magnetic ? "On" : "Off"}
            </button>
          </label>
        )}
        {onToggleRipple && (
          <label className="cc-set-row">
            <span>Ripple edit</span>
            <button
              type="button"
              className={rippleEnabled ? "cc-set-toggle on" : "cc-set-toggle"}
              onClick={onToggleRipple}
            >
              {rippleEnabled ? "On" : "Off"}
            </button>
          </label>
        )}

        <p className="settings-heading">Layout</p>
        {onToggleFloatBin && (
          <label className="cc-set-row">
            <span>Media panel</span>
            <button type="button" className="cc-set-toggle" onClick={onToggleFloatBin}>
              {floatBin ? "Floating" : "Docked"}
            </button>
          </label>
        )}
        {onToggleFloatInspector && (
          <label className="cc-set-row">
            <span>Inspector</span>
            <button type="button" className="cc-set-toggle" onClick={onToggleFloatInspector}>
              {floatInspector ? "Floating" : "Docked"}
            </button>
          </label>
        )}

        <p className="settings-heading">Help</p>
        {onOpenCommands && (
          <button
            type="button"
            role="menuitem"
            className="cc-set-link"
            onClick={() => {
              onOpenCommands();
              setSettingsOpen(false);
            }}
          >
            Command palette
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="cc-set-link"
          onClick={() => {
            onOpenKeymap();
            setSettingsOpen(false);
          }}
        >
          Keyboard shortcuts
        </button>
        {onOpenManual && (
          <button
            type="button"
            role="menuitem"
            className="cc-set-link"
            onClick={() => {
              onOpenManual();
              setSettingsOpen(false);
            }}
          >
            Studio manual
          </button>
        )}

        <button
          type="button"
          role="menuitem"
          className="cc-set-link danger"
          onClick={() => {
            onClose();
            setSettingsOpen(false);
          }}
        >
          Save & leave studio
        </button>
      </div>,
      document.body,
    );

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

      <div className="top-right">
        <div className="top-actions">
          <button
            type="button"
            className="btn cc-theme-btn"
            onClick={() => setDarkTheme((d) => !d)}
            title={darkTheme ? "Switch to bright mode" : "Switch to dark mode"}
            aria-label={darkTheme ? "Switch to bright mode" : "Switch to dark mode"}
            aria-pressed={!darkTheme}
          >
            {darkTheme ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="4" fill="currentColor" />
                <path
                  d="M12 2v2.2M12 19.8V22M4.2 12H2M22 12h-2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M20.2 14.2A8.2 8.2 0 0 1 9.8 3.8 8.4 8.4 0 1 0 20.2 14.2Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>

          {onOpenManual && (
            <button
              type="button"
              className="btn cc-top-btn cc-manual-btn"
              onClick={onOpenManual}
              title="Studio manual"
            >
              Manual
            </button>
          )}

          <div className="settings-wrap">
            <button
              ref={settingsBtnRef}
              type="button"
              className={settingsOpen ? "btn cc-top-btn on" : "btn cc-top-btn"}
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              title="Settings"
            >
              Settings
            </button>
            {settingsMenu}
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
