import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "./Icons";
import { niceMax, useWidth } from "./chart";
import "./EconomyPage.css";
import "./DemographicsPage.css";

// Who the characters are, from wkserver's /demographics: one snapshot of the
// servervault per day. A snapshot is bucketed by character level, so leaving
// out the low levels is done here by summing only the buckets wanted. Classes,
// skills, and archetypes arrive as 2da rows, named by the response's labels.
//
// Shares the Economy page's stat tiles, cards, and chart styles.

type Bucket = {
  characters: number;
  multiclassed: number;
  classes: Record<string, [number, number]>;
  primary: Record<string, number>;
  feats: Record<string, number>;
  skills: Record<string, number[]>;
};
type Snapshot = { date: string; t: number; levels: Record<string, Bucket>; account_levels: Record<string, number> };
type Counts = { date: string; characters: Record<string, number>; accounts: Record<string, number> };
type ArchetypeClass = { cls: number; selection: number; options: [number, string][] };
type Labels = { classes: Record<string, string>; skills: Record<string, string>; archetypes: ArchetypeClass[] };
type Demographics = { history: Counts[]; snapshot: Snapshot | null; labels: Labels };

// Characters below this level are the ones made and never played on: new
// characters start at level 3.
const MIN_LEVEL = 4;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
// A share as a whole percentage; one that rounds to nothing but is not
// nothing reads "<1%", so a lone straggler is not shown as 0%.
const pct = (n: number, of: number) =>
  !of ? "–" : n > 0 && n / of < 0.005 ? "<1%" : `${Math.round((n / of) * 100)}%`;
const dateLabel = (date: string) => { const [y, m, d] = date.split("-").map(Number); return `${MON[m - 1]} ${d}, ${y}`; };
const shortDate = (date: string) => { const [, m, d] = date.split("-").map(Number); return `${MON[m - 1]} ${d}`; };

// Sums the buckets at or above minLevel into one.
function merge(levels: Record<string, Bucket>, minLevel: number): Bucket {
  const out: Bucket = { characters: 0, multiclassed: 0, classes: {}, primary: {}, feats: {}, skills: {} };
  for (const [level, b] of Object.entries(levels)) {
    if (Number(level) < minLevel) continue;
    out.characters += b.characters;
    out.multiclassed += b.multiclassed ?? 0;
    for (const [c, [n, l]] of Object.entries(b.classes)) {
      const e = (out.classes[c] ??= [0, 0]);
      e[0] += n;
      e[1] += l;
    }
    for (const [c, n] of Object.entries(b.primary)) out.primary[c] = (out.primary[c] ?? 0) + n;
    for (const [f, n] of Object.entries(b.feats)) out.feats[f] = (out.feats[f] ?? 0) + n;
    for (const [s, hist] of Object.entries(b.skills)) {
      const h = (out.skills[s] ??= []);
      hist.forEach((n, r) => { h[r] = (h[r] ?? 0) + n; });
    }
  }
  return out;
}

const sumFrom = (byLevel: Record<string, number>, minLevel: number) =>
  Object.entries(byLevel).reduce((s, [l, n]) => s + (Number(l) >= minLevel ? n : 0), 0);

function medianLevel(levels: Record<string, Bucket>, minLevel: number): number | null {
  const rows = Object.entries(levels).map(([l, b]) => [Number(l), b.characters]).filter(([l]) => l >= minLevel).sort((a, b) => a[0] - b[0]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  let seen = 0;
  for (const [l, n] of rows) { seen += n; if (seen * 2 >= total) return l; }
  return null;
}

// A horizontal bar with its label and value beside it. Segments stack from
// the left with a 2px gap; hovering the row shows `tip`.
function BarRow({ label, value, segments, max, tip, muted }: {
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

function LevelColumns({ levels, minLevel }: { levels: Record<string, Bucket>; minLevel: number }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(10, ...Object.keys(levels).map(Number));
  const rows = Array.from({ length: top }, (_, i) => ({ level: i + 1, n: levels[i + 1]?.characters ?? 0 }));
  const total = rows.reduce((s, r) => s + r.n, 0);

  const H = 220;
  const m = { l: 48, r: 8, t: 12, b: 26 };
  const vMax = niceMax(Math.max(...rows.map((r) => r.n), 1) * 1.05);
  const band = (W - m.l - m.r) / rows.length;
  const bw = Math.min(56, band * 0.66);
  const y = (v: number) => m.t + (1 - v / vMax) * (H - m.t - m.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * vMax);
  const hr = hover === null ? null : rows[hover];

  return (
    <div className="economy__chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" onPointerLeave={() => setHover(null)}
        aria-label={`Characters by level: ${rows.map((r) => `level ${r.level}, ${r.n}`).join("; ")}.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "economy__axis" : "economy__grid"} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{fmt(v)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = m.l + band * (i + 0.5);
          const h = y(0) - y(r.n);
          const rad = Math.min(4, h, bw / 2);
          const xl = cx - bw / 2, xr = cx + bw / 2, t = y(r.n), b = y(0) - 1;
          return (
            <g key={r.level}>
              {h >= 0.5 && (
                <path className={r.level < minLevel ? "demo-col demo-col--excluded" : "demo-col"}
                  d={`M${xl},${b}V${t + rad}Q${xl},${t} ${xl + rad},${t}H${xr - rad}Q${xr},${t} ${xr},${t + rad}V${b}Z`} />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="economy__tick">{r.level}</text>
              <rect x={cx - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent"
                onPointerEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hr && (
        <div className="economy__tip" style={{ left: Math.min(((m.l + band * (hover! + 0.5)) / W) * 100, 72) + "%", top: 4 }}>
          <strong>{fmt(hr.n)}</strong>
          <span>Level {hr.level} · {pct(hr.n, total)} of all characters</span>
          {hr.level < minLevel && <span>Left out of the figures below</span>}
        </div>
      )}
    </div>
  );
}

// Characters and accounts per day. Needs two snapshots to draw a line.
function HistoryChart({ history, minLevel }: { history: Counts[]; minLevel: number }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const points = history.map((h) => ({ date: h.date, characters: sumFrom(h.characters, minLevel), accounts: sumFrom(h.accounts, minLevel) }));
  if (points.length < 2) {
    return (
      <p className="economy__empty">
        {points.length ? `The first snapshot was taken on ${dateLabel(points[0].date)}. ` : ""}
        A snapshot is taken once a day, so this fills in from tomorrow.
      </p>
    );
  }

  const H = 240;
  const m = { l: 56, r: 16, t: 16, b: 28 };
  const vMax = niceMax(Math.max(...points.map((p) => p.characters)) * 1.05);
  const x = (i: number) => m.l + (i / (points.length - 1)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - v / vMax) * (H - m.t - m.b);
  const line = (key: "characters" | "accounts") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor((W - m.l - m.r) / 64)));
  const hp = hover === null ? null : points[hover];

  return (
    <div className="economy__chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img"
        aria-label={`Characters and accounts per day, ${dateLabel(points[0].date)} to ${dateLabel(points[points.length - 1].date)}.`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) * W) / r.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (points.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => f * vMax).map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "economy__axis" : "economy__grid"} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{fmt(v)}</text>
          </g>
        ))}
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" className="economy__tick">{shortDate(p.date)}</text>
        ))}
        <path d={line("characters")} className="demo-line demo-line--characters" />
        <path d={line("accounts")} className="demo-line demo-line--accounts" />
        {hp && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={m.t} y2={y(0)} className="economy__hair" />
            <circle cx={x(hover!)} cy={y(hp.characters)} r={4.5} className="demo-dot demo-dot--characters" />
            <circle cx={x(hover!)} cy={y(hp.accounts)} r={4.5} className="demo-dot demo-dot--accounts" />
          </>
        )}
      </svg>
      {hp && (
        <div className="economy__tip" style={{ left: Math.min((x(hover!) / W) * 100, 70) + "%", top: 8 }}>
          <strong>{dateLabel(hp.date)}</strong>
          <span className="economy__tip-row"><i className="demo-key--characters" />Characters<b>{fmt(hp.characters)}</b></span>
          <span className="economy__tip-row"><i className="demo-key--accounts" />Accounts<b>{fmt(hp.accounts)}</b></span>
        </div>
      )}
    </div>
  );
}

function ClassesCard({ bucket, labels }: { bucket: Bucket; labels: Labels }) {
  const rows = Object.entries(bucket.classes)
    .map(([c, [n, levels]]) => ({ c, name: labels.classes[c] ?? `Class ${c}`, n, levels, main: bucket.primary[c] ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const max = Math.max(...rows.map((r) => r.n), 1);

  return (
    <div className="economy__card">
      <h4>Classes</h4>
      <p className="demo-note">Every class a character has levels in. A multiclassed character counts once in each.</p>
      <div className="economy__legend" aria-hidden="true">
        <span><i className="demo-key--main" />Main class</span>
        <span><i className="demo-key--multi" />Multiclassed into</span>
      </div>
      <div className="demo-bars">
        {rows.map((r) => (
          <BarRow key={r.c} label={r.name} value={fmt(r.n)} max={max}
            segments={[{ n: r.main, className: "demo-seg--main" }, { n: r.n - r.main, className: "demo-seg--multi" }]}
            tip={<>
              <strong>{r.name}</strong>
              <span>{pct(r.n, bucket.characters)} of characters have levels in it</span>
              <span className="economy__tip-row"><i className="demo-key--main" />Main class<b>{fmt(r.main)}</b></span>
              <span className="economy__tip-row"><i className="demo-key--multi" />Multiclassed into<b>{fmt(r.n - r.main)}</b></span>
              <span className="economy__tip-row">Levels held in it<b>{fmt(r.levels)}</b></span>
            </>} />
        ))}
      </div>
      <details className="economy__details">
        <summary>Show as a table</summary>
        <div className="economy__table-wrap">
          <table>
            <thead><tr><th>Class</th><th>Characters</th><th>Main Class</th><th>Multiclassed Into</th><th>Levels</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c}><td>{r.name}</td><td>{fmt(r.n)}</td><td>{fmt(r.main)}</td><td>{fmt(r.n - r.main)}</td><td>{fmt(r.levels)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function ArchetypesCard({ bucket, labels }: { bucket: Bucket; labels: Labels }) {
  const chosen = labels.archetypes.reduce((s, a) => s + a.options.reduce((t, [f]) => t + (bucket.feats[f] ?? 0), 0), 0);
  const classes = labels.archetypes
    .map((a) => {
      const options = a.options.map(([feat, name]) => ({ name, n: bucket.feats[feat] ?? 0 }));
      const pending = bucket.feats[a.selection] ?? 0;
      return { ...a, name: labels.classes[a.cls] ?? `Class ${a.cls}`, options, pending, total: options.reduce((s, o) => s + o.n, 0) + pending };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="economy__card">
      <h4>Archetypes</h4>
      <p className="demo-note">
        Chosen at level 4 in the class, so the bars are shares of the characters who have reached it.
        {" "}{fmt(chosen)} have been chosen in all.
      </p>
      <div className="demo-archetypes">
        {classes.map((c) => (
          <section key={c.cls} className="demo-archetype" aria-label={`${c.name} archetypes`}>
            <h5>{c.name} <span>{fmt(c.total)} characters</span></h5>
            {c.total === 0 ? <p className="economy__empty">None yet.</p> : (
              <div className="demo-bars demo-bars--compact">
                {[...c.options].sort((a, b) => b.n - a.n).map((o) => (
                  <BarRow key={o.name} label={o.name} value={pct(o.n, c.total)} max={c.total}
                    segments={[{ n: o.n, className: "demo-seg--main" }]}
                    tip={<><strong>{o.name}</strong><span>{fmt(o.n)} of {fmt(c.total)} {c.name.toLowerCase()}s</span></>} />
                ))}
                {c.pending > 0 && (
                  <BarRow label="Not chosen yet" value={pct(c.pending, c.total)} max={c.total} muted
                    segments={[{ n: c.pending, className: "demo-seg--pending" }]}
                    tip={<><strong>Not chosen yet</strong><span>{fmt(c.pending)} still hold the Archetype Selection feat</span></>} />
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

type SkillMetric = "trained" | "ranks";

function SkillsCard({ bucket, labels }: { bucket: Bucket; labels: Labels }) {
  const [metric, setMetric] = useState<SkillMetric>("trained");
  const rows = Object.entries(labels.skills).map(([id, name]) => {
    const hist = bucket.skills[id] ?? [];
    const trained = hist.reduce((s, n, r) => s + (r > 0 ? n : 0), 0);
    const ranks = hist.reduce((s, n, r) => s + n * r, 0);
    return { id, name, hist, trained, ranks };
  });
  const allRanks = rows.reduce((s, r) => s + r.ranks, 0);
  const value = (r: typeof rows[number]) => (metric === "trained" ? r.trained : r.ranks);
  rows.sort((a, b) => value(b) - value(a));
  const max = Math.max(...rows.map(value), 1);

  return (
    <div className="economy__card">
      <div className="demo-card-head">
        <h4>Skills</h4>
        <div className="bans-filter" role="group" aria-label="Skill measure">
          {([["trained", "Characters Trained"], ["ranks", "Share of Ranks"]] as const).map(([k, label]) => (
            <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)}
              className={`bans-filter__btn${metric === k ? " bans-filter__btn--active" : ""}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="demo-note">
        {metric === "trained"
          ? "Characters who have put at least one rank into the skill. Ability modifiers are not counted."
          : "Where the skill points went: each skill's ranks as a share of all ranks held."}
      </p>
      <div className="demo-bars">
        {rows.map((r) => (
          <BarRow key={r.id} label={r.name} max={max}
            value={metric === "trained" ? pct(r.trained, bucket.characters) : pct(r.ranks, allRanks)}
            segments={[{ n: value(r), className: "demo-seg--main" }]}
            tip={<>
              <strong>{r.name}</strong>
              <span className="economy__tip-row">Trained<b>{fmt(r.trained)} ({pct(r.trained, bucket.characters)})</b></span>
              <span className="economy__tip-row">Average ranks when trained<b>{r.trained ? (r.ranks / r.trained).toFixed(1) : "–"}</b></span>
              <span className="economy__tip-row">Share of all ranks<b>{pct(r.ranks, allRanks)}</b></span>
            </>} />
        ))}
      </div>
      <details className="economy__details">
        <summary>Show ranks as a table</summary>
        <div className="economy__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Skill</th><th>Trained</th><th>Average Ranks</th>
                {Array.from({ length: Math.max(...rows.map((r) => r.hist.length), 1) }, (_, i) => <th key={i}>{i === 0 ? "Untrained" : i}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...rows].sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{pct(r.trained, bucket.characters)}</td>
                  <td>{r.trained ? (r.ranks / r.trained).toFixed(1) : "–"}</td>
                  {Array.from({ length: Math.max(...rows.map((x) => x.hist.length), 1) }, (_, i) => <td key={i}>{r.hist[i] ? fmt(r.hist[i]) : "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

interface DemographicsPageProps {
  authToken: string;
}

function DemographicsPage({ authToken }: DemographicsPageProps) {
  const [date, setDate] = useState<string | null>(null);
  const [excludeNew, setExcludeNew] = useState(true);
  const [data, setData] = useState<Demographics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  // As on the Economy page, whatever asks for a fetch sets loading, so the
  // effect only sets state once the response is in.
  function reload(nextDate = date) {
    setLoading(true);
    setError(null);
    setDate(nextDate);
    setReloads((n) => n + 1);
  }

  useEffect(() => {
    let current = true;
    fetch(`${import.meta.env.VITE_API_URL}/demographics${date ? `?date=${date}` : ""}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<Demographics>;
      })
      .then((d) => { if (current) { setData(d); setLoading(false); } })
      .catch((err) => { if (current) { setError(err.message); setLoading(false); } });
    return () => { current = false; };
  }, [date, authToken, reloads]);

  const minLevel = excludeNew ? MIN_LEVEL : 1;
  const snapshot = data?.snapshot ?? null;
  const bucket = useMemo(() => (snapshot ? merge(snapshot.levels, minLevel) : null), [snapshot, minLevel]);
  const allCharacters = snapshot ? Object.values(snapshot.levels).reduce((s, b) => s + b.characters, 0) : 0;
  const accounts = snapshot ? sumFrom(snapshot.account_levels, minLevel) : 0;
  const median = snapshot ? medianLevel(snapshot.levels, minLevel) : null;
  const dates = data ? [...data.history].reverse().map((h) => h.date) : [];

  return (
    <div className="economy demographics">
      <h2 className="sr-only">Demographics</h2>
      <div className="list-toolbar">
        <div className="bans-filter" role="group" aria-label="Characters to count">
          <button aria-pressed={excludeNew} onClick={() => setExcludeNew(true)}
            className={`bans-filter__btn${excludeNew ? " bans-filter__btn--active" : ""}`}>Level {MIN_LEVEL}+</button>
          <button aria-pressed={!excludeNew} onClick={() => setExcludeNew(false)}
            className={`bans-filter__btn${!excludeNew ? " bans-filter__btn--active" : ""}`}>All Levels</button>
        </div>
        {dates.length > 0 && (
          <label className="demo-date">
            <span>Snapshot</span>
            <select value={date ?? dates[0]} onChange={(e) => reload(e.target.value === dates[0] ? null : e.target.value)}>
              {dates.map((d) => <option key={d} value={d}>{dateLabel(d)}</option>)}
            </select>
          </label>
        )}
        <button className="refresh-btn refresh-btn--refresh" aria-label="Refresh" onClick={() => reload()}>
          <IconRefresh /><span className="refresh-btn__label" aria-hidden="true"> Refresh</span>
        </button>
      </div>

      {loading && <p role="status">Loading...</p>}
      {error && <p role="alert" style={{ color: "#c0323a" }}>Error: {error}</p>}
      {!loading && !error && data && !snapshot && (
        <p className="economy__empty">No snapshot has been taken yet. The first is taken when wkserver starts with the servervault mounted.</p>
      )}

      {!loading && !error && data && snapshot && bucket && (
        <>
          <section className="economy__section" aria-labelledby="demo-overview">
            <h3 id="demo-overview">Characters</h3>
            <p className="economy__sub">
              Every character in the servervault on {dateLabel(snapshot.date)}.
              {excludeNew
                ? ` Characters below level ${MIN_LEVEL}, most of them made and never played, are left out.`
                : " Every level is counted, including characters made and never played."}
            </p>
            <div className="economy__stats">
              <div className="economy__stat">
                <span className="economy__stat-label">Characters</span>
                <span className="economy__stat-value economy__stat-value--hero">{fmt(bucket.characters)}</span>
                <span className="economy__stat-note">{excludeNew ? `Of ${fmt(allCharacters)} at any level` : "At every level"}</span>
              </div>
              <div className="economy__stat">
                <span className="economy__stat-label">Accounts</span>
                <span className="economy__stat-value">{fmt(accounts)}</span>
                <span className="economy__stat-note">{accounts ? `${(bucket.characters / accounts).toFixed(1)} characters each` : "–"}</span>
              </div>
              <div className="economy__stat">
                <span className="economy__stat-label">Median Level</span>
                <span className="economy__stat-value">{median ?? "–"}</span>
                <span className="economy__stat-note">Half are at or below it</span>
              </div>
              <div className="economy__stat">
                <span className="economy__stat-label">Multiclassed</span>
                <span className="economy__stat-value">{pct(bucket.multiclassed, bucket.characters)}</span>
                <span className="economy__stat-note">{fmt(bucket.multiclassed)} in two or more classes</span>
              </div>
            </div>

            <div className="economy__card">
              <h4>Levels</h4>
              {excludeNew && (
                <div className="economy__legend" aria-hidden="true">
                  <span><i className="demo-key--main" />Counted</span>
                  <span><i className="demo-key--excluded" />Left out, below level {MIN_LEVEL}</span>
                </div>
              )}
              <LevelColumns levels={snapshot.levels} minLevel={minLevel} />
            </div>
          </section>

          <section className="economy__section" aria-labelledby="demo-classes">
            <h3 id="demo-classes">Classes and Archetypes</h3>
            <ClassesCard bucket={bucket} labels={data.labels} />
            <ArchetypesCard bucket={bucket} labels={data.labels} />
          </section>

          <section className="economy__section" aria-labelledby="demo-skills">
            <h3 id="demo-skills">Skills</h3>
            <SkillsCard bucket={bucket} labels={data.labels} />
          </section>

          <section className="economy__section" aria-labelledby="demo-history">
            <h3 id="demo-history">Over Time</h3>
            <div className="economy__card">
              <h4>Characters and Accounts per Day</h4>
              {data.history.length > 1 && (
                <div className="economy__legend" aria-hidden="true">
                  <span><i className="demo-key--characters" />Characters</span>
                  <span><i className="demo-key--accounts" />Accounts</span>
                </div>
              )}
              <HistoryChart history={data.history} minLevel={minLevel} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default DemographicsPage;
