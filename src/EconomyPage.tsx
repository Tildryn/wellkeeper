import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconRefresh } from "./Icons";
import { BarRow } from "./BarRow";
import { niceMax, useWidth } from "./chart";
import "./EconomyPage.css";
import "./DemographicsPage.css";

// History of the town's shared resources, from wkserver's /economy/:resource.
// Levels are [unix seconds, value]; flows are [unix seconds of the hour,
// reason, signed amount, events], summed per hour and reason. The average
// gold's levels carry a third element, the sample's detail.

// compared and change: the characters active in both this sample and the one
// before, and the sum of their change in gold (absent where nothing came before).
type AverageDetail = { characters: number; median: number; total: number; compared?: number; change?: number };
type Level = [number, number, (AverageDetail | null)?];
type Flow = [number, string, number, number];
type Latest = { t: number; value: number; detail: Record<string, unknown> | null } | null;
type History = { resource: string; levels: Level[]; flows: Flow[]; latest: Latest };

// reasonLabels names each reason in the table when one series claims several.
// A retired series holds history only, and is in the legend only while the
// range shown has some of it.
type Series = { key: string; label: string; color: string; reasons: string[]; reasonLabels?: Record<string, string>; retired?: boolean };

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
  // Names in the table for reasons no series claims, which chart as Other.
  otherLabels?: Record<string, string>;
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
    // The figures are the Food & Labour model's starting values
    // (pw_inc_foodmodel in the module): its workplaces, output per worker,
    // and ration baselines, and pw_inc_foodstore's diet, caps, and rot.
    description: "The town's stores, not counting the factions' larders. The Dredgers' boats and the Millers' fields bring food in every hour, at the pace the Labourers can work: at full strength about 3,040 a day of fish, more or less with the day's sea (75–135% most days, next to nothing in a storm one day in twenty), and 660 from the farms, 88% of it wheat and the rest meat, of which the Blight takes up to half when Blight control is short-handed. Each faction sends the town the share its office holder sets and keeps the rest in its own larder, which it can release to the town later. Foodstock handed in adds to the stores too. The 407 villagers eat in seven ration groups, at the rations set in the Town Food Ledger: 5,120 a day at the baselines, of which the Labourers eat 1,296, the other workers (Tradespeople and Skilled Workers) 1,494, and the dependants (Free Labour, Mothers, Elders, and Children) 2,330. Snacks, meals, thrown food, and rot take from the stores as well. Everyone eats a mix, by diet: fish 57%, berries 15%, mushrooms 12%, wheat 10%, and meat 6%, and more of the rest when one runs short. Each kind has room for so much (wheat 50,000, fish 20,000, meat 4,000, and berries and mushrooms 3,000 each), and what is left rots at its own rate: half the berries in two days, fish and mushrooms in three, meat in four, and wheat barely at all.",
    // Grouped as the Town Food Ledger's chart groups them in game
    // (GetFoodChartCategory in pw_inc_foodui), with the ration groups in its
    // three bands. Retired series hold history from before the model.
    gains: [
      { key: "farming", label: "Farming (the Millers' share)", color: "var(--eco-brown)", reasons: ["farming", "livestock"], reasonLabels: { farming: "Farming: wheat", livestock: "Farming: livestock" } },
      { key: "fishing", label: "Fishing (the Dredgers' share)", color: "var(--eco-violet)", reasons: ["fishing"] },
      { key: "release", label: "Released from the larders", color: "var(--eco-olive)", reasons: ["release_dredgers", "release_millers"], reasonLabels: { release_dredgers: "Released: the Dredgers' larder", release_millers: "Released: the Millers' larder" } },
      { key: "handin", label: "Foodstock handed in", color: "var(--eco-green)", reasons: ["handin"] },
      { key: "greysoup", label: "Grey Soup (retired)", color: "var(--eco-gold)", reasons: ["greysoup"], retired: true },
    ],
    losses: [
      { key: "labourers", label: "Rations: Labourers", color: "var(--eco-vermilion)", reasons: ["ration_labourers"] },
      { key: "workers", label: "Rations: other workers", color: "var(--eco-blue)", reasons: ["ration_tradespeople", "ration_skilled"], reasonLabels: { ration_tradespeople: "Rations: Tradespeople", ration_skilled: "Rations: Skilled Workers" } },
      { key: "dependants", label: "Rations: dependants", color: "var(--eco-magenta)", reasons: ["ration_free", "ration_mothers", "ration_elders", "ration_children"], reasonLabels: { ration_free: "Rations: Free Labour", ration_mothers: "Rations: Mothers", ration_elders: "Rations: Elders", ration_children: "Rations: Children" } },
      { key: "villagers", label: "Eaten by villagers (before the ration groups)", color: "var(--eco-aqua)", reasons: ["villagers", "villagers_soup"], reasonLabels: { villagers: "Eaten by villagers", villagers_soup: "Grey Soup eaten by villagers" }, retired: true },
      { key: "meals", label: "Meals and snacks", color: "var(--eco-yellow)", reasons: ["meal", "snack", "thrown", "purchase"], reasonLabels: { meal: "Meals bought (3 each)", snack: "Snacks bought", thrown: "Thrown from the food baskets", purchase: "Bought before Sep 23 (snack or meal)" } },
      { key: "decay", label: "Passive decay (200 a day, before the baselines)", color: "var(--eco-lavender)", reasons: ["decay"], retired: true },
      { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ["rot_greysoup", "rot_berries", "rot_fish", "rot_mushrooms", "rot_meat", "rot_wheat"], reasonLabels: { rot_greysoup: "Rotted: Grey Soup", rot_berries: "Rotted: berries", rot_fish: "Rotted: fish", rot_mushrooms: "Rotted: mushrooms", rot_meat: "Rotted: meat", rot_wheat: "Rotted: wheat" } },
    ],
    otherLabels: { dm: "DM changes" },
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

function LevelChart({ levels, refs, title, second, format = fmt }: { levels: Level[]; refs?: [number, string][]; title: string; second?: SecondLine; format?: (n: number) => string }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (levels.length === 0) return <p className="economy__empty">No samples yet.</p>;

  const narrow = W < 560;
  const H = narrow ? 240 : 300;
  const m = { l: 64, r: 16, t: 16, b: 28 };
  const t0 = levels[0][0], t1 = Math.max(levels[levels.length - 1][0], t0 + 3600);
  const highest = Math.max(...levels.map((l) => Math.max(l[1], second ? second.of(l) : 0)));
  // Zero is the floor unless a value falls below it (the gold gained per
  // character can be a loss). Then the ticks keep one step either side of
  // zero, so a small dip gets one tick below the line, not a crowd of them.
  const lowest = Math.min(0, ...levels.map((l) => Math.min(l[1], second ? second.of(l) : 0)));
  const tickStep = lowest < 0 ? niceMax(Math.max(highest, -lowest) * 1.05) / 4 : 0;
  const vMax = lowest < 0 ? Math.max(tickStep, Math.ceil((highest * 1.05) / tickStep) * tickStep) : niceMax(highest * 1.05);
  const vMin = lowest < 0 ? -Math.ceil((-lowest * 1.05) / tickStep) * tickStep : 0;
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v: number) => m.t + ((vMax - v) / (vMax - vMin)) * (H - m.t - m.b);

  const steps = (of: (l: Level) => number) => {
    let p = `M${x(levels[0][0]).toFixed(1)},${y(of(levels[0])).toFixed(1)}`;
    for (let i = 1; i < levels.length; i++) p += `H${x(levels[i][0]).toFixed(1)}V${y(of(levels[i])).toFixed(1)}`;
    return p;
  };
  const d = steps((l) => l[1]);
  const last = levels[levels.length - 1];

  const ticks = vMin < 0
    ? Array.from({ length: Math.round((vMax - vMin) / tickStep) + 1 }, (_, i) => vMin + i * tickStep)
    : [0, 0.25, 0.5, 0.75, 1].map((f) => f * vMax);
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
        aria-label={`${title} over time, from ${format(levels[0][1])} on ${dayLabel(t0)} to ${format(last[1])} on ${dayLabel(last[0])}. Use the left and right arrow keys to step through time.`}
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
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{format(v)}</text>
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
            <line x1={x(hv[0])} x2={x(hv[0])} y1={m.t} y2={y(vMin)} className="economy__hair" />
            <circle cx={x(hv[0])} cy={y(hv[1])} r={4.5} className="economy__dot" />
            {second && <circle cx={x(hv[0])} cy={y(second.of(hv))} r={4.5} className="economy__dot economy__dot--second" />}
          </>
        )}
      </svg>
      {hv && !second && (
        <div className="economy__tip" style={{ left: Math.min((x(hv[0]) / W) * 100, 70) + "%", top: 8 }}>
          <strong>{format(hv[1])}</strong>
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
  // A small scale (the deaths from hunger) is kept even, so the tick halfway
  // up is a whole number rather than a half rounded to the wrong label.
  const even = (v: number) => (v < 10 ? Math.max(2, Math.ceil(v / 2) * 2) : v);
  const vTop = even(niceMax(Math.max(...days.map(up), 1)));
  const vBot = twoSided ? even(niceMax(Math.max(...days.map(down), 1))) : 0;

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

// `stats` adds tiles to the row of figures, and `children` cards under it.
function ResourceSection({ config, history, stats, children }: { config: ResourceConfig; history: History; stats?: ReactNode; children?: ReactNode }) {
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
    return s?.reasonLabels?.[reason] ?? s?.label ?? config.otherLabels?.[reason] ?? reason.replace(/_/g, " ");
  };
  const charted = new Set(days.flatMap((d) => Object.keys(d.bySeries)));
  const legend = [...config.gains, ...config.losses].filter((s) => !s.retired || charted.has(s.key));
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
        {stats}
      </div>

      {children}

      <div className="economy__card">
        <h4>Over Time</h4>
        <LevelChart levels={levels} refs={config.refs} title={config.title} />
      </div>

      <div className="economy__card">
        <h4>Added and Removed per Day</h4>
        <div className="economy__legend" aria-hidden="true">
          {legend.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
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

// What a character active throughout gained between each scan and the one
// before: [unix seconds, gold, seconds since the scan before]. Each sample's
// detail carries the change in gold of the characters active in both scans
// (wkserver's compareActiveGold), so characters starting or stopping play
// never move it. The first sample after wkserver restarts has nothing to
// compare with and is left out, so its interval counts as unknown rather than
// as no change.
type Step = [number, number, number];

function perCharacterSteps(levels: Level[]): Step[] {
  const steps: Step[] = [];
  for (let i = 1; i < levels.length; i++) {
    const d = levels[i][2];
    if (!d?.compared || d.change === undefined) continue;
    steps.push([levels[i][0], d.change / d.compared, levels[i][0] - levels[i - 1][0]]);
  }
  return steps;
}

// The steps in (from, to] as gold a week, or null when they cover less than
// most of that span.
function perCharacterPerWeek(steps: Step[], from: number, to: number): number | null {
  const inside = steps.filter((s) => s[0] > from && s[0] <= to);
  const covered = inside.reduce((s, x) => s + x[2], 0);
  if (covered < (to - from) * 0.8) return null;
  return (inside.reduce((s, x) => s + x[1], 0) / covered) * 7 * 86400;
}

// The gold an active character holds. The history comes with at least a
// month behind it whatever the range, for the 30-day figures, and the charts
// are cut to the range.
function AverageGoldSection({ history, rangeDays }: { history: History; rangeDays: number }) {
  const { latest } = history;
  const now = latest?.t ?? 0;
  const levels = useMemo(
    () => rangeDays ? history.levels.filter((l) => l[0] >= now - rangeDays * 86400) : history.levels,
    [history, rangeDays, now]
  );
  const steps = useMemo(() => perCharacterSteps(history.levels), [history]);
  // The steps added up from the start of the range.
  const gained = useMemo((): Level[] => {
    if (levels.length === 0) return [];
    const start = levels[0][0];
    let total = 0;
    return [[start, 0], ...steps.filter((s) => s[0] > start).map((s): Level => [s[0], (total += s[1])])];
  }, [levels, steps]);
  const detail = latest?.detail;
  const trends = ([[7, "Last 7 Days"], [30, "Last 30 Days"]] as const).map(([d, label]) => ({
    d, label,
    perWeek: trendPerWeek(history.levels, now - d * 86400, now),
    perCharacter: perCharacterPerWeek(steps, now - d * 86400, now),
  }));

  return (
    <section className="economy__section" aria-labelledby="eco-gold_average">
      <h3 id="eco-gold_average">Gold per Active Character</h3>
      <p className="economy__sub">
        The gold an active character carries: one played in the last {ACTIVE_DAYS} days (the server saves a character only while it is logged in), and above level {MIN_LEVEL - 1}, the level every new character starts at. A few rich characters pull the average up, so the median, the character in the middle, is the more typical figure. The average moves when characters start or stop playing as well as when gold is earned and spent: newcomers with less than the average pull it down even while everyone else gets richer. The per-character figures leave that out. Each scan compares only the characters active in it and the one before, so they are what a character playing throughout gained.
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
        {trends.map(({ d, label, perWeek, perCharacter }) => (
          <div className="economy__stat" key={d}>
            <span className="economy__stat-label">Per Character, {label}</span>
            <span className={`economy__stat-value${perCharacter === null ? "" : perCharacter >= 0 ? " economy__pos" : " economy__neg"}`}>
              {perCharacter === null ? "–" : signed(perCharacter)}
            </span>
            <span className="economy__stat-note">
              {perCharacter === null ? `Needs ${d} days of samples` : "A week, playing throughout"}
              {perWeek !== null && ` · the average's trend ${signed(perWeek)}`}
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

      <div className="economy__card">
        <h4>Gold Gained per Character</h4>
        <p className="demo-note">What a character playing throughout gained, added up from the start of the range.</p>
        {gained.length > 1
          ? <LevelChart levels={gained} title="Gold gained per character" format={signed} />
          : <p className="economy__empty">No comparisons yet: each needs two scans in a row.</p>}
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

// Foodstock handed in, from wkserver's /economy/food/contributors: one row per
// hand-in, [unix seconds, character, amount, kinds], oldest first, where
// `character` indexes `characters`. `total` and `first` count every hand-in
// recorded, whatever the range.
type Contribution = [number, number, number, Record<string, number>];
type Contributions = {
  contributions: Contribution[];
  characters: { pcid: string; name: string }[];
  total: number;
  first: number | null;
};

// The kinds of Foodstock, keyed as the game's stores are (GetFoodTypeName in
// pw_inc_foodstore), in the order the bars stack them. Every Foodstock item
// is one of the first four; the stores take anything else carrying the tag as
// wheat, which keeps.
const FOOD_KINDS: { key: string; label: string }[] = [
  { key: "fish", label: "Fish" },
  { key: "berries", label: "Berries" },
  { key: "mushrooms", label: "Mushrooms" },
  { key: "meat", label: "Meat" },
  { key: "wheat", label: "Other provisions" },
];

// How many of the leaderboard get a bar; the table under it has everyone.
const LEADERBOARD_BARS = 20;

const kindsText = (kinds: Record<string, number>) =>
  FOOD_KINDS.filter((k) => kinds[k.key]).map((k) => `${fmt(kinds[k.key])} ${k.label.toLowerCase()}`).join(", ");

// Who hands Foodstock in to the town's stores, ranked by how much over the
// range shown, and the latest hand-ins.
function ContributorsSection({ data }: { data: Contributions }) {
  const { contributions, characters, total, first } = data;

  const ranked = useMemo(() => {
    const by = characters.map((c) => ({ ...c, amount: 0, handins: 0, first: 0, last: 0, kinds: {} as Record<string, number> }));
    for (const [t, i, amount, kinds] of contributions) {
      const c = by[i];
      c.amount += amount;
      c.handins += 1;
      if (!c.first) c.first = t;
      c.last = t;
      for (const [k, n] of Object.entries(kinds)) c.kinds[k] = (c.kinds[k] ?? 0) + n;
    }
    // Level pegging goes to whoever got there first.
    return by.sort((a, b) => b.amount - a.amount || a.first - b.first);
  }, [contributions, characters]);

  const handedIn = ranked.reduce((s, c) => s + c.amount, 0);
  const top = ranked[0];
  const latest = contributions[contributions.length - 1];
  const recent = contributions.slice(-50).reverse();

  return (
    <section className="economy__section" aria-labelledby="eco-food_contributors">
      <h3 id="eco-food_contributors">Foodstock Contributors</h3>
      <p className="economy__sub">
        Who hands Foodstock in to the town's stores, ranked by how much they brought over the range shown. Each hand-in takes every Foodstock item the character carries. DMs' hand-ins are left out.
        {first !== null && ` Recorded since ${timeLabel(first)}, ${fmt(total)} hand-ins in all; the hand-ins in the Food Stores chart above go back further, but say nothing of who made them.`}
      </p>

      {contributions.length === 0 ? (
        <p className="economy__empty">
          {first === null ? "No hand-ins recorded yet." : "No hand-ins in this range."}
        </p>
      ) : (
        <>
          <div className="economy__stats">
            <div className="economy__stat">
              <span className="economy__stat-label">Handed In</span>
              <span className="economy__stat-value economy__stat-value--hero">{fmt(handedIn)}</span>
              <span className="economy__stat-note">{fmt(contributions.length)} hand-ins, over the range shown</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Contributors</span>
              <span className="economy__stat-value">{fmt(ranked.length)}</span>
              <span className="economy__stat-note">Characters who handed any in</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Top Contributor</span>
              <span className="economy__stat-value">{share(top.amount, handedIn)}</span>
              <span className="economy__stat-note">{top.name}, {fmt(top.amount)} of it</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Latest Hand-in</span>
              <span className="economy__stat-value">{fmt(latest[2])}</span>
              <span className="economy__stat-note">{characters[latest[1]].name}, {timeLabel(latest[0])}</span>
            </div>
          </div>

          <div className="economy__card">
            <h4>Leaderboard</h4>
            <div className="economy__legend" aria-hidden="true">
              {FOOD_KINDS.map((k) => <span key={k.key}><i className={`eco-kind--${k.key}`} />{k.label}</span>)}
            </div>
            <div className="demo-bars">
              {ranked.slice(0, LEADERBOARD_BARS).map((c, i) => (
                <BarRow key={c.pcid} label={`${i + 1}. ${c.name}`} value={fmt(c.amount)} max={top.amount}
                  segments={FOOD_KINDS.map((k) => ({ n: c.kinds[k.key] ?? 0, className: `eco-kind--${k.key}` }))}
                  tip={<>
                    <strong>{c.name}</strong>
                    <span>{share(c.amount, handedIn)} of the Foodstock handed in · {fmt(c.handins)} hand-ins, {fmt(c.amount / c.handins)} each on average</span>
                    <span>{c.handins > 1 ? `First ${timeLabel(c.first)}, latest ${timeLabel(c.last)}` : timeLabel(c.last)}</span>
                    {FOOD_KINDS.filter((k) => c.kinds[k.key]).map((k) => (
                      <span key={k.key} className="economy__tip-row"><i className={`eco-kind--${k.key}`} />{k.label}<b>{fmt(c.kinds[k.key])}</b></span>
                    ))}
                  </>} />
              ))}
            </div>
            <details className="economy__details">
              <summary>Show as a table{ranked.length > LEADERBOARD_BARS && `, all ${fmt(ranked.length)} contributors`}</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Character</th><th>Handed In</th><th>Share</th><th>Hand-ins</th>
                      {FOOD_KINDS.map((k) => <th key={k.key}>{k.label}</th>)}
                      <th>Latest (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((c, i) => (
                      <tr key={c.pcid}>
                        <td>{i + 1}. {c.name}</td>
                        <td>{fmt(c.amount)}</td>
                        <td>{share(c.amount, handedIn)}</td>
                        <td>{fmt(c.handins)}</td>
                        {FOOD_KINDS.map((k) => <td key={k.key}>{c.kinds[k.key] ? fmt(c.kinds[k.key]) : "–"}</td>)}
                        <td>{timeLabel(c.last).replace(" UTC", "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div className="economy__card">
            <h4>Latest Hand-ins</h4>
            <details className="economy__details">
              <summary>Show the latest {fmt(recent.length)}</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr><th>When (UTC)</th><th className="economy__cell-left">Character</th><th>Handed In</th><th className="economy__cell-left">What</th></tr>
                  </thead>
                  <tbody>
                    {recent.map(([t, i, amount, kinds], n) => (
                      <tr key={n}>
                        <td>{timeLabel(t).replace(" UTC", "")}</td>
                        <td className="economy__cell-left">{characters[i].name}</td>
                        <td>{fmt(amount)}</td>
                        <td className="economy__cell-left">{kindsText(kinds)}</td>
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

// --- The Food & Labour model ------------------------------------------------
//
// The figures below are the module's (pw_inc_foodstore and pw_inc_foodmodel):
// keep them in step with it.

// The kinds of food as the stores keep them, with the town's room for each
// (GetFoodTypeStoreCap) and the real days it takes half of it to rot
// (GetFoodTypeHalfLifeDays). A larder has room for a fifth of the town's.
const STOCK_KINDS: { key: string; label: string; cap: number; halfLife: number }[] = [
  { key: "fish", label: "Fish", cap: 20000, halfLife: 3 },
  { key: "wheat", label: "Wheat", cap: 50000, halfLife: 180 },
  { key: "meat", label: "Meat", cap: 4000, halfLife: 4 },
  { key: "berries", label: "Berries", cap: 3000, halfLife: 2 },
  { key: "mushrooms", label: "Mushrooms", cap: 3000, halfLife: 3 },
];
const LARDER_CAP_DIVISOR = 5;

// How full each kind is, against its room, from a level's detail.stock.
function StockCard({ stock, divisor = 1, title }: { stock: Record<string, number>; divisor?: number; title: string }) {
  const total = Object.values(stock).reduce((s, n) => s + n, 0);
  return (
    <div className="economy__card">
      <h4>{title}</h4>
      <div className="demo-bars">
        {STOCK_KINDS.map((k) => {
          const n = stock[k.key] ?? 0, cap = k.cap / divisor;
          return (
            <BarRow key={k.key} label={k.label} value={`${fmt(n)} / ${fmt(cap)}`} max={cap}
              segments={[{ n, className: `eco-kind--${k.key}` }]}
              tip={<>
                <strong>{k.label}</strong>
                <span>{fmt(n)} of the room for {fmt(cap)}, {share(n, cap)} full · {share(n, total)} of the food in store</span>
                <span>{k.halfLife >= 100 ? "Barely rots" : `Half of it rots in ${k.halfLife} days`}</span>
              </>} />
          );
        })}
      </div>
    </div>
  );
}

// Each figure's daily average over the last 7 days, or as many as there are.
function perDayOverWeek(flows: Flow[], now: number) {
  const week = flows.filter((f) => f[0] >= now - 7 * 86400);
  const days = Math.max(1, Math.min(7, (now - (week[0]?.[0] ?? now)) / 86400));
  return { week, days, perDay: (of: (f: Flow) => number) => week.reduce((s, f) => s + of(f), 0) / days };
}

// Food the farms and the boats brought in with no room for it, in the town's
// stores or the producing faction's larder (food_lost: flows alone, negative,
// by what produced it).
function FoodLostStat({ history, now }: { history: History; now: number }) {
  const { week, days, perDay } = perDayOverWeek(history.flows, now);
  const by = (reason: string) => -week.filter((f) => f[1] === reason).reduce((s, f) => s + f[2], 0) / days;
  return (
    <div className="economy__stat">
      <span className="economy__stat-label">Lost to Full Stores</span>
      <span className="economy__stat-value">{week.length ? fmt(-perDay((f) => f[2])) : "0"}</span>
      <span className="economy__stat-note">
        {week.length
          ? `A day, with no room in store or larder: fish ${fmt(by("fishing"))}, wheat ${fmt(by("farming"))}, meat ${fmt(by("livestock"))}`
          : "None in the last 7 days"}
      </span>
    </div>
  );
}

const FACTION_LARDERS: { faction: string; config: ResourceConfig }[] = [
  ["dredgers", "The Dredgers' Larder", "the fish the Dredgers land", "the holder of a Dredger Trustee's Badge"],
  ["millers", "The Millers' Larder", "the wheat and meat the Millers' farms bring in", "the holder of a Miller Logistics Badge"],
].map(([faction, title, produce, office]) => ({
  faction,
  config: {
    resource: `food_${faction}`,
    title,
    description: `What the faction keeps back of ${produce}: everything its share does not send to the town's stores, a share set by ${office}. It has room for a fifth of what the town can keep of each kind, and rots as the town's stores do, until it is released to the town.`,
    gains: [{ key: "kept", label: "Kept back", color: "var(--eco-green)", reasons: ["kept"] }],
    losses: [
      { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ["rot_berries", "rot_fish", "rot_mushrooms", "rot_meat", "rot_wheat"], reasonLabels: { rot_berries: "Rotted: berries", rot_fish: "Rotted: fish", rot_mushrooms: "Rotted: mushrooms", rot_meat: "Rotted: meat", rot_wheat: "Rotted: wheat" } },
      { key: "released", label: "Released to the town", color: "var(--eco-olive)", reasons: ["released"] },
    ],
    otherLabels: { dm: "DM changes" },
  },
}));

// The ration groups in the game's order, with the Foodstock a day that keeps
// one of each comfortable at full output (GetFoodGroupBaseline).
const RATION_GROUPS: { key: string; label: string; baseline: number }[] = [
  { key: "labourers", label: "Labourers", baseline: 18 },
  { key: "tradespeople", label: "Tradespeople", baseline: 14 },
  { key: "skilled", label: "Skilled Workers", baseline: 11 },
  { key: "free", label: "Free Labour", baseline: 11 },
  { key: "mothers", label: "Mothers", baseline: 14 },
  { key: "elders", label: "Elders", baseline: 11 },
  { key: "children", label: "Children", baseline: 9 },
];

const WORKPLACES: [string, string, string][] = [
  ["fishing", "Fishing", "Labourers"], ["farmland", "Farmland", "Labourers"], ["blight", "Blight Control", "Labourers"],
  ["building", "Building", "Labourers"], ["forestry", "Forestry", "Labourers"], ["reeves", "Reeves", "Tradespeople"],
  ["millers", "Millers", "Tradespeople"], ["crafts", "Crafts & Trades", "Tradespeople"],
  ["fishproc", "Fish Processing", "Tradespeople"], ["skilled", "Skilled Roles", "Skilled Workers"],
];

// Weight lost as the game names it (GetFoodReserveState).
const reserves = (loss: number) =>
  loss >= 0.25 ? "Exhausted" : loss >= 0.15 ? "Underweight" : loss >= 0.05 ? "Thin" : "Healthy";

type RationGroup = { people: number; ration: number; fed: number; loss: number; morale: number; output: number };
type VillagersDetail = { groups: Record<string, RationGroup>; work: Record<string, [number, number]>; shares: Record<string, number> };

// Deaths from hunger (the villagers' flows, negative), charted upwards in the
// same three bands as the rations, and the infants lost to under-fed Mothers.
const DEATHS: ResourceConfig = {
  resource: "villagers",
  title: "Deaths from Hunger",
  description: "",
  gains: [
    { key: "labourers", label: "Labourers", color: "var(--eco-vermilion)", reasons: ["died_labourers"] },
    { key: "workers", label: "Other workers", color: "var(--eco-blue)", reasons: ["died_tradespeople", "died_skilled"], reasonLabels: { died_tradespeople: "Tradespeople", died_skilled: "Skilled Workers" } },
    { key: "dependants", label: "Dependants", color: "var(--eco-magenta)", reasons: ["died_free", "died_mothers", "died_elders", "died_children"], reasonLabels: { died_free: "Free Labour", died_mothers: "Mothers", died_elders: "Elders", died_children: "Children" } },
    { key: "infants", label: "Infants", color: "var(--eco-yellow)", reasons: ["died_infants"] },
  ],
  losses: [],
  totalLabel: "Died",
  flowsLabel: "Deaths from hunger per day",
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

function VillagersSection({ history }: { history: History }) {
  const { levels, latest } = history;
  const detail = latest?.detail as VillagersDetail | null | undefined;
  const deaths = useMemo(() => history.flows.map(([t, r, a, e]): Flow => [t, r, -a, e]), [history]);
  const days = useMemo(() => foldFlows(deaths, DEATHS), [deaths]);
  const died = deaths.reduce((s, f) => s + f[2], 0);
  const infants = deaths.filter((f) => f[1] === "died_infants").reduce((s, f) => s + f[2], 0);
  const groups = RATION_GROUPS.map((g) => ({ ...g, ...(detail?.groups[g.key] ?? { people: 0, ration: 0, fed: 1, loss: 0, morale: 100, output: 1 }) }));
  const people = groups.reduce((s, g) => s + g.people, 0);
  const morale = people ? groups.reduce((s, g) => s + g.morale * g.people, 0) / people : 0;
  const lowest = groups.filter((g) => g.people > 0).sort((a, b) => a.morale - b.morale)[0];
  const labourers = groups[0];
  const start = levels[0];
  const labelOf = (reason: string) => {
    const s = DEATHS.gains.find((s) => s.reasons.includes(reason));
    return s?.reasonLabels?.[reason] ?? s?.label ?? reason.replace(/_/g, " ");
  };

  return (
    <section className="economy__section" aria-labelledby="eco-villagers">
      <h3 id="eco-villagers">Villagers</h3>
      <p className="economy__sub">
        The town's people as the food model last saved them: how well each ration group is fed, and what hunger has cost. A group given less than its baseline works more slowly at once, then loses weight, and once Underweight or Exhausted it starts to die, the Elders and Children first; under-fed Mothers lose infants. Need falls as people lose weight, so a moderate shortfall settles thin but stable. The Labourers' output is the pace the boats and farms work at, so starving them starves everyone.
      </p>

      <div className="economy__stats">
        <div className="economy__stat">
          <span className="economy__stat-label">Population</span>
          <span className="economy__stat-value economy__stat-value--hero">{latest ? fmt(latest.value) : "–"}</span>
          <span className="economy__stat-note">
            {start && latest && start[1] !== latest.value ? `From ${fmt(start[1])} on ${dayLabel(start[0])}` : latest ? timeLabel(latest.t) : "Not sampled yet"}
          </span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Died of Hunger</span>
          <span className={`economy__stat-value${died ? " economy__neg" : ""}`}>{fmt(died)}</span>
          <span className="economy__stat-note">{died ? `Over the range shown${infants ? `, ${fmt(infants)} of them infants` : ""}` : "None in the range shown"}</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Morale</span>
          <span className="economy__stat-value">{detail ? fmt(morale) : "–"}</span>
          <span className="economy__stat-note">{detail && lowest ? `Out of 100, by head · lowest ${lowest.label} at ${fmt(lowest.morale)}` : "Out of 100"}</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Labourers' Output</span>
          <span className={`economy__stat-value${detail && labourers.output < 1 ? " economy__neg" : ""}`}>{detail ? pct(labourers.output) : "–"}</span>
          <span className="economy__stat-note">The pace the boats and farms work at</span>
        </div>
      </div>

      {detail && (
        <div className="economy__card">
          <h4>Ration Groups</h4>
          <p className="demo-note">Rations are Foodstock a head a day, set in the Town Food Ledger. Fed is the last hour's food against the group's baseline.</p>
          <div className="economy__table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="economy__cell-left">Group</th><th>People</th><th>Ration</th><th>Baseline</th><th>Fed</th>
                  <th>Weight Lost</th><th className="economy__cell-left">Reserves</th><th>Morale</th><th>Output</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key}>
                    <td className="economy__cell-left">{g.label}</td>
                    <td>{fmt(g.people)}</td>
                    <td>{fmt(g.ration)}</td>
                    <td>{fmt(g.baseline)}</td>
                    <td className={g.fed < 0.995 ? "economy__neg" : undefined}>{pct(g.fed)}</td>
                    <td>{g.loss > 0 ? `${(g.loss * 100).toFixed(1)}%` : "–"}</td>
                    <td className={`economy__cell-left${g.loss >= 0.15 ? " economy__neg" : ""}`}>{reserves(g.loss)}</td>
                    <td>{fmt(g.morale)}</td>
                    <td>{pct(g.output)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="economy__details">
            <summary>Show the workplaces</summary>
            <div className="economy__table-wrap">
              <table>
                <thead>
                  <tr><th className="economy__cell-left">Workplace</th><th className="economy__cell-left">Group</th><th>Workers</th><th>Slots</th></tr>
                </thead>
                <tbody>
                  {WORKPLACES.map(([key, label, group]) => (
                    <tr key={key}>
                      <td className="economy__cell-left">{label}</td>
                      <td className="economy__cell-left">{group}</td>
                      <td>{fmt(detail.work[key]?.[0] ?? 0)}</td>
                      <td>{fmt(detail.work[key]?.[1] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      <div className="economy__card">
        <h4>Population Over Time</h4>
        <LevelChart levels={levels} title="The town's population" />
      </div>

      <div className="economy__card">
        <h4>Deaths from Hunger per Day</h4>
        {died === 0 ? <p className="economy__empty">No deaths from hunger in this range.</p> : (
          <>
            <div className="economy__legend" aria-hidden="true">
              {DEATHS.gains.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
            </div>
            <FlowChart days={days} config={DEATHS} />
            <details className="economy__details">
              <summary>Show as a table</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr><th>Day (UTC)</th>{[...new Set(deaths.map((f) => f[1]))].map((r) => <th key={r}>{labelOf(r)}</th>)}<th>Died</th></tr>
                  </thead>
                  <tbody>
                    {[...days].reverse().map((d) => (
                      <tr key={d.t}>
                        <td>{dayLabel(d.t)}</td>
                        {[...new Set(deaths.map((f) => f[1]))].map((r) => <td key={r}>{d.byReason[r] ? fmt(d.byReason[r].amount) : "–"}</td>)}
                        <td>{fmt(d.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
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
  const [contributors, setContributors] = useState<Contributions | null>(null);
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
    // A wkserver from before the average gold, the spending, and the
    // contributors answers 404 for them, and the page shows the rest.
    const get = <T,>(path: string, d: number, optional = false) =>
      fetch(`${import.meta.env.VITE_API_URL}/economy/${path}?days=${d}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((res) => {
        if (optional && res.status === 404) return null;
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<T>;
      });
    Promise.all([
      Promise.all([
        ...RESOURCES.map((c) => get<History>(c.resource, days)),
        get<History>("gold_average", days ? Math.max(days, 31) : 0, true),
        get<History>("gold_spent", days, true),
        ...["food_dredgers", "food_millers", "food_lost", "villagers"].map((r) => get<History>(r, days, true)),
      ]),
      get<Contributions>("food/contributors", days, true),
    ])
      .then(([results, contributed]) => {
        if (!current) return;
        setData(Object.fromEntries(results.filter((r): r is History => r !== null).map((r) => [r.resource, r])));
        setContributors(contributed);
        setFetchedAt(Date.now() / 1000);
        setLoading(false);
      })
      .catch((err) => { if (current) { setError(err.message); setLoading(false); } });
    return () => { current = false; };
  }, [days, authToken, reloads]);

  // The larders and the villagers are sampled once the game's food model has
  // saved itself; before that (or from an older wkserver) they are left out.
  const modelRunning = !!data.villagers?.latest;
  const stockOf = (h: History) => (h.latest?.detail?.stock ?? null) as Record<string, number> | null;

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
        c.resource === "food" ? (
          <Fragment key={c.resource}>
            <ResourceSection config={c} history={data.food}
              stats={modelRunning && data.food_lost && <FoodLostStat history={data.food_lost} now={fetchedAt} />}>
              {stockOf(data.food) && <StockCard stock={stockOf(data.food)!} title="In Store Now, by Kind" />}
            </ResourceSection>
            {contributors && <ContributorsSection data={contributors} />}
            {modelRunning && FACTION_LARDERS.map(({ faction, config }) => data[config.resource] && (
              <ResourceSection key={faction} config={config} history={data[config.resource]}
                stats={
                  <div className="economy__stat">
                    <span className="economy__stat-label">Sent to the Town</span>
                    <span className="economy__stat-value">{Number(data[config.resource].latest?.detail?.share ?? 100)}%</span>
                    <span className="economy__stat-note">Of what it produces; it keeps the rest</span>
                  </div>
                }>
                <StockCard stock={stockOf(data[config.resource]) ?? {}} divisor={LARDER_CAP_DIVISOR} title="In the Larder Now, by Kind" />
              </ResourceSection>
            ))}
            {modelRunning && <VillagersSection history={data.villagers} />}
          </Fragment>
        ) : <ResourceSection key={c.resource} config={c} history={data[c.resource]} />
      ))}
      {!loading && !error && data.gold_average && <AverageGoldSection history={data.gold_average} rangeDays={days} />}
      {!loading && !error && data.gold_spent && <SpendingSection history={data.gold_spent} now={fetchedAt} />}
    </div>
  );
}

export default EconomyPage;
