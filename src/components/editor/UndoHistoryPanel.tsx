"use client";

type Entry = {
  index: number;
  label: string;
  current: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  entries: Entry[];
  onJump: (index: number) => void;
};

/** Simple undo stack browser. */
export function UndoHistoryPanel({ open, onClose, entries, onJump }: Props) {
  if (!open) return null;
  return (
    <div className="undo-history-panel" role="dialog" aria-label="History">
      <header>
        <strong>History</strong>
        <button type="button" className="btn ghost tiny" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="undo-history-list">
        {entries.length === 0 && <p className="tool-hint">No history yet</p>}
        {[...entries].reverse().map((e) => (
          <button
            key={e.index}
            type="button"
            className={e.current ? "undo-row on" : "undo-row"}
            onClick={() => onJump(e.index)}
          >
            <span>{e.label}</span>
            {e.current && <span className="undo-now">now</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
