import { useEffect } from "react";

export type ShortcutHandlers = {
  onPlayPause?: () => void;
  onSplit?: () => void;
  onDelete?: () => void;
  onSeekBack?: () => void;
  onSeekForward?: () => void;
  onPrevClip?: () => void;
  onNextClip?: () => void;
  onUndoLast?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onSelectAll?: () => void;
  onSave?: () => void;
  onStop?: () => void;
  onReverse?: () => void;
  onForward?: () => void;
  onFirstFrame?: () => void;
  onLastFrame?: () => void;
  onToggleMute?: () => void;
  onAddMarker?: () => void;
  onPrevMarker?: () => void;
  onNextMarker?: () => void;
};

export type ShortcutAction = keyof ShortcutHandlers;

export const DEFAULT_KEYMAP: Record<string, ShortcutAction> = {
  " ": "onPlayPause",
  s: "onSplit",
  S: "onSplit",
  j: "onReverse",
  J: "onReverse",
  k: "onStop",
  K: "onStop",
  l: "onForward",
  L: "onForward",
  m: "onToggleMute",
  M: "onToggleMute",
  Delete: "onDelete",
  Backspace: "onDelete",
  ArrowLeft: "onSeekBack",
  ArrowRight: "onSeekForward",
  Home: "onFirstFrame",
  End: "onLastFrame",
  ",": "onPrevClip",
  ".": "onNextClip",
  "[": "onPrevMarker",
  "]": "onNextMarker",
};

const KEYMAP_STORAGE = "clippers.studio.keymap";

export function loadKeymap(): Record<string, ShortcutAction> {
  if (typeof window === "undefined") return { ...DEFAULT_KEYMAP };
  try {
    const raw = localStorage.getItem(KEYMAP_STORAGE);
    if (!raw) return { ...DEFAULT_KEYMAP };
    return { ...DEFAULT_KEYMAP, ...(JSON.parse(raw) as Record<string, ShortcutAction>) };
  } catch {
    return { ...DEFAULT_KEYMAP };
  }
}

export function saveKeymap(map: Record<string, ShortcutAction>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYMAP_STORAGE, JSON.stringify(map));
}

/**
 * Global editing shortcuts. Ignores events while typing in inputs.
 * Plain keys are remappable via localStorage (`clippers.studio.keymap`).
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  enabled = true,
  keymapOverride?: Record<string, ShortcutAction>,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        switch (e.key.toLowerCase()) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) handlers.onRedo?.();
            else handlers.onUndo?.();
            return;
          case "y":
            e.preventDefault();
            handlers.onRedo?.();
            return;
          case "c":
            e.preventDefault();
            handlers.onCopy?.();
            return;
          case "x":
            e.preventDefault();
            handlers.onCut?.();
            return;
          case "v":
            e.preventDefault();
            handlers.onPaste?.();
            return;
          case "d":
            e.preventDefault();
            handlers.onDuplicate?.();
            return;
          case "a":
            e.preventDefault();
            handlers.onSelectAll?.();
            return;
          case "s":
            e.preventDefault();
            handlers.onSave?.();
            return;
          default:
            return;
        }
      }

      const keymap = keymapOverride || loadKeymap();
      const action = keymap[e.key];
      if (!action) return;
      const fn = handlers[action];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled, keymapOverride]);
}
