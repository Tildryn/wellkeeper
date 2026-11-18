import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./RuneIndexPage.css";

// The Rune Index: every glyph cut from the rune-bearing textures in the
// module's haks and the base game, for DMs to give meanings to together.
//
// The catalogue (sets, runes with thumbnails, source textures) and where
// each texture is already shown come from wkserver's /runes/catalogue and
// /runes/usage, which serve what the module's scripts/export_runes.py
// exports. The meanings, notes, and shortlist are rune_names, read from
// /runes/names: in full on opening, then every few seconds only what changed
// since, so a meaning another DM gives turns up on its own.
//
// Several DMs can have the page open at once, so a save names the values it
// started from and wkserver refuses a field someone else changed meanwhile
// (409). The panel then shows both and lets the DM keep theirs or take the
// other; nothing is overwritten unseen. While a rune's panel is open the page
// says so every 10 s (POST .../editing), and the panel and the grid show who
// else has a rune open.
//
// Many runes are one glyph in several textures (the Futhark letters turn up
// in half a dozen sets). DMs link those (POST .../same) into a group that is
// one rune from then on: one meaning, notes, and shortlist, written to every
// rune in it. The panel suggests lookalikes from the export's matcher, but
// a DM decides: no score can tell an M-shaped rune from an N-shaped one in a
// 7 px ring. Hide Duplicates shows each group once, by its clearest rune.

const API = import.meta.env.VITE_API_URL;
const auth = (token: string | null) => ({ Authorization: `Bearer ${token ?? ""}` });

const POLL_MS = 4000;
const HEARTBEAT_MS = 10_000;
const SAVE_DELAY_MS = 800;
const MEANING_MAX = 64;
const NOTES_MAX = 2000;

type Place =
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "arc"; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number };

type RuneSet = { id: string; label: string; family: string; where: string; count: number };
type Rune = { id: string; set: string; texture: string; place: Place | null; thumb: string };
type Texture = {
  hak: string; size: [number, number]; notes: string; variants: string[]; file: string;
  models: { model: string; hak: string; texture: string }[];
};
type Catalogue = { sets: RuneSet[]; textures: Record<string, Texture>; runes: Rune[] };

type Usage = {
  rows: { file: string; row: number; column: string; label: string; model: string; names: string[] }[];
  scripts: { script: string; source: string; include: boolean; via: string[]; spells: string[] }[];
  blueprints: { resref: string; name: string; row: number; palette: boolean; scripts: string[] }[];
  areas: { resref: string; name: string; dev: boolean; placeables: number; tiles: number; objects: string[] }[];
  items: { model: string; part: string; number: number; base_items: string[]; blueprints: string[] }[];
};
type UsageDoc = {
  textures: Record<string, Usage>;
  areas: Record<string, { resref: string; name: string }>;
  placed: { resref: string; area: string; count: number }[];
  lookalikes?: Record<string, [string, number][]>;
};

type Fields = { meaning: string; notes: string; shortlist: boolean };
type RuneName = Fields & { rune: string; group_id: string | null; version: number; updated_by: string; updated_at: number };
const BLANK: Fields = { meaning: "", notes: "", shortlist: false };

// Which of a group's runes stands for it with duplicates hidden: the
// clearest drawing, then the lowest id. The Spell Turning and Abjuration
// rings are 7 px a glyph, so they come last.
const SET_PRIORITY = ["hunt", "fut", "qpr", "cep", "arc2", "arc1", "arc3", "obl", "rcir", "plate", "tdm", "lay", "scr", "s16", "s1a", "s1b", "s1c"];
const priority = (r: Rune) => { const k = SET_PRIORITY.indexOf(r.set); return k < 0 ? SET_PRIORITY.length : k; };

const FAMILY_ORDER = ["Invented cursive", "Futhark-like", "Alchemical and zodiac", "Indic-looking", "Other", "Whole sigils"];

// Whether players can already have seen a texture, from where it is used.
// "shown": something in game puts it in front of them (a placeable in an area
// players reach, one placed in game, a script, a spell's visual). "possible":
// nothing does yet, but it is to hand (a blueprint in the DM Creator, a dev
// area, a weapon part the tailor offers). Effect rows alone do neither: a
// row nothing uses is never seen.
type Seen = "shown" | "possible" | "unused";
const SEEN_LABELS: Record<Seen, string> = { shown: "Shown in Game", possible: "Available", unused: "Not Used" };
const SEEN_TIPS: Record<Seen, string> = {
  shown: "Players can have seen this texture: something in game shows it.",
  possible: "Nothing in game shows it yet, but a DM, a dev area, or the tailor could.",
  unused: "Nothing in the module shows this texture that the export could find.",
};
const NON_SPELL_ROWS = new Set(["visualeffects", "placeables", "progfx"]);

function seenOf(u: Usage | undefined, placed: number): Seen {
  if (!u) return "unused";
  if (placed > 0 || u.areas.some((a) => !a.dev) || u.scripts.length || u.rows.some((r) => !NON_SPELL_ROWS.has(r.file)))
    return "shown";
  if (u.blueprints.length || u.items.length || u.areas.length) return "possible";
  return "unused";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// A texture's image, fetched with the token (an <img> cannot send one) and
// kept as a blob URL for the rest of the visit.
const textureUrls = new Map<string, Promise<string>>();
function textureUrl(file: string, token: string | null): Promise<string> {
  let url = textureUrls.get(file);
  if (!url) {
    url = fetch(`${API}/runes/images/${file}`, { headers: auth(token) }).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.blob();
    }).then((blob) => URL.createObjectURL(blob));
    url.catch(() => textureUrls.delete(file));
    textureUrls.set(file, url);
  }
  return url;
}

function SourceTexture({ texture, info, rune, token }: { texture: string; info: Texture; rune: Rune; token: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The panel is made afresh for each rune, so this starts blank.
    let live = true;
    textureUrl(info.file, token).then((u) => live && setUrl(u), () => live && setFailed(true));
    return () => { live = false; };
  }, [info.file, token]);

  const [w, h] = info.size;
  const p = rune.place;
  // The arc's outline: outer edge one way, inner edge back. Angles run
  // clockwise on screen from +x, as the survey cut them.
  const arc = (q: Extract<Place, { kind: "arc" }>) => {
    const pt = (r: number, a: number) => `${q.cx + r * Math.cos((a * Math.PI) / 180)} ${q.cy + r * Math.sin((a * Math.PI) / 180)}`;
    const large = q.a1 - q.a0 > 180 ? 1 : 0;
    return `M${pt(q.r1, q.a0)} A${q.r1} ${q.r1} 0 ${large} 1 ${pt(q.r1, q.a1)} L${pt(q.r0, q.a1)} A${q.r0} ${q.r0} 0 ${large} 0 ${pt(q.r0, q.a0)} Z`;
  };
  const stroke = Math.max(1.5, w / 160);
  return (
    <figure className="runes__source">
      <div className="runes__source-plate" style={{ aspectRatio: `${w} / ${h}` }}>
        {url && <img src={url} alt={`The whole texture ${texture}`} />}
        {!url && <span className="runes__muted">{failed ? "The texture could not be loaded." : "Loading the texture…"}</span>}
        {url && p && (
          <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {p.kind === "rect"
              ? <rect x={p.x0 - stroke} y={p.y0 - stroke} width={p.x1 - p.x0 + 2 * stroke} height={p.y1 - p.y0 + 2 * stroke} rx={stroke} strokeWidth={stroke} />
              : <path d={arc(p)} strokeWidth={stroke} />}
          </svg>
        )}
      </div>
      <figcaption>
        <code>{texture}</code> · {w}×{h} · {info.hak}
        {info.variants.length > 0 && <> · the same glyphs in <code>{info.variants.join(", ")}</code></>}
      </figcaption>
    </figure>
  );
}

function Section({ title, count, children, open }: { title: string; count: number; children: ReactNode; open?: boolean }) {
  if (!count) return null;
  return (
    <details className="runes__section" open={open}>
      <summary>{title} <span className="runes__count">{count.toLocaleString("en-US")}</span></summary>
      {children}
    </details>
  );
}

function UsageView({ usage, placed, areaNames, models }: {
  usage: Usage | undefined;
  placed: { resref: string; area: string; count: number }[];
  areaNames: UsageDoc["areas"];
  models: Texture["models"];
}) {
  if (!usage) return <p className="runes__muted">Where this is used is not known on this server.</p>;
  const shownAreas = usage.areas.filter((a) => !a.dev);
  const devAreas = usage.areas.filter((a) => a.dev);
  const scripts = usage.scripts;
  const effectRows = usage.rows.filter((r) => r.file === "visualeffects" || r.file === "progfx");
  const placeRows = usage.rows.filter((r) => r.file === "placeables");
  const otherRows = usage.rows.filter((r) => !NON_SPELL_ROWS.has(r.file));
  const areaLine = (a: Usage["areas"][number]) => (
    <li key={a.resref}>
      <b>{a.name || a.resref}</b> <code>{a.resref}</code>
      <span className="runes__muted"> · {[a.placeables && plural(a.placeables, "placeable"), a.tiles && plural(a.tiles, "tile")].filter(Boolean).join(", ")}
        {a.objects.length > 0 && ` · ${a.objects.slice(0, 4).join(", ")}${a.objects.length > 4 ? ", …" : ""}`}</span>
    </li>
  );
  return (
    <div className="runes__usage">
      <Section title="Areas" count={shownAreas.length} open>
        <ul>{shownAreas.map(areaLine)}</ul>
      </Section>
      <Section title="Placed in Game" count={placed.length} open>
        <ul>{placed.map((p) => (
          <li key={p.resref + p.area}><b>{areaNames[p.area]?.name ?? p.area}</b> <span className="runes__muted">· {plural(p.count, "placed")} <code>{p.resref}</code></span></li>
        ))}</ul>
      </Section>
      <Section title="Scripts" count={scripts.length} open={scripts.length <= 6}>
        <ul>{scripts.map((s) => (
          <li key={s.source + s.script}>
            <code>{s.script}</code>
            <span className="runes__muted">
              {s.source !== "module" && " (base game)"}{s.include && " (include)"} · {s.via.join(", ")}
              {s.spells.length > 0 && ` · run by ${s.spells.join(", ")}`}
            </span>
          </li>
        ))}</ul>
      </Section>
      <Section title="Spells and Other 2DAs" count={otherRows.length}>
        <ul>{otherRows.map((r) => (
          <li key={`${r.file}${r.row}${r.column}`}><code>{r.file}</code> {r.row} {r.label} <span className="runes__muted">· {r.column} <code>{r.model}</code></span></li>
        ))}</ul>
      </Section>
      <Section title="Blueprints" count={usage.blueprints.length}>
        <ul>{usage.blueprints.map((b) => (
          <li key={b.resref}><b>{b.name || b.resref}</b> <code>{b.resref}</code>
            <span className="runes__muted"> · placeable {b.row}{b.palette && " · in the DM Creator"}{b.scripts.length > 0 && ` · made by ${b.scripts.join(", ")}`}</span></li>
        ))}</ul>
      </Section>
      <Section title="Item Parts" count={usage.items.length}>
        <ul>{usage.items.map((i) => (
          <li key={i.model}><code>{i.model}</code> <span className="runes__muted">· the {i.part} of a {i.base_items.join(" or ")}, appearance {i.number}, which the tailor offers
            {i.blueprints.length > 0 && ` · on ${i.blueprints.join(", ")}`}</span></li>
        ))}</ul>
      </Section>
      <Section title="Dev Areas" count={devAreas.length}>
        <ul>{devAreas.map(areaLine)}</ul>
      </Section>
      <Section title="Visual Effects" count={effectRows.length}>
        <ul>{effectRows.map((r) => (
          <li key={`${r.file}${r.row}${r.column}`}>{r.file === "progfx" ? "progfx " : ""}{r.row} {r.names[0] ?? r.label}
            <span className="runes__muted"> · {r.column} <code>{r.model}</code></span></li>
        ))}</ul>
      </Section>
      <Section title="Placeable Appearances" count={placeRows.length}>
        <ul>{placeRows.map((r) => <li key={r.row}>{r.row} {r.label} <span className="runes__muted">· <code>{r.model}</code></span></li>)}</ul>
      </Section>
      <Section title="Models" count={models.length}>
        <ul>{models.map((m) => <li key={m.model + m.texture}><code>{m.model}</code> <span className="runes__muted">· {m.hak}{m.texture !== models[0]?.texture && <> · <code>{m.texture}</code></>}</span></li>)}</ul>
      </Section>
    </div>
  );
}

type Draft = { meaning: string; notes: string };
type Conflict = { field: "meaning" | "notes"; theirs: string; by: string };
type SaveState = "idle" | "saving" | "saved" | "error";

export default function RuneIndexPage({ authToken }: { authToken: string | null }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [usage, setUsage] = useState<UsageDoc | null>(null);
  const [names, setNames] = useState<Record<string, RuneName>>({});
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [namesError, setNamesError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const [setFilter, setSetFilter] = useState<string>("all");
  const [textureFilter, setTextureFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);
  const [hideDupes, setHideDupes] = useState(true);
  const [named, setNamed] = useState<"all" | "named" | "unnamed">("all");
  const [seen, setSeen] = useState<"all" | Seen>("all");
  const [current, setCurrent] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const sinceRef = useRef<number | null>(null);
  const namesRef = useRef(names);
  namesRef.current = names;

  // --- Loading --------------------------------------------------------------
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${API}/runes/catalogue`, { headers: auth(authToken) }).then((r) => {
        if (r.status === 404) throw new Error("This server has no Rune Index yet.");
        if (!r.ok) throw new Error(`The Rune Index could not be loaded (${r.status}).`);
        return r.json() as Promise<Catalogue>;
      }),
      fetch(`${API}/runes/usage`, { headers: auth(authToken) }).then((r) => (r.ok ? (r.json() as Promise<UsageDoc>) : null)),
    ]).then(([cat, use]) => {
      if (!live) return;
      setCatalogue(cat);
      setUsage(use);
    }, (e: Error) => live && setLoadError(e.message));
    return () => { live = false; };
  }, [authToken]);

  const mergeNames = useCallback((rows: RuneName[]) => {
    if (!rows.length) return;
    setNames((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!next[r.rune] || next[r.rune].version <= r.version) next[r.rune] = r;
      return next;
    });
  }, []);

  const poll = useCallback(async () => {
    const since = sinceRef.current;
    try {
      const res = await fetch(`${API}/runes/names${since === null ? "" : `?since=${since}`}`, { headers: auth(authToken), cache: "no-store" });
      if (res.status === 404) { setNamesError("Meanings cannot be saved on this server yet: its database has no table for them."); return; }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { now: number; names: RuneName[]; editing: Record<string, string[]> };
      sinceRef.current = body.now;
      mergeNames(body.names);
      setEditing(body.editing);
      setNamesError(null);
    } catch {
      setNamesError("Lost touch with the server; meanings will catch up when it answers.");
    }
    setClock(Date.now());
  }, [authToken, mergeNames]);

  useEffect(() => {
    poll();
    const t = setInterval(() => { if (document.visibilityState === "visible") poll(); }, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  // --- Filtering -------------------------------------------------------------
  const setsById = useMemo(() => Object.fromEntries((catalogue?.sets ?? []).map((s) => [s.id, s])), [catalogue]);
  const placedBy = useMemo(() => {
    const out: Record<string, { resref: string; area: string; count: number }[]> = {};
    if (!usage) return out;
    for (const [tex, u] of Object.entries(usage.textures)) {
      const mine = new Set(u.blueprints.map((b) => b.resref));
      out[tex] = usage.placed.filter((p) => mine.has(p.resref));
    }
    return out;
  }, [usage]);
  const seenBy = useMemo(() => {
    const out: Record<string, Seen> = {};
    for (const tex of Object.keys(catalogue?.textures ?? {}))
      out[tex] = seenOf(usage?.textures[tex], (placedBy[tex] ?? []).reduce((n, p) => n + p.count, 0));
    return out;
  }, [catalogue, usage, placedBy]);

  const runeById = useMemo(() => Object.fromEntries((catalogue?.runes ?? []).map((r) => [r.id, r])), [catalogue]);
  // group id -> its runes, the one that stands for it first.
  const groups = useMemo(() => {
    const out: Record<string, Rune[]> = {};
    for (const n of Object.values(names)) if (n.group_id && runeById[n.rune]) (out[n.group_id] ??= []).push(runeById[n.rune]);
    for (const g of Object.values(out)) g.sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
    return out;
  }, [names, runeById]);
  const groupOf = useCallback((id: string) => {
    const g = names[id]?.group_id;
    return g && groups[g] && groups[g].length > 1 ? groups[g] : null;
  }, [names, groups]);

  const visible = useMemo(() => {
    if (!catalogue) return [];
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return catalogue.runes.filter((r) => {
      if (hideDupes && !textureFilter && setFilter === "all") {
        const g = groupOf(r.id);
        if (g && g[0].id !== r.id) return false;
      }
      if (setFilter !== "all" && r.set !== setFilter) return false;
      if (textureFilter && r.texture !== textureFilter) return false;
      const n = names[r.id];
      if (onlyShort && !n?.shortlist) return false;
      if (named === "named" && !n?.meaning) return false;
      if (named === "unnamed" && n?.meaning) return false;
      if (seen !== "all" && seenBy[r.texture] !== seen) return false;
      if (words.length) {
        const hay = [r.id, r.texture, setsById[r.set]?.label ?? "", n?.meaning ?? "", n?.notes ?? ""].join(" ").toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [catalogue, setFilter, textureFilter, query, onlyShort, named, seen, names, seenBy, setsById, hideDupes, groupOf]);

  // --- The open rune ---------------------------------------------------------
  const rune = useMemo(() => catalogue?.runes.find((r) => r.id === current) ?? null, [catalogue, current]);
  const step = useCallback((d: number) => {
    if (!visible.length) return;
    const k = visible.findIndex((r) => r.id === current);
    const next = visible[(k + d + visible.length) % visible.length];
    setCurrent(next.id);
    document.getElementById(`rune-${next.id}`)?.scrollIntoView({ block: "nearest" });
  }, [visible, current]);

  // Say who has it open while it is.
  useEffect(() => {
    if (!current || namesError?.includes("no table")) return;
    const beat = () => fetch(`${API}/runes/names/${current}/editing`, { method: "POST", headers: auth(authToken) }).catch(() => {});
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(t);
      fetch(`${API}/runes/names/${current}/editing`, { method: "DELETE", headers: auth(authToken), keepalive: true }).catch(() => {});
    };
  }, [current, authToken, namesError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (!current || tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") setCurrent(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, step]);

  const copyList = async () => {
    if (!catalogue) return;
    const rows = catalogue.runes.filter((r) => names[r.id]?.meaning || names[r.id]?.shortlist).map((r) => {
      const n = names[r.id];
      return [r.id, n.meaning, n.shortlist ? "shortlisted" : "", n.notes.replace(/\s+/g, " "), r.texture].join("\t");
    });
    if (!rows.length) { setStatus("Nothing to copy yet: give a rune a meaning or shortlist one."); return; }
    try {
      await navigator.clipboard.writeText(["id\tmeaning\tshortlist\tnotes\ttexture", ...rows].join("\n"));
      setStatus(`Copied ${plural(rows.length, "rune")}, tab-separated.`);
    } catch {
      setStatus("The browser would not copy.");
    }
  };

  if (loadError) return <section className="runes"><h2 className="runes__title">Rune Index</h2><p className="runes__muted">{loadError}</p></section>;
  if (!catalogue) return <section className="runes"><h2 className="runes__title">Rune Index</h2><p role="status" className="runes__muted">Loading the runes…</p></section>;

  const nameCount = Object.values(names).filter((n) => n.meaning).length;
  const shortCount = Object.values(names).filter((n) => n.shortlist).length;
  const families = FAMILY_ORDER.filter((f) => catalogue.sets.some((s) => s.family === f));

  return (
    <section className="runes" aria-labelledby="runes-title">
      <header className="runes__header">
        <div className="runes__titlebar">
          <h2 id="runes-title" className="runes__title">Rune Index</h2>
          <p className="runes__tally">
            <b>{visible.length.toLocaleString("en-US")}</b> of {catalogue.runes.length.toLocaleString("en-US")} shown ·{" "}
            <b>{nameCount}</b> with meanings · <b>{shortCount}</b> shortlisted · {plural(Object.keys(catalogue.textures).length, "source texture")}
          </p>
        </div>
        <div className="runes__controls">
          <input className="runes__search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by id, texture, set, meaning, or notes" aria-label="Search runes" />
          <button type="button" className="runes__toggle" aria-pressed={onlyShort} onClick={() => setOnlyShort(!onlyShort)}>★ Shortlist</button>
          <button type="button" className="runes__toggle" aria-pressed={hideDupes} onClick={() => setHideDupes(!hideDupes)}
            title="Show each group of runes DMs have found to be the same once, by its clearest drawing. Within one set or texture every rune shows.">
            Hide Duplicates
          </button>
          <div className="runes__seg" role="group" aria-label="Meanings">
            {(["all", "named", "unnamed"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={named === v} onClick={() => setNamed(v)}>
                {{ all: "Any Meaning", named: "With Meanings", unnamed: "Without" }[v]}
              </button>
            ))}
          </div>
          <div className="runes__seg" role="group" aria-label="Seen by players">
            {(["all", "shown", "possible", "unused"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={seen === v} onClick={() => setSeen(v)} title={v === "all" ? undefined : SEEN_TIPS[v]}>
                {v === "all" ? "Seen or Not" : SEEN_LABELS[v]}
              </button>
            ))}
          </div>
          <button type="button" className="runes__ghost" onClick={copyList}>Copy Meanings</button>
        </div>
        <div className="runes__families">
          <div className="runes__family">
            <span>All</span>
            <div className="runes__chips">
            <button type="button" className="runes__chip" aria-pressed={setFilter === "all" && !textureFilter}
              onClick={() => { setSetFilter("all"); setTextureFilter(null); }}>Every Set <small>{catalogue.runes.length}</small></button>
            {textureFilter && (
              <button type="button" className="runes__chip" aria-pressed="true" onClick={() => setTextureFilter(null)}
                title="Showing one texture's runes. Click to show every texture again.">
                <code>{textureFilter}</code> ✕
              </button>
            )}
            </div>
          </div>
          {families.map((f) => (
            <div className="runes__family" key={f}>
              <span>{f}</span>
              <div className="runes__chips">
              {catalogue.sets.filter((s) => s.family === f).map((s) => (
                <button key={s.id} type="button" className="runes__chip" aria-pressed={setFilter === s.id} title={s.where}
                  onClick={() => { setSetFilter(s.id); setTextureFilter(null); }}>
                  {s.label} <small>{s.count}</small>
                </button>
              ))}
              </div>
            </div>
          ))}
        </div>
        <p className="runes__status" role="status">{namesError ?? status}</p>
      </header>

      <div className={`runes__layout${rune ? " runes__layout--open" : ""}`}>
        <div className="runes__grid">
          {visible.map((r) => {
            const n = names[r.id];
            const others = editing[r.id];
            const group = groupOf(r.id);
            return (
              <button key={r.id} id={`rune-${r.id}`} type="button" className={`runes__tile${r.set === "whole" ? " runes__tile--whole" : ""}`}
                aria-current={r.id === current ? "true" : undefined} onClick={() => setCurrent(r.id)}
                aria-label={`Rune ${r.id}${n?.meaning ? `, ${n.meaning}` : ""}`}>
                <span className={`runes__meaning${n?.meaning ? "" : " runes__meaning--none"}`} title={n?.meaning || undefined}>{n?.meaning || "·"}</span>
                <span className="runes__plate">
                  <img src={r.thumb} alt="" loading="lazy" decoding="async" />
                  {n?.shortlist && <span className="runes__star" aria-hidden="true">★</span>}
                  {seenBy[r.texture] === "shown" && <span className="runes__eye" title={SEEN_TIPS.shown} aria-hidden="true" />}
                  {group && <span className="runes__dupes" title={`The same rune as ${group.filter((g) => g.id !== r.id).map((g) => g.id).join(", ")}`}>×{group.length}</span>}
                  {others && <span className="runes__busy" title={`${others.join(", ")} ${others.length === 1 ? "has" : "have"} this open`} aria-hidden="true" />}
                </span>
                <span className="runes__id">{r.id}</span>
              </button>
            );
          })}
          {!visible.length && <p className="runes__empty">No runes match. Clear the search or pick another set.</p>}
        </div>

        {rune && (
          <RunePanel key={rune.id} rune={rune} set={setsById[rune.set]} texture={catalogue.textures[rune.texture]}
            name={names[rune.id]} others={editing[rune.id] ?? []} authToken={authToken} clock={clock}
            canSave={!namesError?.includes("no table")} seen={seenBy[rune.texture]}
            usage={usage?.textures[rune.texture]} placed={placedBy[rune.texture] ?? []} areaNames={usage?.areas ?? {}}
            siblings={catalogue.runes.filter((r) => r.texture === rune.texture).length}
            group={groupOf(rune.id)} runeById={runeById} setsById={setsById}
            lookalikes={(usage?.lookalikes?.[rune.id] ?? []).filter(([id]) => runeById[id])}
            onOpen={(id) => { setCurrent(id); document.getElementById(`rune-${id}`)?.scrollIntoView({ block: "nearest" }); }}
            onSaved={(n) => mergeNames(Array.isArray(n) ? n : [n])} onStep={step} onClose={() => setCurrent(null)}
            onShowTexture={() => { setTextureFilter(rune.texture); setSetFilter("all"); }} />
        )}
      </div>
    </section>
  );
}

function RunePanel({ rune, set, texture, name, others, authToken, clock, canSave, seen, usage, placed, areaNames, siblings,
  group, runeById, setsById, lookalikes, onOpen, onSaved, onStep, onClose, onShowTexture }: {
  rune: Rune; set: RuneSet | undefined; texture: Texture; name: RuneName | undefined; others: string[];
  authToken: string | null; clock: number; canSave: boolean; seen: Seen;
  usage: Usage | undefined; placed: UsageDoc["placed"]; areaNames: UsageDoc["areas"]; siblings: number;
  group: Rune[] | null; runeById: Record<string, Rune>; setsById: Record<string, RuneSet>; lookalikes: [string, number][];
  onOpen: (id: string) => void;
  onSaved: (n: RuneName | RuneName[]) => void; onStep: (d: number) => void; onClose: () => void; onShowTexture: () => void;
}) {
  const server: Fields = name ?? BLANK;
  // `base` is what the server had when the DM began typing over each field:
  // what a save is checked against. It moves on when a save lands, or when
  // the server's value changes under a field the DM has not touched.
  const [draft, setDraft] = useState<Draft>({ meaning: server.meaning, notes: server.notes });
  const [base, setBase] = useState<Draft>({ meaning: server.meaning, notes: server.notes });
  const [conflict, setConflictState] = useState<Conflict | null>(null);
  // Read by a save scheduled before the clash was settled, so it sees now.
  const conflictRef = useRef<Conflict | null>(null);
  const setConflict = (c: Conflict | null) => { conflictRef.current = c; setConflictState(c); };
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baseRef = useRef(base);
  baseRef.current = base;

  // Another DM's save arriving: taken in for a field this DM has not
  // touched, and left for the clash check where they have.
  useEffect(() => {
    for (const f of ["meaning", "notes"] as const) {
      if (draftRef.current[f] === baseRef.current[f] && server[f] !== baseRef.current[f]) {
        setDraft((d) => ({ ...d, [f]: server[f] }));
        setBase((b) => ({ ...b, [f]: server[f] }));
      }
    }
  }, [server.meaning, server.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (changes: Partial<Fields>, from: Partial<Fields>): Promise<RuneName | { conflict: RuneName } | null> => {
    const res = await fetch(`${API}/runes/names/${rune.id}`, {
      method: "PATCH", headers: { ...auth(authToken), "Content-Type": "application/json" },
      body: JSON.stringify({ changes, base: from }),
    });
    if (res.status === 409) return { conflict: ((await res.json()) as { name: RuneName }).name };
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `The server said ${res.status}.`);
    }
    const body = (await res.json()) as { name: RuneName; names?: RuneName[] };
    // A rune in a group saves to them all; take every one in.
    if (body.names?.length) onSaved(body.names);
    return body.name;
  }, [rune.id, authToken, onSaved]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current || !canSave) return;
    const d = draftRef.current, b = baseRef.current;
    const fields = (["meaning", "notes"] as const).filter((f) => d[f].trim() !== b[f].trim() && conflictRef.current?.field !== f);
    if (!fields.length) return;
    inFlight.current = true;
    setSaveState("saving");
    try {
      const changes = Object.fromEntries(fields.map((f) => [f, d[f]]));
      const from = Object.fromEntries(fields.map((f) => [f, b[f]]));
      const result = await send(changes, from);
      if (result && "conflict" in result) {
        const theirs = result.conflict;
        onSaved(theirs);
        const f = fields.find((x) => theirs[x] !== b[x]) ?? fields[0];
        setConflict({ field: f, theirs: theirs[f], by: theirs.updated_by });
        setSaveState("idle");
      } else if (result) {
        onSaved(result);
        // The server tidies what it stores (a meaning is one line); show
        // that only where the DM has not typed on since.
        setBase((cur) => ({ ...cur, ...Object.fromEntries(fields.map((f) => [f, result[f]])) }));
        setDraft((cur) => ({ ...cur, ...Object.fromEntries(fields.filter((f) => cur[f] === d[f]).map((f) => [f, result[f]])) }));
        setSaveState("saved");
        setSaveError("");
      }
    } catch (e) {
      setSaveState("error");
      setSaveError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [canSave, send, onSaved]);

  // Save a pause after typing stops, and on leaving the field or the rune.
  const edit = (f: "meaning" | "notes", value: string) => {
    setDraft((d) => ({ ...d, [f]: value }));
    setSaveState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, SAVE_DELAY_MS);
  };
  useEffect(() => () => { flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = async (keep: "mine" | "theirs") => {
    if (!conflict) return;
    const f = conflict.field;
    if (keep === "theirs") {
      setDraft((d) => ({ ...d, [f]: conflict.theirs }));
      setBase((b) => ({ ...b, [f]: conflict.theirs }));
      setConflict(null);
      return;
    }
    setBase((b) => ({ ...b, [f]: conflict.theirs }));
    baseRef.current = { ...baseRef.current, [f]: conflict.theirs };
    setConflict(null);
    setTimeout(() => { flush(); }, 0);
  };

  const toggleStar = async () => {
    if (!canSave) return;
    const now = !server.shortlist;
    try {
      const result = await send({ shortlist: now }, { shortlist: server.shortlist });
      if (result && "conflict" in result) onSaved(result.conflict);
      else if (result) onSaved(result);
    } catch (e) {
      setSaveState("error");
      setSaveError((e as Error).message);
    }
  };

  const dirty = draft.meaning.trim() !== base.meaning.trim() || draft.notes.trim() !== base.notes.trim();
  const SEEN_LINE: Record<Seen, string> = {
    shown: "Players can have seen this rune: the module shows its texture.",
    possible: "Not shown to players yet, but it is to hand: see below.",
    unused: "Nothing in the module shows this texture that the export could find.",
  };

  return (
    <aside className="runes__panel" aria-label={`Rune ${rune.id}`}>
      <div className="runes__row">
        <button type="button" className="runes__ghost" onClick={() => onStep(-1)} aria-label="Previous rune">←</button>
        <button type="button" className="runes__ghost" onClick={() => onStep(1)} aria-label="Next rune">→</button>
        <button type="button" className="runes__ghost runes__close" onClick={onClose}>Close</button>
      </div>

      <div className="runes__panel-head">
        <div className={`runes__big${rune.set === "whole" ? " runes__big--whole" : ""}`}><img src={rune.thumb} alt={`Rune ${rune.id}`} /></div>
        <div>
          <h3 className="runes__panel-id">{rune.id}</h3>
          <p className="runes__muted">{set?.label}</p>
          <button type="button" className="runes__toggle" aria-pressed={server.shortlist} onClick={toggleStar} disabled={!canSave}>
            ★ {server.shortlist ? "Shortlisted" : "Shortlist"}
          </button>
        </div>
      </div>

      {others.length > 0 && (
        <p className="runes__others" role="status">{others.join(", ")} {others.length === 1 ? "has" : "have"} this rune open too.</p>
      )}

      <label className="runes__field">
        <span>Meaning</span>
        <input type="text" value={draft.meaning} maxLength={MEANING_MAX} disabled={!canSave}
          placeholder="What does this rune stand for?"
          onChange={(e) => edit("meaning", e.target.value)} onBlur={() => flush()}
          onKeyDown={(e) => { if (e.key === "Enter") flush(); }} />
      </label>
      <label className="runes__field">
        <span>Notes</span>
        <textarea value={draft.notes} maxLength={NOTES_MAX} disabled={!canSave} rows={3}
          placeholder="Why, alternatives, where it should appear…"
          onChange={(e) => edit("notes", e.target.value)} onBlur={() => flush()} />
      </label>

      {conflict && (
        <div className="runes__conflict" role="alert">
          <p><b>{conflict.by}</b> changed the {conflict.field} while you were typing. Theirs:</p>
          <blockquote>{conflict.theirs || <i>(blank)</i>}</blockquote>
          <div className="runes__row">
            <button type="button" className="runes__toggle" onClick={() => resolve("mine")}>Keep Mine</button>
            <button type="button" className="runes__ghost" onClick={() => resolve("theirs")}>Use Theirs</button>
          </div>
        </div>
      )}

      <p className="runes__saved" aria-live="polite">
        {!canSave ? "Meanings cannot be saved on this server yet."
          : saveState === "saving" ? "Saving…"
          : saveState === "error" ? `Not saved: ${saveError} Edit again to retry.`
          : dirty ? "Unsaved"
          : name && (name.meaning || name.notes || name.shortlist) ? `Saved · last changed by ${name.updated_by}, ${ago(name.updated_at, clock)}`
          : ""}
      </p>

      <SameRune rune={rune} group={group} runeById={runeById} setsById={setsById} lookalikes={lookalikes}
        authToken={authToken} canSave={canSave} onOpen={onOpen} onSaved={onSaved} />

      <h4 className="runes__h">Source</h4>
      <SourceTexture texture={rune.texture} info={texture} rune={rune} token={authToken} />
      {siblings > 1 && (
        <button type="button" className="runes__ghost" onClick={onShowTexture}>Show All {siblings} Runes From This Texture</button>
      )}
      {texture.notes && <p className="runes__notes">{texture.notes}</p>}

      <h4 className="runes__h">Seen by Players</h4>
      <p className={`runes__seen runes__seen--${seen}`}>{SEEN_LINE[seen]}</p>
      <UsageView usage={usage} placed={placed} areaNames={areaNames} models={texture.models} />
    </aside>
  );
}

// The runes this one is the same as, and the ones it looks like, to link.
function SameRune({ rune, group, runeById, setsById, lookalikes, authToken, canSave, onOpen, onSaved }: {
  rune: Rune; group: Rune[] | null; runeById: Record<string, Rune>; setsById: Record<string, RuneSet>;
  lookalikes: [string, number][]; authToken: string | null; canSave: boolean;
  onOpen: (id: string) => void; onSaved: (n: RuneName[]) => void;
}) {
  const [choose, setChoose] = useState<{ other: string; meanings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inGroup = new Set((group ?? []).map((r) => r.id));
  const suggestions = lookalikes.filter(([id]) => !inGroup.has(id) && id !== rune.id);

  const call = async (method: "POST" | "DELETE", target: string, body?: object) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/runes/names/${target}/same`, {
        method, headers: { ...auth(authToken), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      const out = await res.json().catch(() => ({})) as { names?: RuneName[]; meanings?: string[]; error?: string };
      if (res.status === 409 && out.meanings) return out.meanings;
      if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}.`);
      if (out.names) onSaved(out.names);
      return null;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const link = async (other: string, meaning?: string) => {
    const meanings = await call("POST", rune.id, meaning === undefined ? { with: other } : { with: other, meaning });
    setChoose(meanings ? { other, meanings } : null);
  };

  const chip = (r: Rune, extra: ReactNode) => (
    <li key={r.id} className="runes__like">
      <button type="button" className="runes__like-plate" onClick={() => onOpen(r.id)} aria-label={`Open rune ${r.id}`}>
        <img src={r.thumb} alt="" />
      </button>
      <span className="runes__like-id"><code>{r.id}</code><small>{setsById[r.set]?.label}</small></span>
      {extra}
    </li>
  );

  return (
    <>
      {group && (
        <>
          <h4 className="runes__h">The Same Rune As</h4>
          <ul className="runes__likes">
            {group.filter((r) => r.id !== rune.id).map((r) => chip(r,
              <button type="button" className="runes__ghost runes__small" disabled={busy || !canSave}
                onClick={() => call("DELETE", r.id)} title={`Take ${r.id} out of this group; it keeps the meaning.`}>Not the Same</button>))}
          </ul>
        </>
      )}
      {suggestions.length > 0 && (
        <>
          <h4 className="runes__h">Looks Like</h4>
          <p className="runes__notes">The closest drawings by shape. Only link the ones that are truly the same rune.</p>
          <ul className="runes__likes">
            {suggestions.map(([id, score]) => {
              const r = runeById[id];
              return chip(r, <>
                <span className="runes__score" title="How alike the two drawings are, by shape alone">{Math.round(score * 100)}%</span>
                <button type="button" className="runes__toggle runes__small" disabled={busy || !canSave} onClick={() => link(id)}>Same Rune</button>
              </>);
            })}
          </ul>
        </>
      )}
      {choose && (
        <div className="runes__conflict" role="alert">
          <p>These two have different meanings. Keep which for both?</p>
          <div className="runes__row">
            {choose.meanings.map((m) => (
              <button key={m} type="button" className="runes__toggle" disabled={busy} onClick={() => link(choose.other, m)}>{m}</button>
            ))}
            <button type="button" className="runes__ghost" onClick={() => setChoose(null)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="runes__saved">Not linked: {error}</p>}
    </>
  );
}
