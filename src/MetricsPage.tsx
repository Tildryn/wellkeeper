import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "./Icons";
import { BarRow } from "./BarRow";
import { useWidth } from "./chart";
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
// Below the Scars come the intrusions, from /metrics/invasions (see
// Invasions): how each Intruder's landing ended and what it did to the party,
// to tell whether the Intruders need strengthening. Then the letters sent by
// Crow, from /metrics/letters (see Letters): a count per day. The level and
// outcome filters leave both alone.
//
// Shares the Demographics page's bar lists and columns, and the Economy
// page's tiles, cards, and tables.

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

// Risenholm's level cap, and so the last choice in the level filters.
const MAX_LEVEL = 10;
const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

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

// Letters sent by Crow, from wkserver's /metrics/letters: the hours any were
// sent in, as [unix seconds of the hour, letters], within the time range.
// `total` and `first` take in every letter the game has recorded
// (RecordLetterSent in the module's pw_inc_letter), and `waiting` is the
// letters still queued for a character who has not been online since.
type Letters = { hours: [number, number][]; total: number; first: number | null; waiting: number; now: number };

// Days are UTC, as on the Economy page.
const dayKey = (t: number) => Math.floor(t / 86400) * 86400;
const dayLabel = (t: number) => { const d = new Date(t * 1000); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };

// The letters of every day in the range, the days without one included: from
// the start of the range, or from the first letter recorded if that is later.
function letterDays(letters: Letters, days: number): [number, number][] {
  if (letters.first === null) return [];
  const byDay = new Map<number, number>();
  for (const [t, n] of letters.hours) byDay.set(dayKey(t), (byDay.get(dayKey(t)) ?? 0) + n);
  const out: [number, number][] = [];
  const start = dayKey(Math.max(letters.first, days ? letters.now - days * 86400 : 0));
  for (let t = start; t <= letters.now; t += 86400) out.push([t, byDay.get(t) ?? 0]);
  return out;
}

// The step between the ticks of a count axis: a whole number, so no tick
// stands for a fraction of a letter, with at most four of them to the top.
function countStep(max: number): number {
  for (let p = 1; ; p *= 10) for (const s of [1, 2, 5]) if (max <= s * p * 4) return s * p;
}

function LetterColumns({ days }: { days: [number, number][] }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const H = 220;
  const m = { l: 48, r: 8, t: 12, b: 26 };
  const top = Math.max(...days.map((d) => d[1]), 1);
  const step = countStep(top);
  const vMax = step * Math.ceil(top / step);
  const ticks = Array.from({ length: vMax / step + 1 }, (_, i) => i * step);
  const y = (v: number) => m.t + (1 - v / vMax) * (H - m.t - m.b);
  const band = (W - m.l - m.r) / days.length;
  const bw = Math.max(2, Math.min(24, band * 0.6));
  const labelEvery = Math.ceil(46 / band);
  const hd = hover === null ? null : days[hover];

  return (
    <div className="economy__chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" onPointerLeave={() => setHover(null)}
        aria-label={`Letters sent per day, ${dayLabel(days[0][0])} to ${dayLabel(days[days.length - 1][0])}. The figures are in the table below.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "economy__axis" : "economy__grid"} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="economy__tick">{fmt(v)}</text>
          </g>
        ))}
        {days.map(([t, n], i) => {
          const cx = m.l + band * (i + 0.5);
          const h = y(0) - y(n);
          const rad = Math.min(4, h, bw / 2);
          const xl = cx - bw / 2, xr = cx + bw / 2, yt = y(n), yb = y(0) - 1;
          return (
            <g key={t} opacity={hover === null || hover === i ? 1 : 0.55}>
              {h >= 0.5 && (
                <path className="demo-col"
                  d={`M${xl},${yb}V${yt + rad}Q${xl},${yt} ${xl + rad},${yt}H${xr - rad}Q${xr},${yt} ${xr},${yt + rad}V${yb}Z`} />
              )}
              {i % labelEvery === 0 && <text x={cx} y={H - 8} textAnchor="middle" className="economy__tick">{dayLabel(t)}</text>}
              <rect x={cx - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent"
                onPointerEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hd && (
        <div className="economy__tip" style={{ left: Math.min(((m.l + band * (hover! + 0.5)) / W) * 100, 72) + "%", top: 4 }}>
          <strong>{plural(hd[1], "letter", "letters")}</strong>
          <span>{dayLabel(hd[0])} (UTC)</span>
        </div>
      )}
    </div>
  );
}

function LettersSection({ letters, days }: { letters: Letters; days: number }) {
  const byDay = useMemo(() => letterDays(letters, days), [letters, days]);
  const sent = byDay.reduce((s, d) => s + d[1], 0);
  const busiest = byDay.reduce<[number, number] | null>((b, d) => (d[1] > (b?.[1] ?? 0) ? d : b), null);
  // The days the average is over: the range, or as much of it as the count
  // has been kept for.
  const from = Math.max(letters.first ?? letters.now, days ? letters.now - days * 86400 : 0);
  const span = Math.max(1, (letters.now - from) / 86400);
  // The day the count began, with its year once that is not this one.
  const year = (t: number) => new Date(t * 1000).getUTCFullYear();
  const began = letters.first === null ? ""
    : dayLabel(letters.first) + (year(letters.first) === year(letters.now) ? "" : `, ${year(letters.first)}`);

  return (
    <section className="economy__section" aria-labelledby="metrics-letters">
      <h3 id="metrics-letters">Crow Letters</h3>
      <p className="economy__sub">
        Letters handed to the Crow for delivery, counted as it takes each one.{" "}
        {letters.first === null
          ? "None has been counted yet."
          : `The count begins on ${began}, and says nothing of who wrote to whom.`}
        {" "}The level and outcome filters do not apply here.
      </p>
      <div className="economy__stats">
        <div className="economy__stat">
          <span className="economy__stat-label">Letters Sent</span>
          <span className="economy__stat-value economy__stat-value--hero">{fmt(sent)}</span>
          <span className="economy__stat-note">
            {letters.first === null ? "Nothing counted yet"
              : days ? `${fmt(letters.total)} since ${began}` : `Since ${began}`}
          </span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Per Day</span>
          <span className="economy__stat-value">{letters.first === null ? "–" : rate(sent / span)}</span>
          <span className="economy__stat-note">
            {letters.first === null ? "Needs a letter to go on"
              : `Average over ${Number.isInteger(span) ? plural(span, "day", "days") : `${span.toFixed(1)} days`}`}
          </span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Busiest Day</span>
          <span className="economy__stat-value">{busiest ? fmt(busiest[1]) : "–"}</span>
          <span className="economy__stat-note">{busiest ? `${dayLabel(busiest[0])} (UTC)` : "No letters in this range"}</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Waiting for Delivery</span>
          <span className="economy__stat-value">{fmt(letters.waiting)}</span>
          <span className="economy__stat-note">For characters not online since</span>
        </div>
      </div>

      <div className="economy__card">
        <h4>Letters per Day</h4>
        {sent === 0 ? (
          <p className="economy__empty">
            No letters {days ? `in the last ${days} days` : "have been counted yet"}.
          </p>
        ) : (
          <>
            <LetterColumns days={byDay} />
            <details className="economy__details">
              <summary>Show as a table</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead><tr><th>Day (UTC)</th><th>Letters</th></tr></thead>
                  <tbody>
                    {[...byDay].reverse().map(([t, n]) => (
                      <tr key={t}><td>{dayLabel(t)}</td><td>{fmt(n)}</td></tr>
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

// Intrusions, from wkserver's /metrics/invasions: a row per Intruder landing
// in a Scar (pw_inc_invmetr in the module), oldest first. `runs` counts the
// Scar runs in the range since the first landing was recorded, those whose
// party allowed intrusions, and those an Intruder landed in. The module's
// migration (20261001000002_add_invasions.sql) says what each count means.
type Invasion = {
  scar: string | null;
  party_size: number | null;
  landed: number;
  ended: number | null;
  outcome: string | null;
  threat: number;
  intruder_level: number;
  intruder_hp: number;
  hp_left: number | null;
  defenders: number;
  defender_levels: number[];
  intruders: number;
} & Record<InvasionCount, number>;
const INVASION_COUNTS = [
  "downs", "defender_deaths", "defenders_killed", "killing_blows", "respawns",
  "dealt", "taken", "xp", "seeds", "seed_value",
] as const;
type InvasionCount = typeof INVASION_COUNTS[number];
type Invasions = {
  invasions: Invasion[];
  scars: Record<string, string>;
  runs: { total: number; open: number; invaded: number };
  first: number | null;
  now: number;
  lifespan: number;
};

// Whose win an ending is. An Intruder is there to put the party down or drive
// it out of the Scar; it loses by being put down, by its player stepping out
// (which pays the defenders as a kill), or by the party finishing the Scar
// around it. A recall, and an ending nobody recorded, decide nothing.
type Side = "intruder" | "defenders" | "neither";
const ENDINGS: Record<string, { label: string; side: Side; note: string }> = {
  defeated:  { label: "Wiped the Party", side: "intruder", note: "Every defender fell: died, or respawned since it landed" },
  abandoned: { label: "Drove the Party Out", side: "intruder", note: "Every defender left the Scar or logged off" },
  killed:    { label: "Killed", side: "defenders", note: "The defenders put it down" },
  forfeited: { label: "Fled", side: "defenders", note: "Its player stepped out of it, which pays the defenders as a kill" },
  completed: { label: "Party Completed the Scar", side: "defenders", note: "The boss died with the Intruder still inside" },
  recalled:  { label: "Recalled", side: "neither", note: "Its player's own body came under attack" },
  unknown:   { label: "Unknown", side: "neither", note: "It ended some way the game did not name" },
  cut:       { label: "Cut Short", side: "neither", note: "It never ended: the server restarted first" },
  running:   { label: "In Progress", side: "neither", note: "Still going, or cut short within the last two hours" },
};
const SIDE_SEG: Record<Side, string> = { intruder: "metrics-seg--intruder", defenders: "demo-seg--main", neither: "demo-seg--pending" };

// An invasion with no end whose Scar instance must be gone by now (it lives
// two hours from the run's start, which is before the landing) was cut short.
function ending(i: Invasion, data: Invasions): string {
  if (i.outcome) return ENDINGS[i.outcome] ? i.outcome : "unknown";
  return data.now - i.landed > data.lifespan ? "cut" : "running";
}

// The totals a group of invasions is described by. Damage is written as an
// invasion ends, so the minutes it is divided by are those of the invasions
// that ended.
type InvasionTotals = {
  n: number;
  won: number;
  lost: number;
  killed: number;
  minutes: number;
  lengths: number[];
  winHP: number[];          // the Intruder's hit points left on each win, as a fraction
  defenderLevels: number[];
  threats: number[];
} & Record<InvasionCount, number>;

function invasionTotals(rows: Invasion[], data: Invasions): InvasionTotals {
  const t = { n: rows.length, won: 0, lost: 0, killed: 0, minutes: 0, lengths: [], winHP: [], defenderLevels: [], threats: [] } as unknown as InvasionTotals;
  for (const c of INVASION_COUNTS) t[c] = 0;
  for (const i of rows) {
    const side = ENDINGS[ending(i, data)].side;
    if (side === "intruder") {
      t.won++;
      if (i.hp_left !== null && i.intruder_hp > 0) t.winHP.push(i.hp_left / i.intruder_hp);
    }
    if (side === "defenders") t.lost++;
    if (i.outcome === "killed") t.killed++;
    if (i.ended !== null) {
      t.minutes += (i.ended - i.landed) / 60;
      t.lengths.push(i.ended - i.landed);
    }
    t.defenderLevels.push(...i.defender_levels);
    t.threats.push(i.threat);
    for (const c of INVASION_COUNTS) t[c] += i[c];
  }
  return t;
}

const decided = (t: InvasionTotals) => t.won + t.lost;
const winRate = (t: InvasionTotals) => (decided(t) ? t.won / decided(t) : null);
const each = (t: InvasionTotals, v: number) => (t.n ? v / t.n : null);
const perInvasionMinute = (t: InvasionTotals, v: number) => (t.minutes > 0 ? v / t.minutes : null);
const pctOf = (f: number | null) => (f === null ? "–" : `${Math.round(f * 100)}%`);

type InvasionGroupBy = "party" | "intruders" | "scar";
const INVASION_GROUPS: [InvasionGroupBy, string][] = [["party", "Party Size"], ["intruders", "Intruders"], ["scar", "Scar"]];

// The group an invasion is filed under, and the number the groups are sorted
// by (the Scars, which have none, go by how many invasions they drew).
function invasionGroup(i: Invasion, by: InvasionGroupBy, data: Invasions): [string, number] {
  if (by === "party") return [plural(i.defenders, "defender", "defenders"), i.defenders];
  if (by === "intruders") return [i.intruders === 1 ? "Alone" : `${i.intruders} at once`, i.intruders];
  return [i.scar === null ? "Unknown Scar" : data.scars[i.scar] ?? i.scar, 0];
}

function InvasionsSection({ data }: { data: Invasions }) {
  const [by, setBy] = useState<InvasionGroupBy>("party");
  const all = useMemo(() => invasionTotals(data.invasions, data), [data]);
  const endings = useMemo(() => {
    const n = new Map<string, number>();
    for (const i of data.invasions) n.set(ending(i, data), (n.get(ending(i, data)) ?? 0) + 1);
    return Object.keys(ENDINGS).filter((k) => n.get(k)).map((k) => ({ key: k, n: n.get(k)!, ...ENDINGS[k] }));
  }, [data]);
  const groups = useMemo(() => {
    const g = new Map<string, { order: number; rows: Invasion[] }>();
    for (const i of data.invasions) {
      const [name, order] = invasionGroup(i, by, data);
      const e = g.get(name) ?? { order, rows: [] };
      e.rows.push(i);
      g.set(name, e);
    }
    return [...g].map(([name, e]) => ({ name, order: e.order, t: invasionTotals(e.rows, data) }))
      .sort((a, b) => (by === "scar" ? b.t.n - a.t.n : a.order - b.order));
  }, [data, by]);
  const count = (key: string) => endings.find((e) => e.key === key)?.n ?? 0;
  const maxEnding = Math.max(...endings.map((e) => e.n), 1);
  const recent = [...data.invasions].reverse().slice(0, 30);
  const groupLabel = INVASION_GROUPS.find(([k]) => k === by)![1];
  const year = (t: number) => new Date(t * 1000).getUTCFullYear();
  const began = data.first === null ? ""
    : `${MON[new Date(data.first * 1000).getUTCMonth()]} ${new Date(data.first * 1000).getUTCDate()}` +
      (year(data.first) === year(data.now) ? "" : `, ${year(data.first)}`);

  return (
    <section className="economy__section" aria-labelledby="metrics-invasions">
      <h3 id="metrics-invasions">Intrusions</h3>
      <p className="economy__sub">
        Every Intruder that landed in a Scar, and how it fared against the party it found.{" "}
        {data.first === null ? "None has been recorded yet." : `The count begins on ${began}.`}{" "}
        An Intruder wins by wiping the party out or driving it from the Scar, and loses by being killed, by fleeing,
        or by the party completing the Scar around it. Defenders count as killed by every Intruder within 40m when
        they die, the reach its kill XP is paid within. The level and outcome filters do not apply here.
      </p>
      {data.invasions.length === 0 ? (
        <p className="economy__empty">No Intruder has landed in this range.</p>
      ) : (
        <>
          <div className="economy__stats">
            <div className="economy__stat">
              <span className="economy__stat-label">Intrusions</span>
              <span className="economy__stat-value economy__stat-value--hero">{fmt(all.n)}</span>
              <span className="economy__stat-note">
                {data.runs.open
                  ? `Into ${pct(data.runs.invaded, data.runs.open)} of the ${fmt(data.runs.open)} runs open to Intruders`
                  : "No run was open to Intruders"}
              </span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Intruder Win Rate</span>
              <span className="economy__stat-value">{pctOf(winRate(all))}</span>
              <span className="economy__stat-note">
                {fmt(all.won)} won, {fmt(all.lost)} lost{decided(all) < all.n ? `, ${fmt(all.n - decided(all))} undecided` : ""}
              </span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Defenders Killed</span>
              <span className="economy__stat-value">{rate(each(all, all.defenders_killed))}</span>
              <span className="economy__stat-note">
                Per intrusion, each defender once; {rate(each(all, all.defender_deaths))} counting the same one dying again
              </span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Intruders Killed</span>
              <span className="economy__stat-value">{pct(all.killed, all.n)}</span>
              <span className="economy__stat-note">Median {duration(median(all.lengths))} from landing to the end</span>
            </div>
          </div>
          <div className="economy__stats">
            <div className="economy__stat">
              <span className="economy__stat-label">Defenders Downed</span>
              <span className="economy__stat-value">{rate(each(all, all.downs))}</span>
              <span className="economy__stat-note">Per intrusion, raised again or not</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Defenders Respawned</span>
              <span className="economy__stat-value">{rate(each(all, all.respawns))}</span>
              <span className="economy__stat-note">Per intrusion: rose again rather than wait to be raised</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Health Left on a Win</span>
              <span className="economy__stat-value">{pctOf(median(all.winHP))}</span>
              <span className="economy__stat-note">The Intruder's, median, of {plural(all.winHP.length, "win", "wins")}</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Intruder's Reward</span>
              <span className="economy__stat-value">{rate(each(all, all.xp))} XP</span>
              <span className="economy__stat-note">And {rate(each(all, all.seeds))} forging seeds, per intrusion</span>
            </div>
          </div>

          <div className="economy__card">
            <h4>How Intrusions End</h4>
            <div className="economy__legend" aria-hidden="true">
              <span><i className="metrics-key--intruder" />Intruder won</span>
              <span><i className="demo-key--main" />Defenders won</span>
              <span><i className="metrics-key--pending" />Neither</span>
            </div>
            <div className="demo-bars">
              {endings.map((e) => (
                <BarRow key={e.key} label={e.label} value={fmt(e.n)} max={maxEnding}
                  segments={[{ n: e.n, className: SIDE_SEG[e.side] }]}
                  tip={<>
                    <strong>{e.label}</strong>
                    <span>{e.note}.</span>
                    <span className="economy__tip-row">Intrusions<b>{fmt(e.n)}</b></span>
                    <span className="economy__tip-row">Share<b>{pct(e.n, all.n)}</b></span>
                  </>} />
              ))}
            </div>
            {(count("cut") > 0 || count("unknown") > 0) && (
              <p className="demo-note">
                An intrusion cut short or unknown counts toward neither side's wins.
              </p>
            )}
          </div>

          <div className="economy__card">
            <div className="demo-card-head">
              <h4>Intruder Win Rate by {groupLabel}</h4>
              <div className="bans-filter" role="group" aria-label="Group intrusions by">
                {INVASION_GROUPS.map(([k, name]) => (
                  <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}
                    className={`bans-filter__btn${by === k ? " bans-filter__btn--active" : ""}`}>{name}</button>
                ))}
              </div>
            </div>
            <p className="demo-note">
              {by === "party" && "Party size is the defenders in the Scar when the Intruder landed. "}
              {by === "intruders" && "Intruders in the Scar when each one landed, itself included; a second arriving later does not count for the first. "}
              Greyed rows rest on fewer than {MIN_SAMPLES} decided intrusions.
            </p>
            <div className="demo-bars">
              {groups.map(({ name, t }) => (
                <BarRow key={name} label={name} value={pctOf(winRate(t))} max={1} muted={decided(t) < MIN_SAMPLES}
                  segments={[{ n: winRate(t) ?? 0, className: decided(t) < MIN_SAMPLES ? "demo-seg--pending" : "metrics-seg--intruder" }]}
                  tip={<>
                    <strong>{name}</strong>
                    <span className="economy__tip-row">Intrusions<b>{fmt(t.n)}</b></span>
                    <span className="economy__tip-row">Won, lost<b>{fmt(t.won)} / {fmt(t.lost)}</b></span>
                    <span className="economy__tip-row">Intruder killed<b>{pct(t.killed, t.n)}</b></span>
                    <span className="economy__tip-row">Defenders killed per intrusion<b>{rate(each(t, t.defenders_killed))}</b></span>
                    <span className="economy__tip-row">Deaths per intrusion, repeats counted<b>{rate(each(t, t.defender_deaths))}</b></span>
                    <span className="economy__tip-row">Respawns per intrusion<b>{rate(each(t, t.respawns))}</b></span>
                    <span className="economy__tip-row">Damage dealt, taken per minute<b>{rate(perInvasionMinute(t, t.dealt))} / {rate(perInvasionMinute(t, t.taken))}</b></span>
                    <span className="economy__tip-row">Median length<b>{duration(median(t.lengths))}</b></span>
                    <span className="economy__tip-row">Median defender level<b>{median(t.defenderLevels) ?? "–"}</b></span>
                  </>} />
              ))}
            </div>
            <details className="economy__details">
              <summary>Show as a table</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{groupLabel}</th><th>Intrusions</th><th>Won</th><th>Lost</th><th>Win Rate</th><th>Intruder Killed</th>
                      <th>Downed/Intrusion</th><th>Killed/Intrusion</th><th>Deaths/Intrusion</th><th>Respawns/Intrusion</th>
                      <th>Dealt/Min</th><th>Taken/Min</th><th>Health Left on a Win</th><th>Median Length</th>
                      <th>Median Defender Level</th><th>Median Threat</th><th>XP/Intrusion</th><th>Seeds/Intrusion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(({ name, t }) => (
                      <tr key={name}>
                        <td>{name}</td><td>{fmt(t.n)}</td><td>{fmt(t.won)}</td><td>{fmt(t.lost)}</td><td>{pctOf(winRate(t))}</td>
                        <td>{pct(t.killed, t.n)}</td><td>{rate(each(t, t.downs))}</td><td>{rate(each(t, t.defenders_killed))}</td>
                        <td>{rate(each(t, t.defender_deaths))}</td><td>{rate(each(t, t.respawns))}</td>
                        <td>{rate(perInvasionMinute(t, t.dealt))}</td><td>{rate(perInvasionMinute(t, t.taken))}</td>
                        <td>{pctOf(median(t.winHP))}</td><td>{duration(median(t.lengths))}</td>
                        <td>{median(t.defenderLevels) ?? "–"}</td><td>{median(t.threats) ?? "–"}</td>
                        <td>{rate(each(t, t.xp))}</td><td>{rate(each(t, t.seeds))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details className="economy__details">
              <summary>Show the latest intrusions</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Landed</th><th>Scar</th><th>Defender Levels</th><th>Intruders</th><th>Threat</th><th>Length</th>
                      <th>Downed</th><th>Killed</th><th>Deaths</th><th>Respawns</th><th>Dealt</th><th>Taken</th>
                      <th>Health Left</th><th>XP</th><th>Seeds</th><th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((i, n) => (
                      <tr key={n}>
                        <td>{when(i.landed)}</td><td>{i.scar === null ? "–" : data.scars[i.scar] ?? i.scar}</td>
                        <td>{i.defender_levels.length ? i.defender_levels.join(", ") : "–"}</td><td>{i.intruders}</td><td>{i.threat}</td>
                        <td>{duration(i.ended === null ? null : i.ended - i.landed)}</td>
                        <td>{i.downs}</td><td>{i.defenders_killed}</td><td>{i.defender_deaths}</td><td>{i.respawns}</td>
                        <td>{fmt(i.dealt)}</td><td>{fmt(i.taken)}</td>
                        <td>{i.hp_left === null || !i.intruder_hp ? "–" : pct(i.hp_left, i.intruder_hp)}</td>
                        <td>{fmt(i.xp)}</td><td>{i.seeds}</td><td>{ENDINGS[ending(i, data)].label}</td>
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

interface MetricsPageProps {
  authToken: string;
}

function MetricsPage({ authToken }: MetricsPageProps) {
  const [days, setDays] = useState(30);
  const [minLevel, setMinLevel] = useState(1);
  const [maxLevel, setMaxLevel] = useState(0);   // 0: no upper limit
  const [finishedOnly, setFinishedOnly] = useState(true);
  const [data, setData] = useState<Metrics | null>(null);
  const [letters, setLetters] = useState<Letters | string | null>(null);   // a string: why they did not load
  const [invasions, setInvasions] = useState<Invasions | string | null>(null);   // likewise
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
    const get = <T,>(what: string) =>
      fetch(`${import.meta.env.VITE_API_URL}/metrics/${what}?days=${days}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<T>;
      });
    // The letters or the intrusions failing must not take the Scars down with
    // them: their tables reach a server with a module deploy, which can trail
    // wkserver's.
    Promise.all([
      get<Metrics>("scars"),
      get<Letters>("letters").catch((err: Error) => err.message),
      get<Invasions>("invasions").catch((err: Error) => err.message),
    ])
      .then(([d, l, i]) => { if (current) { setData(d); setLetters(l); setInvasions(i); setLoading(false); } })
      .catch((err) => { if (current) { setError(err.message); setLoading(false); } });
    return () => { current = false; };
  }, [days, authToken, reloads]);

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
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span aria-hidden="true">to</span>
          <select aria-label="Highest level" value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value))}>
            {LEVELS.filter((l) => l >= minLevel).map((l) => <option key={l} value={l}>{l}</option>)}
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

      {!loading && !error && typeof invasions === "string" && (
        <section className="economy__section" aria-labelledby="metrics-invasions">
          <h3 id="metrics-invasions">Intrusions</h3>
          <p role="alert" style={{ color: "#c0323a" }}>Error: {invasions}</p>
        </section>
      )}
      {!loading && !error && invasions && typeof invasions !== "string" && <InvasionsSection data={invasions} />}

      {!loading && !error && typeof letters === "string" && (
        <section className="economy__section" aria-labelledby="metrics-letters">
          <h3 id="metrics-letters">Crow Letters</h3>
          <p role="alert" style={{ color: "#c0323a" }}>Error: {letters}</p>
        </section>
      )}
      {!loading && !error && letters && typeof letters !== "string" && <LettersSection letters={letters} days={days} />}
    </div>
  );
}

export default MetricsPage;
