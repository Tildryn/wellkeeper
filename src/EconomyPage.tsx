import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "./Icons";
import { BarRow } from "./BarRow";
import { niceMax, useWidth } from "./chart";
import "./EconomyPage.css";
import "./DemographicsPage.css";

// History of the town's shared resources, from wkserver's /economy/:resource.
// Levels are [unix seconds, value]; flows are [unix seconds of the hour,
// reason, signed amount, events], summed per hour and reason. The average
// gold's levels carry a third element, the sample's detail.

type AverageDetail = { characters: number; median: number; total: number };
type Level = [number, number, (AverageDetail | null)?];
type Flow = [number, string, number, number];
type Latest = { t: number; value: number; detail: Record<string, number | string> | null } | null;
type History = { resource: string; levels: Level[]; flows: Flow[]; latest: Latest };

// reasonLabels names each reason in the table when one series claims several.
type Series = { key: string; label: string; color: string; reasons: string[]; reasonLabels?: Record<string, string> };

type ResourceConfig = {
  resource: string;
  title: string;
  description: string;
  // Stacked from the zero line outwards, above it for gains and below for
  // losses. Colour order was checked for colour-blind separation between
  // neighbours; "Other" is a deliberate neutral.
  gains: Series[];
  losses: Series[];
  refs?: [number, string][];
  // What the per-day chart calls its total, and the chart itself, when it is
  // not a net of gains and losses.
  totalLabel?: string;
  flowsLabel?: string;
};

const OTHER = "var(--eco-other)";

const RESOURCES: ResourceConfig[] = [
  {
    resource: "food",
    title: "Food Stores",
    description: "The town's food stores. Fishing (2,100 to 2,500 a day, varying by the day), farming (925 a day of wheat), livestock (125 a day), Foodstock hand-ins, and the Millers' Grey Soup (one for each Scar Fragment handed in) add to them; the villagers (420, each eating three meals and a snack, 4,200 a day), snacks, meals, thrown food, and rot take from them. Everyone eats a mix, by diet: fish 47%, wheat 17%, meat 7%, berries 16%, and mushrooms 13%, and more of the rest when one runs short. Nobody eats Grey Soup by choice: it joins the diet once the proper food runs below 2,000, is the last resort when the stores are empty, and otherwise rots. Whatever is left rots at its own rate: Grey Soup within the day, berries next, then fish and mushrooms, then meat, and wheat barely at all. Before the baselines, a flat decay of 200 a day stood in for all of that.",
    gains: [
      { key: "fishing", label: "Fishing (2,100–2,500 a day)", color: "var(--eco-violet)", reasons: ["fishing"] },
      { key: "farming", label: "Farming (925 a day)", color: "var(--eco-brown)", reasons: ["farming"] },
      { key: "livestock", label: "Livestock (125 a day)", color: "var(--eco-gold)", reasons: ["livestock"] },
      { key: "handin", label: "Foodstock handed in", color: "var(--eco-blue)", reasons: ["handin"] },
      { key: "greysoup", label: "Grey Soup (1 per Scar Fragment)", color: "var(--eco-greysoup)", reasons: ["greysoup"] },
    ],
    losses: [
      { key: "villagers", label: "Eaten by villagers (4,200 a day)", color: "var(--eco-orange)", reasons: ["villagers", "villagers_soup"], reasonLabels: { villagers: "Eaten by villagers", villagers_soup: "Grey Soup eaten by villagers" } },
      { key: "purchase", label: "Bought before Sep 23 (snack or meal)", color: "var(--eco-magenta)", reasons: ["purchase"] },
      { key: "snack", label: "Snacks bought", color: "var(--eco-green)", reasons: ["snack"] },
      { key: "meal", label: "Meals bought (3 each)", color: "var(--eco-yellow)", reasons: ["meal"] },
      { key: "decay", label: "Passive decay (200 a day, before the baselines)", color: "var(--eco-aqua)", reasons: ["decay"] },
      { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ["rot_greysoup", "rot_berries", "rot_fish", "rot_mushrooms", "rot_meat", "rot_wheat"], reasonLabels: { rot_greysoup: "Rotted: Grey Soup", rot_berries: "Rotted: berries", rot_fish: "Rotted: fish", rot_mushrooms: "Rotted: mushrooms", rot_meat: "Rotted: meat", rot_wheat: "Rotted: wheat" } },
    ],
    refs: [[2500, "2,500 · snack markup 0% above this"], [2000, "2,000 · meal markup 0% above this"]],
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

// The gold an active character holds (wkserver's gold_average): its file was
// saved in the last ACTIVE_DAYS and it is above the starting level. Both
// figures are wkserver's (src/economy.ts).
const ACTIVE_DAYS = 14;
const MIN_LEVEL = 4;

// Where gold is spent (gold_spent). The game records each payment by the
// store it was made at ("store_" and the store's tag, less its "pw_mr_") or
// the service paid for. Eight groups at most get a colour of their own, in
// this order, which was checked for colour-blind separation between
// neighbours; every other store and service falls into Other, and still has
// a name of its own in the breakdown and the table.
const SPENDING: ResourceConfig = {
  resource: "gold_spent",
  title: "Where Gold Is Spent",
  description: "The gold players pay out, recorded by the game as it is spent: every store purchase, under the store it was made at, and the tailor's fee, the Crow's letters, and its announcements. Purchases by DMs are left out, and so are gold handed between players and gold earned by selling to a store.",
  gains: [
    { key: "food", label: "Food", color: "var(--eco-orange)", reasons: ["store_foodmealrh", "store_foodsnackrh", "store_foodgreyrh"], reasonLabels: { store_foodmealrh: "Meals", store_foodsnackrh: "Snacks", store_foodgreyrh: "Grey Soup" } },
    { key: "alchemist", label: "Alchemist (Ephedra)", color: "var(--eco-violet)", reasons: ["store_ephedra"] },
    { key: "healer", label: "Healing (Fabella Tarsus)", color: "var(--eco-aqua)", reasons: ["store_tarsus"] },
    { key: "gadgets", label: "Gadgets and tools (Mireva)", color: "var(--eco-yellow)", reasons: ["store_mireva"] },
    { key: "scrolls", label: "Scrolls and tomes (The Boy)", color: "var(--eco-blue)", reasons: ["store_theboy"] },
    { key: "arms", label: "Arms and armour", color: "var(--eco-brown)", reasons: ["store_ylogue", "store_dlockwud"], reasonLabels: { store_ylogue: "Yasha Logue", store_dlockwud: "Dan Lockwood" } },
    { key: "clothing", label: "Clothing and tailoring", color: "var(--eco-magenta)", reasons: ["store_jmarian", "tailor"], reasonLabels: { store_jmarian: "Jacq Marian", tailor: "Tailor's fee" } },
    { key: "crow", label: "The Crow", color: "var(--eco-green)", reasons: ["crow_letter", "crow_announcement", "store_crow"], reasonLabels: { crow_letter: "Letters sent", crow_announcement: "Announcements", store_crow: "Paper and books" } },
  ],
  losses: [],
  totalLabel: "Spent",
  flowsLabel: "Gold spent per day",
};

// Names for the stores and services that fall into Other.
const OTHER_SPEND_LABELS: Record<string, string> = {
  store_storeclerk: "Furnishings (Musihirah Goldgrip)",
  store_hrotheld: "Hackett Rotheld's wares",
  store_nfnick: "Nine Fingered Nick",
  store_fbazal: "Fitz Bazalgate",
  store_dredgebartender: "The Dredge bartender",
  store_normmerch: "Trustworthy Shopkeep",
  dialogue: "Other payments in conversation",
};

const spendLabel = (reason: string) => {
  const s = SPENDING.gains.find((s) => s.reasons.includes(reason));
  return s?.reasonLabels?.[reason] ?? s?.label ?? OTHER_SPEND_LABELS[reason]
    ?? (reason.startsWith("store_") ? `Store ${reason.slice(6)}` : reason.replace(/_/g, " "));
};

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

// A second line drawn over the first, on the same axis: the median under the
// average gold. `note` adds a line to the tooltip.
type SecondLine = { label: string; mainLabel: string; of: (l: Level) => number; note?: (l: Level) => string };

function LevelChart({ levels, refs, title, second }: { levels: Level[]; refs?: [number, string][]; title: string; second?: SecondLine }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (levels.length === 0) return <p className="economy__empty">No samples yet.</p>;

  const narrow = W < 560;
  const H = narrow ? 240 : 300;
  const m = { l: 64, r: 16, t: 16, b: 28 };
  const t0 = levels[0][0], t1 = Math.max(levels[levels.length - 1][0], t0 + 3600);
  const vMax = niceMax(Math.max(...levels.map((l) => Math.max(l[1], second ? second.of(l) : 0))) * 1.05);
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - v / vMax) * (H - m.t - m.b);

  const steps = (of: (l: Level) => number) => {
    let p = `M${x(levels[0][0]).toFixed(1)},${y(of(levels[0])).toFixed(1)}`;
    for (let i = 1; i < levels.length; i++) p += `H${x(levels[i][0]).toFixed(1)}V${y(of(levels[i])).toFixed(1)}`;
    return p;
  };
  const d = steps((l) => l[1]);
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
        {second && <path d={steps(second.of)} className="economy__line economy__line--second" />}
        <circle cx={x(last[0])} cy={y(last[1])} r={4.5} className="economy__dot" />
        {second && <circle cx={x(last[0])} cy={y(second.of(last))} r={4.5} className="economy__dot economy__dot--second" />}
        {hv && (
          <>
            <line x1={x(hv[0])} x2={x(hv[0])} y1={m.t} y2={y(0)} className="economy__hair" />
            <circle cx={x(hv[0])} cy={y(hv[1])} r={4.5} className="economy__dot" />
            {second && <circle cx={x(hv[0])} cy={y(second.of(hv))} r={4.5} className="economy__dot economy__dot--second" />}
          </>
        )}
      </svg>
      {hv && !second && (
        <div className="economy__tip" style={{ left: Math.min((x(hv[0]) / W) * 100, 70) + "%", top: 8 }}>
          <strong>{fmt(hv[1])}</strong>
          <span>{timeLabel(hv[0])}</span>
        </div>
      )}
      {hv && second && (
        <div className="economy__tip" style={{ left: Math.min((x(hv[0]) / W) * 100, 66) + "%", top: 8 }}>
          <span>{timeLabel(hv[0])}</span>
          <span className="economy__tip-row"><i style={{ background: "var(--eco-blue)" }} />{second.mainLabel}<b>{fmt(hv[1])}</b></span>
          <span className="economy__tip-row"><i style={{ background: "var(--eco-yellow)" }} />{second.label}<b>{fmt(second.of(hv))}</b></span>
          {second.note && <span>{second.note(hv)}</span>}
        </div>
      )}
    </div>
  );
}

function FlowChart({ days, config }: { days: DayFlows[]; config: ResourceConfig }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) return <p className="economy__empty">No flows recorded yet.</p>;

  // A chart with no losses (the gold spent) has no lower half, and its
  // figures are plain amounts rather than signed changes.
  const twoSided = config.losses.length > 0;
  const label = twoSided ? signed : fmt;
  const gains = [...config.gains, { key: "other_gain", label: "Other", color: OTHER, reasons: [] }];
  const losses = twoSided ? [{ key: "other_loss", label: "Other", color: OTHER, reasons: [] }, ...config.losses] : [];
  const up = (d: DayFlows) => gains.reduce((s, g) => s + Math.max(0, d.bySeries[g.key] ?? 0), 0);
  const down = (d: DayFlows) => losses.reduce((s, g) => s + Math.max(0, -(d.bySeries[g.key] ?? 0)), 0);
  const vTop = niceMax(Math.max(...days.map(up), 1));
  const vBot = twoSided ? niceMax(Math.max(...days.map(down), 1)) : 0;

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

  const ticks = twoSided ? [-vBot, -vBot / 2, 0, vTop / 2, vTop] : [0, vTop / 2, vTop];
  const hd = hover === null ? null : days[hover];

  return (
    <div className="economy__chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img"
        aria-label={`${config.flowsLabel ?? "Added and removed per day"}, ${dayLabel(days[0].t)} to ${dayLabel(days[days.length - 1].t)}. The figures are in the table below.`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "economy__axis" : "economy__grid"} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{label(v)}</text>
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
          <strong>{config.totalLabel ?? "Net"} {label(hd.net)}</strong>
          <span>{dayLabel(hd.t)} (UTC)</span>
          {[...gains, ...losses].filter((s) => hd.bySeries[s.key]).map((s) => (
            <span key={s.key} className="economy__tip-row">
              <i style={{ background: s.color }} />{s.label}<b>{label(hd.bySeries[s.key])}</b>
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
  const labelOf = (reason: string) => {
    const s = [...config.gains, ...config.losses].find((s) => s.reasons.includes(reason));
    return s?.reasonLabels?.[reason] ?? s?.label ?? reason.replace(/_/g, " ");
  };
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

// A share as a whole percentage; one that rounds to nothing but is not
// nothing reads "<1%".
const share = (n: number, of: number) =>
  !of ? "–" : n > 0 && n / of < 0.005 ? "<1%" : `${Math.round((n / of) * 100)}%`;

// The slope of the least-squares line through the levels in [from, to], in
// gold a week, or null when the samples cover less than most of that span.
// A trend rather than the difference between the two ends, since one rich
// character logging in or going quiet jumps the average from one sample to
// the next.
function trendPerWeek(levels: Level[], from: number, to: number): number | null {
  const pts = levels.filter((l) => l[0] >= from && l[0] <= to);
  if (pts.length < 2 || pts[pts.length - 1][0] - pts[0][0] < (to - from) * 0.8) return null;
  const mt = pts.reduce((s, l) => s + l[0], 0) / pts.length;
  const mv = pts.reduce((s, l) => s + l[1], 0) / pts.length;
  let stv = 0, stt = 0;
  for (const [t, v] of pts) { stv += (t - mt) * (v - mv); stt += (t - mt) ** 2; }
  return stt ? (stv / stt) * 7 * 86400 : null;
}

// The gold an active character holds. The history comes with at least a
// month behind it whatever the range, for the 30-day trend, and the chart is
// cut to the range.
function AverageGoldSection({ history, rangeDays }: { history: History; rangeDays: number }) {
  const { latest } = history;
  const now = latest?.t ?? 0;
  const levels = useMemo(
    () => rangeDays ? history.levels.filter((l) => l[0] >= now - rangeDays * 86400) : history.levels,
    [history, rangeDays, now]
  );
  const detail = latest?.detail;
  const trends = ([[7, "Last 7 Days"], [30, "Last 30 Days"]] as const).map(([d, label]) =>
    ({ d, label, perWeek: trendPerWeek(history.levels, now - d * 86400, now) }));

  return (
    <section className="economy__section" aria-labelledby="eco-gold_average">
      <h3 id="eco-gold_average">Gold per Active Character</h3>
      <p className="economy__sub">
        The gold an active character carries: one played in the last {ACTIVE_DAYS} days (the server saves a character only while it is logged in), and above level {MIN_LEVEL - 1}, the level every new character starts at. A few rich characters pull the average up, so the median, the character in the middle, is the more typical figure. Growth is the slope of the average's trend line, so characters starting or stopping play move it as well as gold earned and spent.
      </p>

      <div className="economy__stats">
        <div className="economy__stat">
          <span className="economy__stat-label">Average Now</span>
          <span className="economy__stat-value economy__stat-value--hero">{latest ? fmt(latest.value) : "–"}</span>
          <span className="economy__stat-note">{detail ? `Over ${fmt(Number(detail.characters))} active characters` : "Not sampled yet"}</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Median Now</span>
          <span className="economy__stat-value">{detail ? fmt(Number(detail.median)) : "–"}</span>
          <span className="economy__stat-note">{detail ? "Half of them carry less than this" : "Not sampled yet"}</span>
        </div>
        {trends.map(({ d, label, perWeek }) => (
          <div className="economy__stat" key={d}>
            <span className="economy__stat-label">Growth, {label}</span>
            <span className={`economy__stat-value${perWeek === null ? "" : perWeek >= 0 ? " economy__pos" : " economy__neg"}`}>
              {perWeek === null ? "–" : `${signed(perWeek)}`}
            </span>
            <span className="economy__stat-note">
              {perWeek === null ? `Needs ${d} days of samples`
                : `A week, on average${latest?.value ? ` (${signed((perWeek / latest.value) * 100)}%)` : ""}`}
            </span>
          </div>
        ))}
      </div>

      <div className="economy__card">
        <h4>Over Time</h4>
        <div className="economy__legend" aria-hidden="true">
          <span><i style={{ background: "var(--eco-blue)" }} />Average</span>
          <span><i style={{ background: "var(--eco-yellow)" }} />Median</span>
        </div>
        <LevelChart levels={levels} title="The average gold per active character"
          second={{
            label: "Median", mainLabel: "Average", of: (l) => l[2]?.median ?? 0,
            note: (l) => l[2] ? `${fmt(l[2].characters)} active characters` : "",
          }} />
      </div>
    </section>
  );
}

// Where gold is spent, from the payments the game records.
function SpendingSection({ history, now }: { history: History; now: number }) {
  // The game records a payment as the negative change it makes, so it is
  // turned around here to chart the gold spent upwards.
  const flows = useMemo(() => history.flows.map(([t, r, a, e]): Flow => [t, r, -a, e]), [history]);
  const days = useMemo(() => foldFlows(flows, SPENDING), [flows]);

  const weekFlows = flows.filter((f) => f[0] >= now - 7 * 86400);
  const weekDays = Math.max(1, Math.min(7, (now - (weekFlows[0]?.[0] ?? now)) / 86400));
  const perDay = weekFlows.reduce((s, f) => s + f[2], 0) / weekDays;
  const paymentsPerDay = weekFlows.reduce((s, f) => s + f[3], 0) / weekDays;

  // Totals over the range shown, per store or service, then per group.
  const byReason = new Map<string, { amount: number; events: number }>();
  for (const [, r, a, e] of flows) {
    const x = byReason.get(r) ?? { amount: 0, events: 0 };
    x.amount += a;
    x.events += e;
    byReason.set(r, x);
  }
  const total = [...byReason.values()].reduce((s, x) => s + x.amount, 0);
  const claimed = new Set(SPENDING.gains.flatMap((g) => g.reasons));
  const groups = [...SPENDING.gains, { key: "other", label: "Other", color: OTHER, reasons: [] as string[] }]
    .map((g) => {
      const members = [...byReason]
        .filter(([r]) => g.key === "other" ? !claimed.has(r) : g.reasons.includes(r))
        .map(([reason, x]) => ({ reason, ...x }))
        .sort((a, b) => b.amount - a.amount);
      return { ...g, members, amount: members.reduce((s, x) => s + x.amount, 0), events: members.reduce((s, x) => s + x.events, 0) };
    })
    .filter((g) => g.amount > 0);
  // Largest first, with Other always last.
  const ranked = [...groups.filter((g) => g.key !== "other").sort((a, b) => b.amount - a.amount), ...groups.filter((g) => g.key === "other")];
  const top = ranked[0]?.key === "other" ? null : ranked[0];
  const groupOf = (reason: string) => SPENDING.gains.find((g) => g.reasons.includes(reason))?.label ?? "Other";
  const rows = [...byReason].map(([reason, x]) => ({ reason, ...x })).sort((a, b) => b.amount - a.amount);

  return (
    <section className="economy__section" aria-labelledby="eco-gold_spent">
      <h3 id="eco-gold_spent">{SPENDING.title}</h3>
      <p className="economy__sub">{SPENDING.description}</p>

      {flows.length === 0 ? <p className="economy__empty">Nothing recorded in this range yet.</p> : (
        <>
          <div className="economy__stats">
            <div className="economy__stat">
              <span className="economy__stat-label">Spent per Day</span>
              <span className="economy__stat-value economy__stat-value--hero">{weekFlows.length ? fmt(perDay) : "–"}</span>
              <span className="economy__stat-note">
                {!weekFlows.length ? "Nothing in the last 7 days" : `Average over the last ${weekDays >= 6.9 ? "7 days" : `${weekDays.toFixed(1)} days`}`}
              </span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Payments per Day</span>
              <span className="economy__stat-value">{weekFlows.length ? fmt(paymentsPerDay) : "–"}</span>
              <span className="economy__stat-note">{weekFlows.length ? "Purchases and fees, over the same days" : "Nothing in the last 7 days"}</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Spent in Range</span>
              <span className="economy__stat-value">{fmt(total)}</span>
              <span className="economy__stat-note">{fmt(rows.reduce((s, x) => s + x.events, 0))} payments</span>
            </div>
            {top && (
              <div className="economy__stat">
                <span className="economy__stat-label">Most Spent On</span>
                <span className="economy__stat-value">{share(top.amount, total)}</span>
                <span className="economy__stat-note">{top.label}, over the range shown</span>
              </div>
            )}
          </div>

          <div className="economy__card">
            <h4>By Store and Service</h4>
            <div className="demo-bars">
              {ranked.map((g) => (
                <BarRow key={g.key} label={g.label} value={fmt(g.amount)} max={ranked.reduce((m, x) => Math.max(m, x.amount), 0)}
                  muted={g.key === "other"}
                  segments={[{ n: g.amount, className: `eco-seg--${g.key}` }]}
                  tip={<>
                    <strong>{g.label}</strong>
                    <span>{share(g.amount, total)} of the gold spent · {fmt(g.events)} payments, {fmt(g.amount / g.events)} each on average</span>
                    {(g.members.length > 1 || g.key === "other") && g.members.map((x) => (
                      <span key={x.reason} className="economy__tip-row">{spendLabel(x.reason)}<b>{fmt(x.amount)}</b></span>
                    ))}
                  </>} />
              ))}
            </div>
          </div>

          <div className="economy__card">
            <h4>Spent per Day</h4>
            <div className="economy__legend" aria-hidden="true">
              {SPENDING.gains.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
              <span><i style={{ background: OTHER }} />Other</span>
            </div>
            <FlowChart days={days} config={SPENDING} />
            <details className="economy__details">
              <summary>Show as a table</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr><th>Store or Service</th><th>Group</th><th>Gold</th><th>Payments</th><th>Average</th><th>Share</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((x) => (
                      <tr key={x.reason}>
                        <td>{spendLabel(x.reason)}</td>
                        <td>{groupOf(x.reason)}</td>
                        <td>{fmt(x.amount)}</td>
                        <td>{fmt(x.events)}</td>
                        <td>{x.events ? fmt(x.amount / x.events) : "–"}</td>
                        <td>{share(x.amount, total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </>
      )}
    </section>
  );
}

interface EconomyPageProps {
  authToken: string;
}

function EconomyPage({ authToken }: EconomyPageProps) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Record<string, History>>({});
  // When the data came in (unix seconds), for the spending's last 7 days.
  const [fetchedAt, setFetchedAt] = useState(0);
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
    // A wkserver from before the average gold and the spending answers 404
    // for them, and the page shows the rest.
    const get = (resource: string, d: number, optional = false) =>
      fetch(`${import.meta.env.VITE_API_URL}/economy/${resource}?days=${d}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((res) => {
        if (optional && res.status === 404) return null;
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<History>;
      });
    Promise.all([
      ...RESOURCES.map((c) => get(c.resource, days)),
      get("gold_average", days ? Math.max(days, 31) : 0, true),
      get("gold_spent", days, true),
    ])
      .then((results) => {
        if (!current) return;
        setData(Object.fromEntries(results.filter((r): r is History => r !== null).map((r) => [r.resource, r])));
        setFetchedAt(Date.now() / 1000);
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
      {!loading && !error && data.gold_average && <AverageGoldSection history={data.gold_average} rangeDays={days} />}
      {!loading && !error && data.gold_spent && <SpendingSection history={data.gold_spent} now={fetchedAt} />}
    </div>
  );
}

export default EconomyPage;
