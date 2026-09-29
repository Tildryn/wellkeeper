import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "./Icons";
import { BarRow } from "./BarRow";
import "./EconomyPage.css";
import "./DemographicsPage.css";
import "./MetricsPage.css";

// How the Scars are played, from wkserver's /metrics/scars: every run the game
// recorded (pw_inc_scarmetr in the module), and a row per player who came out
// of one. The rows arrive nearly raw, and everything here is worked out from
// them, so the level and outcome filters need no second request.
//
// Rates are per player-minute: a player's figure over the minutes they spent
// on the run, which stop when the boss dies (or when they walked out, for a
// run they did not finish). Summing both sides before dividing, rather than
// averaging each player's own rate, keeps a player who left a minute in from
// swinging a whole Scar's figure.
//
// Shares the Demographics page's bar lists and the Economy page's tiles,
// cards, and tables.

type Run = {
  scar: string;
  threat: number;
  bonus_xp: number;
  party_size: number;
  started: number;
  completed: number | null;
  completion: number | null;
  respawns: number | null;
};
const STATS = [
  "dealt", "overkill", "taken", "heal", "overheal", "thp", "dr_absorb",
  "kills_minion", "kills_normal", "kills_elite", "kills_solo", "deaths", "short_rests",
  "xp", "xp_quest", "gold", "ichor", "scrap", "seed_minor", "seed_medium", "seed_major", "looted",
] as const;
type Stat = typeof STATS[number];
type Participant = Record<Stat, number> & {
  run: number;
  success: boolean;
  level: number;
  classes: [number, number, number][];
  active: number;
};
type ArchetypeClass = { cls: number; selection: number; options: [number, string][] };
type Metrics = {
  runs: Run[];
  participants: Participant[];
  scars: Record<string, string>;
  now: number;
  lifespan: number;
  labels: { classes: Record<string, string>; archetypes: ArchetypeClass[] };
  // Left out by wkserver: players who walked straight back out, and runs that
  // were nothing else.
  bounces?: { runs: number; players: number };
};

const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

const RANGES: [number, string][] = [[7, "7 Days"], [30, "30 Days"], [0, "All"]];

// A row resting on fewer player runs than this is greyed out: too few to go on.
const MIN_SAMPLES = 3;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
// A rate: whole numbers once it is big enough for the fraction not to matter,
// and a second decimal below 1, where seeds per minute live.
const rate = (n: number | null) => (n === null ? "–" : n >= 100 ? fmt(n) : n.toFixed(n < 1 ? 2 : 1));
const pct = (n: number, of: number) => (!of ? "–" : `${Math.round((n / of) * 100)}%`);
const duration = (s: number | null) => {
  if (s === null) return "–";
  const m = Math.round(s / 60);
  return m < 1 ? `${Math.round(s)}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
const when = (t: number) => {
  const d = new Date(t * 1000);
  return `${MON[d.getMonth()]} ${d.getDate()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Outcome = "completed" | "abandoned" | "running";

// A run the boss died in is completed. One without, whose instance has since
// been destroyed, was given up on; the rest may still be going.
function outcome(run: Run, now: number, lifespan: number): Outcome {
  if (run.completed !== null) return "completed";
  return now - run.started > lifespan ? "abandoned" : "running";
}

const OUTCOME_LABELS: Record<Outcome, string> = { completed: "Completed", abandoned: "Given up", running: "In progress" };

// The totals a group of player runs is described by.
type Totals = { n: number; minutes: number; levels: number[]; multiclassed: number } & Record<Stat, number>;

function total(rows: Participant[]): Totals {
  const t = { n: rows.length, minutes: 0, levels: [] as number[], multiclassed: 0 } as Totals;
  for (const s of STATS) t[s] = 0;
  for (const p of rows) {
    t.minutes += p.active / 60;
    t.levels.push(p.level);
    if (p.classes.length > 1) t.multiclassed++;
    for (const s of STATS) t[s] += p[s];
  }
  return t;
}

const perMinute = (t: Totals, v: number) => (t.minutes > 0 ? v / t.minutes : null);
const perRun = (t: Totals, v: number) => (t.n ? v / t.n : null);

// The class a character is filed under: their highest, the first taken on a
// tie, as on the Demographics page.
function primaryClass(p: Participant): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  for (const c of p.classes) if (!best || c[1] > best[1]) best = c;
  return best;
}

type GroupBy = "archetype" | "class";

function groupName(p: Participant, by: GroupBy, labels: Metrics["labels"], featNames: Map<number, string>): string {
  const c = primaryClass(p);
  if (!c) return "No class";
  const cls = labels.classes[c[0]] ?? `Class ${c[0]}`;
  if (by === "class") return cls;
  if (c[2] < 0) return `${cls} (no archetype)`;
  return featNames.get(c[2]) ?? `${cls} (archetype ${c[2]})`;
}

function RunsSection({ data, runs }: { data: Metrics; runs: Run[] }) {
  const outcomes = runs.map((r) => outcome(r, data.now, data.lifespan));
  const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
  const completed = count("completed");
  const toComplete = median(runs.filter((r) => r.completed !== null).map((r) => r.completed! - r.started));

  const byScar = new Map<string, { runs: Run[]; outcomes: Outcome[] }>();
  runs.forEach((r, i) => {
    const e = byScar.get(r.scar) ?? { runs: [], outcomes: [] };
    e.runs.push(r);
    e.outcomes.push(outcomes[i]);
    byScar.set(r.scar, e);
  });
  const scars = [...byScar].map(([scar, e]) => ({
    scar,
    name: data.scars[scar] ?? scar,
    n: e.runs.length,
    completed: e.outcomes.filter((o) => o === "completed").length,
    abandoned: e.outcomes.filter((o) => o === "abandoned").length,
    running: e.outcomes.filter((o) => o === "running").length,
    time: median(e.runs.filter((r) => r.completed !== null).map((r) => r.completed! - r.started)),
    party: e.runs.reduce((s, r) => s + r.party_size, 0) / e.runs.length,
    threat: e.runs.reduce((s, r) => s + r.threat, 0) / e.runs.length,
  })).sort((a, b) => b.n - a.n);
  const max = Math.max(...scars.map((s) => s.n), 1);
  const recent = runs.map((r, i) => ({ r, o: outcomes[i] })).reverse().slice(0, 30);

  return (
    <section className="economy__section" aria-labelledby="metrics-runs">
      <h3 id="metrics-runs">Runs</h3>
      <p className="economy__sub">
        Every Scar a party was sent into. A run is completed when its boss dies, and given up on if its
        instance expires first, two hours after the start. The level and outcome filters do not apply here.
        {data.bounces && data.bounces.players > 0 && (
          <>
            {" "}Players who walked straight back out, inside a minute and without dealing any damage, are left
            out of the whole page: {plural(data.bounces.players, "player", "players")}
            {data.bounces.runs > 0 &&
              `, and ${plural(data.bounces.runs, "run", "runs")} that ${data.bounces.runs === 1 ? "was" : "were"} nothing else`}.
          </>
        )}
      </p>
      <div className="economy__stats">
        <div className="economy__stat">
          <span className="economy__stat-label">Runs Started</span>
          <span className="economy__stat-value economy__stat-value--hero">{fmt(runs.length)}</span>
          <span className="economy__stat-note">Across {fmt(scars.length)} Scars</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Completed</span>
          <span className="economy__stat-value">{pct(completed, runs.length - count("running"))}</span>
          <span className="economy__stat-note">
            {fmt(completed)} completed, {fmt(count("abandoned"))} given up{count("running") ? `, ${fmt(count("running"))} in progress` : ""}
          </span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Median Time</span>
          <span className="economy__stat-value">{duration(toComplete)}</span>
          <span className="economy__stat-note">From entering to the boss's death</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Median Party</span>
          <span className="economy__stat-value">{median(runs.map((r) => r.party_size)) ?? "–"}</span>
          <span className="economy__stat-note">Players sent in together</span>
        </div>
      </div>

      <div className="economy__card">
        <h4>Runs by Scar</h4>
        <div className="economy__legend" aria-hidden="true">
          <span><i className="demo-key--main" />Completed</span>
          <span><i className="metrics-key--pending" />Given up or in progress</span>
        </div>
        <div className="demo-bars">
          {scars.map((s) => (
            <BarRow key={s.scar} label={s.name} value={fmt(s.n)} max={max}
              segments={[
                { n: s.completed, className: "demo-seg--main" },
                { n: s.abandoned + s.running, className: "demo-seg--pending" },
              ]}
              tip={<>
                <strong>{s.name}</strong>
                <span className="economy__tip-row"><i className="demo-key--main" />Completed<b>{fmt(s.completed)}</b></span>
                <span className="economy__tip-row"><i className="metrics-key--pending" />Given up<b>{fmt(s.abandoned)}</b></span>
                {s.running > 0 && <span className="economy__tip-row">In progress<b>{fmt(s.running)}</b></span>}
                <span className="economy__tip-row">Median time to complete<b>{duration(s.time)}</b></span>
                <span className="economy__tip-row">Average party<b>{s.party.toFixed(1)}</b></span>
                <span className="economy__tip-row">Average threat<b>{s.threat.toFixed(1)}</b></span>
              </>} />
          ))}
        </div>
        <details className="economy__details">
          <summary>Show as a table</summary>
          <div className="economy__table-wrap">
            <table>
              <thead><tr><th>Scar</th><th>Runs</th><th>Completed</th><th>Given Up</th><th>In Progress</th><th>Median Time</th><th>Average Party</th><th>Average Threat</th></tr></thead>
              <tbody>
                {scars.map((s) => (
                  <tr key={s.scar}>
                    <td>{s.name}</td><td>{fmt(s.n)}</td><td>{fmt(s.completed)}</td><td>{fmt(s.abandoned)}</td><td>{fmt(s.running)}</td>
                    <td>{duration(s.time)}</td><td>{s.party.toFixed(1)}</td><td>{s.threat.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className="economy__details">
          <summary>Show the latest runs</summary>
          <div className="economy__table-wrap">
            <table>
              <thead><tr><th>Started</th><th>Scar</th><th>Party</th><th>Threat</th><th>Bonus XP</th><th>Time</th><th>Completion</th><th>Respawns</th><th>Outcome</th></tr></thead>
              <tbody>
                {recent.map(({ r, o }, i) => (
                  <tr key={i}>
                    <td>{when(r.started)}</td><td>{data.scars[r.scar] ?? r.scar}</td><td>{r.party_size}</td><td>{r.threat}</td>
                    <td>{r.bonus_xp ? `${r.bonus_xp}%` : "–"}</td><td>{duration(r.completed !== null ? r.completed - r.started : null)}</td>
                    <td>{r.completion !== null ? `${r.completion}%` : "–"}</td><td>{r.respawns ?? "–"}</td><td>{OUTCOME_LABELS[o]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

type Reward = "xp" | "gold" | "seeds";
const REWARDS: [Reward, string][] = [["xp", "XP"], ["gold", "Gold"], ["seeds", "Seeds"]];
const rewardOf = (t: Totals, r: Reward) => (r === "seeds" ? t.seed_minor + t.seed_medium + t.seed_major : t[r]);

function RewardsSection({ data, rows }: { data: Metrics; rows: Participant[] }) {
  const [reward, setReward] = useState<Reward>("xp");
  const scars = useMemo(() => {
    const by = new Map<string, Participant[]>();
    for (const p of rows) {
      const scar = data.runs[p.run].scar;
      by.set(scar, [...(by.get(scar) ?? []), p]);
    }
    return [...by].map(([scar, ps]) => ({
      scar, name: data.scars[scar] ?? scar, t: total(ps), time: median(ps.map((p) => p.active)),
    }));
  }, [rows, data]);
  const value = (s: typeof scars[number]) => perMinute(s.t, rewardOf(s.t, reward)) ?? 0;
  const sorted = [...scars].sort((a, b) => value(b) - value(a));
  const max = Math.max(...sorted.map(value), 0.001);
  const label = REWARDS.find(([k]) => k === reward)![1];
  const all = total(rows);

  return (
    <section className="economy__section" aria-labelledby="metrics-rewards">
      <h3 id="metrics-rewards">Rewards</h3>
      <p className="economy__sub">
        What a player takes out of each Scar for the time it takes: every reward over the minutes spent on the
        run, from being sent in until the boss died, or until leaving for a run not finished. Loot from the chests
        past the boss counts; the time spent collecting it does not. XP is all XP earned during the run.
      </p>
      <div className="economy__stats">
        {REWARDS.map(([k, name]) => (
          <div className="economy__stat" key={k}>
            <span className="economy__stat-label">{name} per Minute</span>
            <span className="economy__stat-value">{rate(perMinute(all, rewardOf(all, k)))}</span>
            <span className="economy__stat-note">{rate(perRun(all, rewardOf(all, k)))} per player run</span>
          </div>
        ))}
        <div className="economy__stat">
          <span className="economy__stat-label">Player Runs</span>
          <span className="economy__stat-value">{fmt(rows.length)}</span>
          <span className="economy__stat-note">Median {duration(median(rows.map((p) => p.active)))} each</span>
        </div>
      </div>

      <div className="economy__card">
        <div className="demo-card-head">
          <h4>{label} per Minute by Scar</h4>
          <div className="bans-filter" role="group" aria-label="Reward">
            {REWARDS.map(([k, name]) => (
              <button key={k} aria-pressed={reward === k} onClick={() => setReward(k)}
                className={`bans-filter__btn${reward === k ? " bans-filter__btn--active" : ""}`}>{name}</button>
            ))}
          </div>
        </div>
        <p className="demo-note">Greyed rows rest on fewer than {MIN_SAMPLES} player runs.</p>
        <div className="demo-bars">
          {sorted.map((s) => (
            <BarRow key={s.scar} label={s.name} value={rate(value(s))} max={max} muted={s.t.n < MIN_SAMPLES}
              segments={[{ n: value(s), className: s.t.n < MIN_SAMPLES ? "demo-seg--pending" : "demo-seg--main" }]}
              tip={<>
                <strong>{s.name}</strong>
                <span className="economy__tip-row">{label} per minute<b>{rate(value(s))}</b></span>
                <span className="economy__tip-row">{label} per player run<b>{rate(perRun(s.t, rewardOf(s.t, reward)))}</b></span>
                {reward === "seeds" && (
                  <span className="economy__tip-row">Minor, medium, major per run
                    <b>{rate(perRun(s.t, s.t.seed_minor))} / {rate(perRun(s.t, s.t.seed_medium))} / {rate(perRun(s.t, s.t.seed_major))}</b>
                  </span>
                )}
                {reward === "xp" && <span className="economy__tip-row">From completion per run<b>{rate(perRun(s.t, s.t.xp_quest))}</b></span>}
                <span className="economy__tip-row">Player runs<b>{fmt(s.t.n)}</b></span>
                <span className="economy__tip-row">Median time<b>{duration(s.time)}</b></span>
              </>} />
          ))}
        </div>
        <details className="economy__details">
          <summary>Show every reward as a table</summary>
          <div className="economy__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scar</th><th>Player Runs</th><th>Median Time</th>
                  <th>XP/Min</th><th>Gold/Min</th><th>Seeds/Min</th><th>Ichor/Min</th><th>Scrap/Min</th>
                  <th>XP/Run</th><th>Completion XP/Run</th><th>Gold/Run</th><th>Minor Seeds/Run</th><th>Medium Seeds/Run</th><th>Major Seeds/Run</th>
                  <th>Ichor/Run</th><th>Scrap/Run</th><th>Containers/Run</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ scar, name, t, time }) => (
                  <tr key={scar}>
                    <td>{name}</td><td>{fmt(t.n)}</td><td>{duration(time)}</td>
                    <td>{rate(perMinute(t, t.xp))}</td><td>{rate(perMinute(t, t.gold))}</td><td>{rate(perMinute(t, rewardOf(t, "seeds")))}</td>
                    <td>{rate(perMinute(t, t.ichor))}</td><td>{rate(perMinute(t, t.scrap))}</td>
                    <td>{rate(perRun(t, t.xp))}</td><td>{rate(perRun(t, t.xp_quest))}</td><td>{rate(perRun(t, t.gold))}</td>
                    <td>{rate(perRun(t, t.seed_minor))}</td><td>{rate(perRun(t, t.seed_medium))}</td><td>{rate(perRun(t, t.seed_major))}</td>
                    <td>{rate(perRun(t, t.ichor))}</td><td>{rate(perRun(t, t.scrap))}</td><td>{rate(perRun(t, t.looted))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

type DamageMeasure = "minute" | "run";

function DamageSection({ data, rows }: { data: Metrics; rows: Participant[] }) {
  const [scar, setScar] = useState("");
  const [by, setBy] = useState<GroupBy>("archetype");
  const [measure, setMeasure] = useState<DamageMeasure>("minute");
  const featNames = useMemo(
    () => new Map(data.labels.archetypes.flatMap((a) => a.options.map(([f, name]) => [f, name] as [number, string]))),
    [data.labels],
  );
  const scarOptions = [...new Set(rows.map((p) => data.runs[p.run].scar))]
    .map((s) => ({ s, name: data.scars[s] ?? s })).sort((a, b) => a.name.localeCompare(b.name));
  const inScar = scar ? rows.filter((p) => data.runs[p.run].scar === scar) : rows;

  const groups = useMemo(() => {
    const g = new Map<string, Participant[]>();
    for (const p of inScar) {
      const name = groupName(p, by, data.labels, featNames);
      g.set(name, [...(g.get(name) ?? []), p]);
    }
    return [...g].map(([name, ps]) => ({ name, t: total(ps) }));
  }, [inScar, by, data.labels, featNames]);
  const value = (t: Totals) => (measure === "minute" ? perMinute(t, t.dealt) : perRun(t, t.dealt)) ?? 0;
  const sorted = [...groups].sort((a, b) => value(b.t) - value(a.t));
  const max = Math.max(...sorted.map((g) => value(g.t)), 0.001);

  return (
    <section className="economy__section" aria-labelledby="metrics-damage">
      <h3 id="metrics-damage">Damage by {by === "archetype" ? "Archetype" : "Class"}</h3>
      <p className="economy__sub">
        Damage dealt to the Scar's creatures, counting the player's summons and companions, and stopping at the hit
        points each target had left. A multiclassed character is filed under their highest class. Damage varies
        with level and party, so narrow the levels in the toolbar to compare like with like.
      </p>
      <div className="economy__card">
        <div className="demo-card-head">
          <h4>{measure === "minute" ? "Damage per Minute" : "Damage per Player Run"}</h4>
          <div className="metrics-controls">
            <label className="demo-date">
              <span>Scar</span>
              <select value={scar} onChange={(e) => setScar(e.target.value)}>
                <option value="">All Scars</option>
                {scarOptions.map(({ s, name }) => <option key={s} value={s}>{name}</option>)}
              </select>
            </label>
            <div className="bans-filter" role="group" aria-label="Group by">
              {([["archetype", "Archetype"], ["class", "Class"]] as const).map(([k, name]) => (
                <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}
                  className={`bans-filter__btn${by === k ? " bans-filter__btn--active" : ""}`}>{name}</button>
              ))}
            </div>
            <div className="bans-filter" role="group" aria-label="Damage measure">
              {([["minute", "Per Minute"], ["run", "Per Run"]] as const).map(([k, name]) => (
                <button key={k} aria-pressed={measure === k} onClick={() => setMeasure(k)}
                  className={`bans-filter__btn${measure === k ? " bans-filter__btn--active" : ""}`}>{name}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="demo-note">Greyed rows rest on fewer than {MIN_SAMPLES} player runs.</p>
        {sorted.length === 0 ? <p className="economy__empty">No player runs match.</p> : (
          <div className="demo-bars">
            {sorted.map(({ name, t }) => (
              <BarRow key={name} label={name} value={rate(value(t))} max={max} muted={t.n < MIN_SAMPLES}
                segments={[{ n: value(t), className: t.n < MIN_SAMPLES ? "demo-seg--pending" : "demo-seg--main" }]}
                tip={<>
                  <strong>{name}</strong>
                  <span className="economy__tip-row">Damage per minute<b>{rate(perMinute(t, t.dealt))}</b></span>
                  <span className="economy__tip-row">Damage per run<b>{rate(perRun(t, t.dealt))}</b></span>
                  <span className="economy__tip-row">Taken per minute<b>{rate(perMinute(t, t.taken))}</b></span>
                  <span className="economy__tip-row">Healing per minute<b>{rate(perMinute(t, t.heal))}</b></span>
                  <span className="economy__tip-row">Player runs<b>{fmt(t.n)}</b></span>
                  <span className="economy__tip-row">Median level<b>{median(t.levels) ?? "–"}</b></span>
                </>} />
            ))}
          </div>
        )}
        <details className="economy__details">
          <summary>Show as a table</summary>
          <div className="economy__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{by === "archetype" ? "Archetype" : "Class"}</th><th>Player Runs</th><th>Median Level</th><th>Multiclassed</th>
                  <th>Damage/Min</th><th>Damage/Run</th><th>Overkill/Run</th><th>Taken/Min</th>
                  <th>Healing/Min</th><th>Temp HP + DR/Min</th><th>Kills/Run</th><th>Deaths/Run</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ name, t }) => (
                  <tr key={name}>
                    <td>{name}</td><td>{fmt(t.n)}</td><td>{median(t.levels) ?? "–"}</td><td>{pct(t.multiclassed, t.n)}</td>
                    <td>{rate(perMinute(t, t.dealt))}</td><td>{rate(perRun(t, t.dealt))}</td><td>{rate(perRun(t, t.overkill))}</td>
                    <td>{rate(perMinute(t, t.taken))}</td><td>{rate(perMinute(t, t.heal))}</td><td>{rate(perMinute(t, t.thp + t.dr_absorb))}</td>
                    <td>{rate(perRun(t, t.kills_minion + t.kills_normal + t.kills_elite + t.kills_solo))}</td>
                    <td>{rate(perRun(t, t.deaths))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

interface MetricsPageProps {
  authToken: string;
}

function MetricsPage({ authToken }: MetricsPageProps) {
  const [days, setDays] = useState(30);
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(0);   // 0: no upper limit
  const [finishedOnly, setFinishedOnly] = useState(true);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  // As on the Economy page, whatever asks for a fetch sets loading, so the
  // effect only sets state once the response is in.
  function reload(nextDays = days) {
    setLoading(true);
    setError(null);
    setDays(nextDays);
    setReloads((n) => n + 1);
  }

  useEffect(() => {
    let current = true;
    fetch(`${import.meta.env.VITE_API_URL}/metrics/scars?days=${days}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<Metrics>;
      })
      .then((d) => { if (current) { setData(d); setLoading(false); } })
      .catch((err) => { if (current) { setError(err.message); setLoading(false); } });
    return () => { current = false; };
  }, [days, authToken, reloads]);

  const topLevel = data ? Math.max(20, ...data.participants.map((p) => p.level)) : 20;
  const levels = Array.from({ length: topLevel }, (_, i) => i + 1);
  const rows = useMemo(() => (data ? data.participants.filter((p) =>
    p.level >= minLevel && (!maxLevel || p.level <= maxLevel) && (!finishedOnly || p.success)) : []),
  [data, minLevel, maxLevel, finishedOnly]);

  return (
    <div className="economy demographics metrics">
      <h2 className="sr-only">Metrics</h2>
      <div className="list-toolbar">
        <div className="bans-filter" role="group" aria-label="Time range">
          {RANGES.map(([d, label]) => (
            <button key={d} aria-pressed={days === d}
              className={`bans-filter__btn${days === d ? " bans-filter__btn--active" : ""}`}
              onClick={() => reload(d)}>{label}</button>
          ))}
        </div>
        <div className="bans-filter" role="group" aria-label="Player runs to count">
          <button aria-pressed={finishedOnly} onClick={() => setFinishedOnly(true)}
            className={`bans-filter__btn${finishedOnly ? " bans-filter__btn--active" : ""}`}>Finished</button>
          <button aria-pressed={!finishedOnly} onClick={() => setFinishedOnly(false)}
            className={`bans-filter__btn${!finishedOnly ? " bans-filter__btn--active" : ""}`}>Every Attempt</button>
        </div>
        <label className="demo-date">
          <span>Levels</span>
          <select aria-label="Lowest level" value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))}>
            {levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span aria-hidden="true">to</span>
          <select aria-label="Highest level" value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))}>
            {levels.filter((l) => l >= minLevel).map((l) => <option key={l} value={l}>{l}</option>)}
            <option value={0}>Any</option>
          </select>
        </label>
        <button className="refresh-btn refresh-btn--refresh" aria-label="Refresh" onClick={() => reload()}>
          <IconRefresh /><span className="refresh-btn__label" aria-hidden="true"> Refresh</span>
        </button>
      </div>

      {loading && <p role="status">Loading...</p>}
      {error && <p role="alert" style={{ color: "#c0323a" }}>Error: {error}</p>}
      {!loading && !error && data && data.runs.length === 0 && (
        <p className="economy__empty">
          No Scar runs {days ? `in the last ${days} days` : "have been recorded yet"}. The game records a run from the
          moment a party is sent in.
        </p>
      )}

      {!loading && !error && data && data.runs.length > 0 && (
        <>
          <RunsSection data={data} runs={data.runs} />
          {rows.length === 0 ? (
            <p className="economy__empty">
              No player runs match the filters. {finishedOnly ? "Try Every Attempt, or " : "Try "}widening the levels.
            </p>
          ) : (
            <>
              <RewardsSection data={data} rows={rows} />
              <DamageSection data={data} rows={rows} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default MetricsPage;
