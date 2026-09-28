import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "./Icons";
import { niceMax, useWidth } from "./chart";
import "./EconomyPage.css";

// History of the town's shared resources, from wkserver's /economy/:resource.
// Levels are [unix seconds, value]; flows are [unix seconds of the hour,
// reason, signed amount, events], summed per hour and reason.

type Level = [number, number];
type Flow = [number, string, number, number];
type Latest = { t: number; value: number; detail: Record<string, number | string> | null } | null;
type History = { resource: string; levels: Level[]; flows: Flow[]; latest: Latest };

type Series = { key: string; label: string; color: string; reasons: string[] };

type ResourceConfig = {
  resource: "food" | "gold";
  title: string;
  description: string;
  // Stacked from the zero line outwards, above it for gains and below for
  // losses. Colour order was checked for colour-blind separation between
  // neighbours; "Other" is a deliberate neutral.
  gains: Series[];
  losses: Series[];
  refs?: [number, string][];
};

const OTHER = "var(--eco-other)";

const RESOURCES: ResourceConfig[] = [
  {
    resource: "food",
    title: "Food Stores",
    description: "The town's food stores. Foodstock hand-ins add to them; snacks, meals, thrown food, and the hourly decay of 200 a day take from them.",
    gains: [
      { key: "handin", label: "Foodstock handed in", color: "var(--eco-blue)", reasons: ["handin"] },
    ],
    losses: [
      { key: "purchase", label: "Bought before Sep 23 (snack or meal)", color: "var(--eco-magenta)", reasons: ["purchase"] },
      { key: "snack", label: "Snacks bought", color: "var(--eco-green)", reasons: ["snack"] },
      { key: "meal", label: "Meals bought (3 each)", color: "var(--eco-yellow)", reasons: ["meal"] },
      { key: "decay", label: "Passive decay", color: "var(--eco-aqua)", reasons: ["decay"] },
    ],
    refs: [[900, "900 · snack markup 0% above this"], [500, "500 · meal markup 0% above this"]],
  },
  {
    resource: "gold",
    title: "Gold Held by Characters",
    description: "The Gold on every character in the servervault. Flows compare each scan with the one before it, character by character.",
    gains: [
      { key: "gained", label: "Gained by characters", color: "var(--eco-blue)", reasons: ["gained"] },
      { key: "new_character", label: "On new characters", color: "var(--eco-aqua)", reasons: ["new_character"] },
    ],
    losses: [
      { key: "spent", label: "Spent or lost by characters", color: "var(--eco-magenta)", reasons: ["spent"] },
      { key: "deleted_character", label: "On deleted characters", color: "var(--eco-green)", reasons: ["deleted_character"] },
    ],
  },
];

const RANGES: [number, string][] = [[7, "7 Days"], [30, "30 Days"], [0, "All"]];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
const dayKey = (t: number) => Math.floor(t / 86400) * 86400;
const dayLabel = (t: number) => { const d = new Date(t * 1000); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const timeLabel = (t: number) => {
  const d = new Date(t * 1000);
  return `${dayLabel(t)}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

// Everything a resource's flows fold into: one bucket per series, plus
// "other" for any reason no series claims (DM adjustments, thrown food, ...).
type DayFlows = { t: number; bySeries: Record<string, number>; byReason: Record<string, { amount: number; events: number }>; net: number };

function foldFlows(flows: Flow[], config: ResourceConfig): DayFlows[] {
  const owner: Record<string, string> = {};
  for (const s of [...config.gains, ...config.losses]) for (const r of s.reasons) owner[r] = s.key;
  const days = new Map<number, DayFlows>();
  for (const [t, reason, amount, events] of flows) {
    const k = dayKey(t);
    let d = days.get(k);
    if (!d) { d = { t: k, bySeries: {}, byReason: {}, net: 0 }; days.set(k, d); }
    const key = owner[reason] ?? (amount >= 0 ? "other_gain" : "other_loss");
    d.bySeries[key] = (d.bySeries[key] ?? 0) + amount;
    const r = (d.byReason[reason] ??= { amount: 0, events: 0 });
    r.amount += amount;
    r.events += events;
    d.net += amount;
  }
  return [...days.values()].sort((a, b) => a.t - b.t);
}

function LevelChart({ levels, refs, title }: { levels: Level[]; refs?: [number, string][]; title: string }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (levels.length === 0) return <p className="economy__empty">No samples yet.</p>;

  const narrow = W < 560;
  const H = narrow ? 240 : 300;
  const m = { l: 64, r: 16, t: 16, b: 28 };
  const t0 = levels[0][0], t1 = Math.max(levels[levels.length - 1][0], t0 + 3600);
  const vMax = niceMax(Math.max(...levels.map((l) => l[1])) * 1.05);
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - v / vMax) * (H - m.t - m.b);

  let d = `M${x(levels[0][0]).toFixed(1)},${y(levels[0][1]).toFixed(1)}`;
  for (let i = 1; i < levels.length; i++) d += `H${x(levels[i][0]).toFixed(1)}V${y(levels[i][1]).toFixed(1)}`;
  const last = levels[levels.length - 1];

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * vMax);
  const span = t1 - t0;
  const step = span > 60 * 86400 ? 14 : span > 20 * 86400 ? 7 : span > 8 * 86400 ? 2 : 1;
  const dayTicks: number[] = [];
  for (let t = dayKey(t0) + 86400; t <= t1; t += step * 86400) dayTicks.push(t);

  const indexAt = (t: number) => {
    let lo = 0, hi = levels.length - 1;
    if (t < levels[0][0]) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (levels[mid][0] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const hv = hover === null ? null : levels[hover];

  return (
    <div className="economy__chart" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`} height={H} role="img" tabIndex={0}
        aria-label={`${title} over time, from ${fmt(levels[0][1])} on ${dayLabel(t0)} to ${fmt(last[1])} on ${dayLabel(last[0])}. Use the left and right arrow keys to step through time.`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) * W) / r.width;
          if (px < m.l) { setHover(null); return; }
          setHover(indexAt(t0 + ((px - m.l) / (W - m.l - m.r)) * (t1 - t0)));
        }}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onFocus={() => setHover(levels.length - 1)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const cur = levels[hover ?? levels.length - 1][0];
          setHover(indexAt(Math.min(Math.max(cur + (e.key === "ArrowRight" ? 3600 : -3600), t0), t1)));
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "economy__axis" : "economy__grid"} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{fmt(v)}</text>
          </g>
        ))}
        {dayTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="economy__tick">{dayLabel(t)}</text>
        ))}
        {(refs ?? []).filter(([v]) => v < vMax).map(([v, label], i, shown) => {
          // A reference line close under the one before it takes its label
          // below the line, so the two labels don't overprint.
          const crowded = i > 0 && y(v) - y(shown[i - 1][0]) < 16;
          return (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="economy__ref" />
              {!narrow && <text x={W - m.r} y={crowded ? y(v) + 13 : y(v) - 5} textAnchor="end" className="economy__ref-text">{label}</text>}
            </g>
          );
        })}
        <path d={`${d}H${x(last[0]).toFixed(1)}V${y(0)}H${x(levels[0][0]).toFixed(1)}Z`} className="economy__area" />
        <path d={d} className="economy__line" />
        <circle cx={x(last[0])} cy={y(last[1])} r={4.5} className="economy__dot" />
        {hv && (
          <>
            <line x1={x(hv[0])} x2={x(hv[0])} y1={m.t} y2={y(0)} className="economy__hair" />
            <circle cx={x(hv[0])} cy={y(hv[1])} r={4.5} className="economy__dot" />
          </>
        )}
      </svg>
      {hv && (
        <div className="economy__tip" style={{ left: Math.min((x(hv[0]) / W) * 100, 70) + "%", top: 8 }}>
          <strong>{fmt(hv[1])}</strong>
          <span>{timeLabel(hv[0])}</span>
        </div>
      )}
    </div>
  );
}

function FlowChart({ days, config }: { days: DayFlows[]; config: ResourceConfig }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) return <p className="economy__empty">No flows recorded yet.</p>;

  const gains = [...config.gains, { key: "other_gain", label: "Other", color: OTHER, reasons: [] }];
  const losses = [{ key: "other_loss", label: "Other", color: OTHER, reasons: [] }, ...config.losses];
  const up = (d: DayFlows) => gains.reduce((s, g) => s + Math.max(0, d.bySeries[g.key] ?? 0), 0);
  const down = (d: DayFlows) => losses.reduce((s, g) => s + Math.max(0, -(d.bySeries[g.key] ?? 0)), 0);
  const vTop = niceMax(Math.max(...days.map(up), 1));
  const vBot = niceMax(Math.max(...days.map(down), 1));

  const H = 280;
  const m = { l: 64, r: 10, t: 12, b: 28 };
  const y = (v: number) => m.t + ((vTop - v) / (vTop + vBot)) * (H - m.t - m.b);
  const band = (W - m.l - m.r) / days.length;
  const bw = Math.max(2, Math.min(24, band * 0.6));
  const labelEvery = Math.ceil(46 / band);

  // Segments run outward from the zero line with a 2px surface gap between
  // them; the data end of the outermost one is rounded.
  const stack = (d: DayFlows, series: typeof gains, dir: 1 | -1, cx: number) => {
    const shown = series.map((s) => ({ s, v: Math.max(0, dir * (d.bySeries[s.key] ?? 0)) })).filter((e) => e.v > 0);
    let acc = 0;
    return shown.map(({ s, v }, i) => {
      const a = y(dir * acc) - dir * (i === 0 ? 1 : 2);
      acc += v;
      const b = y(dir * acc);
      const top = Math.min(a, b), bottom = Math.max(a, b);
      const h = bottom - top;
      if (h < 0.5) return null;
      const r = i === shown.length - 1 ? Math.min(4, h, bw / 2) : 0;
      const xl = cx - bw / 2, xr = cx + bw / 2;
      const path = dir === 1
        ? `M${xl},${bottom}V${top + r}Q${xl},${top} ${xl + r},${top}H${xr - r}Q${xr},${top} ${xr},${top + r}V${bottom}Z`
        : `M${xl},${top}H${xr}V${bottom - r}Q${xr},${bottom} ${xr - r},${bottom}H${xl + r}Q${xl},${bottom} ${xl},${bottom - r}Z`;
      return <path key={s.key} d={path} fill={s.color} />;
    });
  };

  const ticks = [-vBot, -vBot / 2, 0, vTop / 2, vTop];
  const hd = hover === null ? null : days[hover];

  return (
    <div className="economy__chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img"
        aria-label={`Added and removed per day, ${dayLabel(days[0].t)} to ${dayLabel(days[days.length - 1].t)}. The figures are in the table below.`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "economy__axis" : "economy__grid"} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{signed(v)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = m.l + band * (i + 0.5);
          return (
            <g key={d.t} opacity={hover === null || hover === i ? 1 : 0.55}>
              {stack(d, gains, 1, cx)}
              {stack(d, losses, -1, cx)}
              {i % labelEvery === 0 && <text x={cx} y={H - 8} textAnchor="middle" className="economy__tick">{dayLabel(d.t)}</text>}
              <rect x={cx - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent"
                onPointerEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hd && (
        <div className="economy__tip" style={{ left: Math.min(((m.l + band * (hover! + 0.5)) / W) * 100, 62) + "%", top: 8 }}>
          <strong>Net {signed(hd.net)}</strong>
          <span>{dayLabel(hd.t)} (UTC)</span>
          {[...gains, ...losses].filter((s) => hd.bySeries[s.key]).map((s) => (
            <span key={s.key} className="economy__tip-row">
              <i style={{ background: s.color }} />{s.label}<b>{signed(hd.bySeries[s.key])}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceSection({ config, history }: { config: ResourceConfig; history: History }) {
  const days = useMemo(() => foldFlows(history.flows, config), [history, config]);
  const { levels, latest } = history;

  const now = latest?.t ?? 0;
  const dayAgo = levels.filter((l) => l[0] <= now - 86400).pop();
  const weekFlows = history.flows.filter((f) => f[0] >= now - 7 * 86400);
  const weekDays = Math.max(1, Math.min(7, (now - (weekFlows[0]?.[0] ?? now)) / 86400));
  const added = weekFlows.reduce((s, f) => s + Math.max(0, f[2]), 0) / weekDays;
  const removed = weekFlows.reduce((s, f) => s + Math.max(0, -f[2]), 0) / weekDays;
  const reasons = [...new Set(history.flows.map((f) => f[1]))];
  const labelOf = (reason: string) =>
    [...config.gains, ...config.losses].find((s) => s.reasons.includes(reason))?.label ?? reason.replace(/_/g, " ");
  const detail = latest?.detail;

  return (
    <section className="economy__section" aria-labelledby={`eco-${config.resource}`}>
      <h3 id={`eco-${config.resource}`}>{config.title}</h3>
      <p className="economy__sub">{config.description}</p>

      <div className="economy__stats">
        <div className="economy__stat">
          <span className="economy__stat-label">Now</span>
          <span className="economy__stat-value economy__stat-value--hero">{latest ? fmt(latest.value) : "–"}</span>
          <span className="economy__stat-note">{latest ? timeLabel(latest.t) : "Not sampled yet"}</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Last 24 Hours</span>
          <span className={`economy__stat-value${latest && dayAgo ? (latest.value >= dayAgo[1] ? " economy__pos" : " economy__neg") : ""}`}>
            {latest && dayAgo ? signed(latest.value - dayAgo[1]) : "–"}
          </span>
          <span className="economy__stat-note">{dayAgo ? `From ${fmt(dayAgo[1])}` : "Needs a day of samples"}</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Added per Day</span>
          <span className="economy__stat-value">{weekFlows.length ? fmt(added) : "–"}</span>
          <span className="economy__stat-note">
            {!weekFlows.length ? "No flows recorded yet" : `Average over the last ${weekDays >= 6.9 ? "7 days" : `${weekDays.toFixed(1)} days`}`}
          </span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Removed per Day</span>
          <span className="economy__stat-value">{weekFlows.length ? fmt(removed) : "–"}</span>
          <span className="economy__stat-note">{weekFlows.length ? "Average over the same days" : "No flows recorded yet"}</span>
        </div>
        {config.resource === "gold" && detail && (
          <div className="economy__stat">
            <span className="economy__stat-label">Characters</span>
            <span className="economy__stat-value">{fmt(Number(detail.characters))}</span>
            <span className="economy__stat-note">
              Median {fmt(Number(detail.median))} · top 10% hold {Math.round(Number(detail.top10pct_share) * 100)}%
            </span>
          </div>
        )}
      </div>

      <div className="economy__card">
        <h4>Over Time</h4>
        <LevelChart levels={levels} refs={config.refs} title={config.title} />
      </div>

      <div className="economy__card">
        <h4>Added and Removed per Day</h4>
        <div className="economy__legend" aria-hidden="true">
          {[...config.gains, ...config.losses].map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
          <span><i style={{ background: OTHER }} />Other</span>
        </div>
        <FlowChart days={days} config={config} />
        {days.length > 0 && (
          <details className="economy__details">
            <summary>Show as a table</summary>
            <div className="economy__table-wrap">
              <table>
                <thead>
                  <tr><th>Day (UTC)</th>{reasons.map((r) => <th key={r}>{labelOf(r)}</th>)}<th>Net</th></tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((d) => (
                    <tr key={d.t}>
                      <td>{dayLabel(d.t)}</td>
                      {reasons.map((r) => <td key={r}>{d.byReason[r] ? signed(d.byReason[r].amount) : "–"}</td>)}
                      <td>{signed(d.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

interface EconomyPageProps {
  authToken: string;
}

function EconomyPage({ authToken }: EconomyPageProps) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Record<string, History>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  // Loading is set by whatever asks for a fetch, so the effect itself only
  // sets state once the responses are in.
  function reload(nextDays = days) {
    setLoading(true);
    setError(null);
    setDays(nextDays);
    setReloads((n) => n + 1);
  }

  useEffect(() => {
    let current = true;
    Promise.all(RESOURCES.map((c) =>
      fetch(`${import.meta.env.VITE_API_URL}/economy/${c.resource}?days=${days}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<History>;
      })
    ))
      .then((results) => {
        if (!current) return;
        setData(Object.fromEntries(results.map((r) => [r.resource, r])));
        setLoading(false);
      })
      .catch((err) => { if (current) { setError(err.message); setLoading(false); } });
    return () => { current = false; };
  }, [days, authToken, reloads]);

  return (
    <div className="economy">
      <h2 className="sr-only">Economy</h2>
      <div className="list-toolbar">
        <div className="bans-filter" role="group" aria-label="Time range">
          {RANGES.map(([d, label]) => (
            <button key={d} aria-pressed={days === d}
              className={`bans-filter__btn${days === d ? " bans-filter__btn--active" : ""}`}
              onClick={() => reload(d)}>{label}</button>
          ))}
        </div>
        <button className="refresh-btn refresh-btn--refresh" aria-label="Refresh" onClick={() => reload()}>
          <IconRefresh /><span className="refresh-btn__label" aria-hidden="true"> Refresh</span>
        </button>
      </div>
      {loading && <p role="status">Loading...</p>}
      {error && <p role="alert" style={{ color: "#c0323a" }}>Error: {error}</p>}
      {!loading && !error && RESOURCES.map((c) => data[c.resource] && (
        <ResourceSection key={c.resource} config={c} history={data[c.resource]} />
      ))}
    </div>
  );
}

export default EconomyPage;
