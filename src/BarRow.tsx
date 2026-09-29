import { useState } from "react";

// A horizontal bar with its label and value beside it. Segments stack from
// the left with a 2px gap; hovering the row shows `tip`. Shared by the
// Demographics and Metrics pages; its styles are in DemographicsPage.css.
export function BarRow({ label, value, segments, max, tip, muted }: {
  label: string;
  value: string;
  segments: { n: number; className: string }[];
  max: number;
  tip: React.ReactNode;
  muted?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const shown = segments.filter((s) => s.n > 0);
  return (
    <div className={`demo-bar${muted ? " demo-bar--muted" : ""}`} tabIndex={0}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <span className="demo-bar__label">{label}</span>
      <span className="demo-bar__track" aria-hidden="true">
        {shown.map((s, i) => (
          <i key={i} className={`demo-bar__seg ${s.className}${i === shown.length - 1 ? " demo-bar__seg--end" : ""}`}
            style={{ width: `${max ? (s.n / max) * 100 : 0}%` }} />
        ))}
      </span>
      <span className="demo-bar__value">{value}</span>
      {hover && <div className="economy__tip demo-bar__tip">{tip}</div>}
    </div>
  );
}
