"use client";

type Channel = {
  id: string;
  label: string;
  color: string;
  volume: number;
  muted?: boolean;
  solo?: boolean;
  onVolume: (v: number) => void;
  onMute?: () => void;
  onSolo?: () => void;
};

/** Compact vertical mixer strip for clip + music buses. */
export function AudioMixerStrip({ channels }: { channels: Channel[] }) {
  if (!channels.length) return null;
  return (
    <div className="mixer-strip" role="group" aria-label="Audio mixer">
      {channels.map((ch) => (
        <div
          key={ch.id}
          className={`mixer-ch${ch.muted ? " muted" : ""}${ch.solo ? " solo" : ""}`}
        >
          <div className="mixer-fader-wrap">
            <input
              type="range"
              className="mixer-fader"
              min={0}
              max={2}
              step={0.01}
              value={ch.volume}
              onChange={(e) => ch.onVolume(Number(e.target.value))}
              aria-label={`${ch.label} volume`}
              style={{ accentColor: ch.color }}
            />
            <div className="mixer-meter-rail" aria-hidden>
              <span
                className="mixer-meter-fill"
                style={{
                  height: `${Math.min(100, (ch.muted ? 0 : ch.volume) * 50)}%`,
                  background: ch.color,
                }}
              />
            </div>
          </div>
          <div className="mixer-btns">
            {ch.onMute && (
              <button
                type="button"
                className={ch.muted ? "th-btn on" : "th-btn"}
                onClick={ch.onMute}
                title="Mute"
              >
                M
              </button>
            )}
            {ch.onSolo && (
              <button
                type="button"
                className={ch.solo ? "th-btn on" : "th-btn"}
                onClick={ch.onSolo}
                title="Solo"
              >
                S
              </button>
            )}
          </div>
          <span className="mixer-label" title={ch.label}>
            {ch.label}
          </span>
          <span className="mixer-db">{(ch.volume * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}
