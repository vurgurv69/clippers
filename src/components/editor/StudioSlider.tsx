"use client";

export function StudioSlider({
  label,
  hint,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  /** One short line under the title explaining the control. */
  hint?: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider cc-slider">
      <div className="slider-top">
        <label>
          <span className="slider-title">{label}</span>
          {hint ? <span className="slider-hint">{hint}</span> : null}
        </label>
        <span className="mono slider-val">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
