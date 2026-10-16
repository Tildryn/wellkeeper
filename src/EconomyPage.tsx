import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
// range shown has some of it. `prefixes` claims every reason starting with
// one of them, for reasons the game makes up as it goes (a store's
// "store_" and its tag), where a reason named outright still wins.
type Series = { key: string; label: string; color: string; reasons: string[]; reasonLabels?: Record<string, string>; retired?: boolean; prefixes?: string[] };

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
  // Reasons the game once recorded under this resource and no longer does,
  // left out of every chart and table rather than shown as Other.
  ignorePrefixes?: string[];
};

const OTHER = "var(--eco-other)";

// Rot by kind of food, as the game records it ("rot_" and the kind). Wheat
// and Grey Soup as Foodstock are history: the farms' wheat became potatoes on
// Oct 12, and Grey Soup was taken out of the Foodstock on Oct 10. It came back
// on Oct 13 as pots of its own, whose rot is in their own sections.
const ROT_REASONS = ["rot_berries", "rot_fish", "rot_mushrooms", "rot_meat", "rot_potatoes", "rot_wheat", "rot_greysoup"];
const ROT_LABELS: Record<string, string> = {
  rot_berries: "Rotted: berries", rot_fish: "Rotted: fish", rot_mushrooms: "Rotted: mushrooms", rot_meat: "Rotted: meat",
  rot_potatoes: "Rotted: potatoes", rot_wheat: "Rotted: wheat (before Oct 12)", rot_greysoup: "Rotted: Grey Soup (as Foodstock, before Oct 10)",
};

const RESOURCES: ResourceConfig[] = [
  {
    resource: "food",
    title: "Food Stores",
    // The figures are the Food & Labour model's starting values
    // (pw_inc_foodmodel in the module, version 2): its workplaces, output
    // per worker, ration baselines, and who feeds whom, and
    // pw_inc_foodstore's diet, room, and rot. Building and Forestry have no
    // slots while there is nothing to build with and the woods are too
    // dangerous, so the Council's Labourers are nobody and their people are
    // Free Labour. The Council's 3,514 a day: Tradespeople 61 x 14, Skilled
    // Workers 20 x 11, Free Labour 47 x 11, Mothers 16 x 14, Elders 80 x 11,
    // and Children 91 x 9. The Dredgers' 702: 32 x 18 and 9 x 14; the
    // Millers' 904: 30 x 18 and 26 x 14. (The Reeves and the mill each
    // gained their Provisioner on Oct 13.)
    description: "The town's stores of Foodstock, not counting the factions' larders; the town's Grey Soup pot, further down, takes room in them too. The Dredgers' boats and the Millers' fields bring food in every hour, at the pace each faction's own Labourers can work and at the faction's Morale: at full strength about 3,040 a day of fish, more or less with the day's sea (71–133% most days, next to nothing in a storm one day in fifty), and 660 from the farms, 88% of it potatoes and the rest meat. Each of Blight Control's ten posts not effectively manned, counting its worker at the Millers' Labourers' strength and the Millers' Morale, costs the farms 2% of their harvest, a fifth with all ten empty. Each faction sends the town the share its officer sets, 70% for the Dredgers and nothing for the Millers to start, and keeps the rest in its own larder, which feeds its own workers and which it can release to the town later. Foodstock handed in adds to the stores too. The Council feeds 315 villagers in seven ration groups from the stores, at the rations set in the Town Food Ledger: 3,514 a day at the baselines, of which the workers (the Reeves, the crafts and trades, and the Skilled Workers) eat 1,074 and the dependants (Free Labour, Mothers, Elders, and Children) 2,440. Its own Labourers are nobody while Building and Forestry are closed. The Dredgers' 41 workers (702 a day) and the Millers' 56 (904 a day, more than their whole harvest) eat from their larders instead, and the Council can send food to either from the stores, without seeing inside. Snacks, meals, thrown food, and rot take from the stores as well, and so do the Millers, who guard the granary and can quietly take from it into their larder: the game keeps that out of this history, so it shows only in the box below. Everyone eats a mix, by diet: fish 57%, berries 15%, mushrooms 12%, potatoes 10%, and meat 6%, and more of the rest when one runs short; a Council group whose ration falls short of its baseline makes up the rest from the Grey Soup pot while it lasts. The stores are one space of 60 m³ that every kind shares by the room it takes packed for keeping, from a tenth of a litre for meat to nearly two for mushrooms, and food that does not fit is turned away. Food is eaten oldest first, and whatever is left when it passes its shelf life spoils: berries after three days, fish (smoked) after four, mushrooms after five, meat after six, and potatoes after months.",
    // Grouped as the Town Food Ledger's chart groups them in game
    // (GetFoodChartCategory in pw_inc_foodui), with the ration groups in its
    // three bands. Retired series hold history from before the model. The
    // Council's Labourers were the fishers and the farm hands until Oct 13,
    // when the factions began to feed their own, and are nobody since.
    gains: [
      { key: "farming", label: "Farming (the Millers' share)", color: "var(--eco-brown)", reasons: ["farming", "livestock"], reasonLabels: { farming: "Farming: potatoes", livestock: "Farming: livestock" } },
      { key: "fishing", label: "Fishing (the Dredgers' share)", color: "var(--eco-violet)", reasons: ["fishing"] },
      { key: "release", label: "Released from the larders", color: "var(--eco-olive)", reasons: ["release_dredgers", "release_millers"], reasonLabels: { release_dredgers: "Released: the Dredgers' larder", release_millers: "Released: the Millers' larder" } },
      { key: "handin", label: "Foodstock handed in", color: "var(--eco-green)", reasons: ["handin"] },
      { key: "greysoup", label: "Grey Soup (retired)", color: "var(--eco-gold)", reasons: ["greysoup"], retired: true },
    ],
    losses: [
      { key: "labourers", label: "Rations: Labourers", color: "var(--eco-vermilion)", reasons: ["ration_labourers"] },
      { key: "workers", label: "Rations: other workers", color: "var(--eco-blue)", reasons: ["ration_tradespeople", "ration_skilled"], reasonLabels: { ration_tradespeople: "Rations: Tradespeople", ration_skilled: "Rations: Skilled Workers" } },
      { key: "dependants", label: "Rations: dependants", color: "var(--eco-magenta)", reasons: ["ration_free", "ration_mothers", "ration_elders", "ration_children"], reasonLabels: { ration_free: "Rations: Free Labour", ration_mothers: "Rations: Mothers", ration_elders: "Rations: Elders", ration_children: "Rations: Children" } },
      // The colour of the releases above: the same road, the other way.
      { key: "supply", label: "Sent to the factions' larders", color: "var(--eco-olive)", reasons: ["supply_dredgers", "supply_millers"], reasonLabels: { supply_dredgers: "Sent to the Dredgers' larder", supply_millers: "Sent to the Millers' larder" } },
      { key: "villagers", label: "Eaten by villagers (before the ration groups)", color: "var(--eco-aqua)", reasons: ["villagers", "villagers_soup"], reasonLabels: { villagers: "Eaten by villagers", villagers_soup: "Grey Soup eaten by villagers" }, retired: true },
      { key: "meals", label: "Meals and snacks", color: "var(--eco-yellow)", reasons: ["meal", "snack", "thrown", "purchase"], reasonLabels: { meal: "Meals bought (3 each)", snack: "Snacks bought", thrown: "Thrown from the food baskets", purchase: "Bought before Sep 23 (snack or meal)" } },
      { key: "decay", label: "Passive decay (200 a day, before the baselines)", color: "var(--eco-lavender)", reasons: ["decay"], retired: true },
      { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ROT_REASONS, reasonLabels: ROT_LABELS },
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

// Food on the Granaries tab, gold on the Treasuries.
const FOOD = RESOURCES.find((c) => c.resource === "food")!;
const GOLD = RESOURCES.find((c) => c.resource === "gold")!;

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
    { key: "food", label: "Food", color: "var(--eco-orange)",
      reasons: ["store_foodmealrh", "store_foodsnackrh", "store_foodgreyrh", "store_foodmealdr", "store_foodsnackdr", "store_foodmealml", "store_foodsnackml", "store_foodgreyml"],
      reasonLabels: {
        store_foodmealrh: "Meals at the Refuge", store_foodsnackrh: "Snacks at the Refuge", store_foodgreyrh: "Grey Soup at the Refuge",
        store_foodmealdr: "Meals from Kelo", store_foodsnackdr: "Snacks from Kelo",
        store_foodmealml: "Meals from the Provisioner", store_foodsnackml: "Snacks from the Provisioner", store_foodgreyml: "Grey Soup from the Provisioner",
      } },
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
  store_dredgebartender: "Kelo, the Dredgers' bar",
  store_reeveprov: "The Reeve Provisioner",
  store_normmerch: "Trustworthy Shopkeep",
  dialogue: "Other payments in conversation",
  dm: "Taken by a DM",
};

const spendLabel = (reason: string) => {
  const s = SPENDING.gains.find((s) => s.reasons.includes(reason));
  return s?.reasonLabels?.[reason] ?? s?.label ?? OTHER_SPEND_LABELS[reason]
    ?? (reason.startsWith("store_") ? `Store ${reason.slice(6)}` : reason.replace(/_/g, " "));
};

// The gold the game pays characters (gold_paid), by what it paid for:
// "store_" and the store's tag for an item sold, the way gold_spent names a
// purchase, and a reason of its own for each kind of reward. Only gold the
// game creates belongs here: the Hand-In Bounty, the wage packets, and the
// starting purse once the Treasury is live, come out of a Treasury chest, and
// are in its sections below. The game recorded wage packets here until
// 2026-10-15; those rows are ignored.
const PAID: ResourceConfig = {
  resource: "gold_paid",
  title: "Gold Paid to Characters",
  description: "The gold the game creates in players' hands, recorded as it is paid: items sold to a store, under the store; scrap, and Scar fragments traded in at Dazai's (the fragments then go to the Millers, to brew into Grey Soup); patrol and survey rewards; experience traded for gold; the Prize's takings, shared among her crew; gold found in lootables; gold a DM hands out; and each new character's starting purse while the Treasury is not live. DM characters are left out, and so is gold handed between players or paid out of a Treasury chest, such as the Hand-In Bounty and the wage packets.",
  gains: [
    { key: "sales", label: "Sold to stores", color: "var(--eco-blue)", reasons: [], prefixes: ["store_"] },
    { key: "fragments", label: "Scar fragments", color: "var(--eco-violet)", reasons: ["fragments"] },
    { key: "scrap", label: "Scrap", color: "var(--eco-brown)", reasons: ["scrap_nick", "scrap_merchant"], reasonLabels: { scrap_nick: "Scrap to Nine Fingered Nick", scrap_merchant: "Scrap to a merchant" } },
    { key: "work", label: "Patrols and surveys", color: "var(--eco-green)", reasons: ["patrol", "survey"], reasonLabels: { patrol: "Patrols", survey: "Surveys" } },
    { key: "xp", label: "Experience traded for gold", color: "var(--eco-yellow)", reasons: ["xp_for_gold"] },
    { key: "prize", label: "The Prize", color: "var(--eco-orange)", reasons: ["prize"] },
    { key: "loot", label: "Looted", color: "var(--eco-aqua)", reasons: ["loot"] },
    { key: "purses", label: "Starting purses", color: "var(--eco-olive)", reasons: ["starting_purse"] },
    { key: "dm", label: "Given by a DM", color: "var(--eco-gold)", reasons: ["dm"] },
  ],
  losses: [],
  totalLabel: "Paid",
  flowsLabel: "Gold paid per day",
  ignorePrefixes: ["wages_"],
};

const paidLabel = (reason: string) => {
  const s = seriesOf(PAID, reason);
  return s?.reasonLabels?.[reason]
    ?? (reason.startsWith("store_") ? `Sold to ${spendLabel(reason).replace(/^Store /, "store ")}` : s?.label ?? reason.replace(/_/g, " "));
};

// The words a payments section uses, spending or paying.
type PaymentWords = {
  done: string; perDayNote: string; mostLabel: string; byTitle: string; of: string; column: string; recordSign: 1 | -1;
};
const SPEND_WORDS: PaymentWords = {
  done: "Spent", perDayNote: "Purchases and fees", mostLabel: "Most Spent On", byTitle: "By Store and Service",
  of: "of the gold spent", column: "Store or Service",
  // The game records a payment as the negative change it makes.
  recordSign: -1,
};
const PAID_WORDS: PaymentWords = {
  done: "Paid", perDayNote: "Sales and rewards", mostLabel: "Most Paid For", byTitle: "By What It Was Paid For",
  of: "of the gold paid", column: "Paid For", recordSign: 1,
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

// The series that claims a reason, by its name or else by a prefix.
function seriesOf(config: ResourceConfig, reason: string): Series | undefined {
  const all = [...config.gains, ...config.losses];
  return all.find((s) => s.reasons.includes(reason)) ?? all.find((s) => s.prefixes?.some((p) => reason.startsWith(p)));
}

// Everything a resource's flows fold into: one bucket per series, plus
// "other" for any reason no series claims (DM adjustments, thrown food, ...).
type DayFlows = { t: number; bySeries: Record<string, number>; byReason: Record<string, { amount: number; events: number }>; net: number };

function foldFlows(flows: Flow[], config: ResourceConfig): DayFlows[] {
  const owner = new Map<string, string | undefined>();
  const days = new Map<number, DayFlows>();
  for (const [t, reason, amount, events] of flows) {
    const k = dayKey(t);
    let d = days.get(k);
    if (!d) { d = { t: k, bySeries: {}, byReason: {}, net: 0 }; days.set(k, d); }
    if (!owner.has(reason)) owner.set(reason, seriesOf(config, reason)?.key);
    const key = owner.get(reason) ?? (amount >= 0 ? "other_gain" : "other_loss");
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
    const s = seriesOf(config, reason);
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

// Where gold is spent, or where the game pays it out, from the payments the
// game records, charted upwards either way.
function PaymentsSection({ history, now, config, words, nameOf }: { history: History; now: number; config: ResourceConfig; words: PaymentWords; nameOf: (reason: string) => string }) {
  const flows = useMemo(() => history.flows
    .filter(([, r]) => !config.ignorePrefixes?.some((p) => r.startsWith(p)))
    .map(([t, r, a, e]): Flow => [t, r, words.recordSign * a, e]), [history, words, config]);
  const days = useMemo(() => foldFlows(flows, config), [flows, config]);

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
  const groupKey = (r: string) => seriesOf(config, r)?.key ?? "other";
  const groups = [...config.gains, { key: "other", label: "Other", color: OTHER, reasons: [] as string[] }]
    .map((g) => {
      const members = [...byReason]
        .filter(([r]) => groupKey(r) === g.key)
        .map(([reason, x]) => ({ reason, ...x }))
        .sort((a, b) => b.amount - a.amount);
      return { ...g, members, amount: members.reduce((s, x) => s + x.amount, 0), events: members.reduce((s, x) => s + x.events, 0) };
    })
    .filter((g) => g.amount > 0);
  // Largest first, with Other always last.
  const ranked = [...groups.filter((g) => g.key !== "other").sort((a, b) => b.amount - a.amount), ...groups.filter((g) => g.key === "other")];
  const top = ranked[0]?.key === "other" ? null : ranked[0];
  const groupOf = (reason: string) => seriesOf(config, reason)?.label ?? "Other";
  const rows = [...byReason].map(([reason, x]) => ({ reason, ...x })).sort((a, b) => b.amount - a.amount);

  return (
    <section className="economy__section" aria-labelledby={`eco-${config.resource}`}>
      <h3 id={`eco-${config.resource}`}>{config.title}</h3>
      <p className="economy__sub">{config.description}</p>

      {flows.length === 0 ? <p className="economy__empty">Nothing recorded in this range yet.</p> : (
        <>
          <div className="economy__stats">
            <div className="economy__stat">
              <span className="economy__stat-label">{words.done} per Day</span>
              <span className="economy__stat-value economy__stat-value--hero">{weekFlows.length ? fmt(perDay) : "–"}</span>
              <span className="economy__stat-note">
                {!weekFlows.length ? "Nothing in the last 7 days" : `Average over the last ${weekDays >= 6.9 ? "7 days" : `${weekDays.toFixed(1)} days`}`}
              </span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">Payments per Day</span>
              <span className="economy__stat-value">{weekFlows.length ? fmt(paymentsPerDay) : "–"}</span>
              <span className="economy__stat-note">{weekFlows.length ? `${words.perDayNote}, over the same days` : "Nothing in the last 7 days"}</span>
            </div>
            <div className="economy__stat">
              <span className="economy__stat-label">{words.done} in Range</span>
              <span className="economy__stat-value">{fmt(total)}</span>
              <span className="economy__stat-note">{fmt(rows.reduce((s, x) => s + x.events, 0))} payments</span>
            </div>
            {top && (
              <div className="economy__stat">
                <span className="economy__stat-label">{words.mostLabel}</span>
                <span className="economy__stat-value">{share(top.amount, total)}</span>
                <span className="economy__stat-note">{top.label}, over the range shown</span>
              </div>
            )}
          </div>

          <div className="economy__card">
            <h4>{words.byTitle}</h4>
            <div className="demo-bars">
              {ranked.map((g) => (
                <BarRow key={g.key} label={g.label} value={fmt(g.amount)} max={ranked.reduce((m, x) => Math.max(m, x.amount), 0)}
                  muted={g.key === "other"}
                  segments={[{ n: g.amount, className: `eco-seg--${g.key}` }]}
                  tip={<>
                    <strong>{g.label}</strong>
                    <span>{share(g.amount, total)} {words.of} · {fmt(g.events)} payments, {fmt(g.amount / g.events)} each on average</span>
                    {(g.members.length > 1 || g.key === "other") && g.members.slice(0, 12).map((x) => (
                      <span key={x.reason} className="economy__tip-row">{nameOf(x.reason)}<b>{fmt(x.amount)}</b></span>
                    ))}
                  </>} />
              ))}
            </div>
          </div>

          <div className="economy__card">
            <h4>{words.done} per Day</h4>
            <div className="economy__legend" aria-hidden="true">
              {config.gains.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
              <span><i style={{ background: OTHER }} />Other</span>
            </div>
            <FlowChart days={days} config={config} />
            <details className="economy__details">
              <summary>Show as a table</summary>
              <div className="economy__table-wrap">
                <table>
                  <thead>
                    <tr><th>{words.column}</th><th>Group</th><th>Gold</th><th>Payments</th><th>Average</th><th>Share</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((x) => (
                      <tr key={x.reason}>
                        <td>{nameOf(x.reason)}</td>
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
// potatoes, which keep. Hand-ins from before Oct 12 call those "wheat", and
// count with them (kindKey).
const FOOD_KINDS: { key: string; label: string }[] = [
  { key: "fish", label: "Fish" },
  { key: "berries", label: "Berries" },
  { key: "mushrooms", label: "Mushrooms" },
  { key: "meat", label: "Meat" },
  { key: "potatoes", label: "Other provisions" },
];

// The kind a stored or handed-in amount counts as: the game kept the farms'
// food as "wheat" until it became potatoes on Oct 12.
const kindKey = (k: string) => (k === "wheat" ? "potatoes" : k);
const byKind = (kinds: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(kinds)) out[kindKey(k)] = (out[kindKey(k)] ?? 0) + n;
  return out;
};

// How many of the leaderboard get a bar; the table under it has everyone.
const LEADERBOARD_BARS = 20;

const kindsText = (raw: Record<string, number>) => {
  const kinds = byKind(raw);
  return FOOD_KINDS.filter((k) => kinds[k.key]).map((k) => `${fmt(kinds[k.key])} ${k.label.toLowerCase()}`).join(", ");
};

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
      for (const [k, n] of Object.entries(byKind(kinds))) c.kinds[k] = (c.kinds[k] ?? 0) + n;
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

// The kinds of food as the stores keep them, with the litres one Foodstock of
// each takes up packed for keeping (GetFoodTypeVolume) and the real days it
// takes half of it to rot (GetFoodTypeHalfLifeDays). A store is one space
// that every kind shares.
const STOCK_KINDS: { key: string; label: string; litres: number; halfLife: number }[] = [
  { key: "fish", label: "Fish", litres: 0.15, halfLife: 3 },
  { key: "potatoes", label: "Potatoes", litres: 0.42, halfLife: 120 },
  { key: "meat", label: "Meat", litres: 0.1, halfLife: 4 },
  { key: "berries", label: "Berries", litres: 0.7, halfLife: 2 },
  { key: "mushrooms", label: "Mushrooms", litres: 1.9, halfLife: 3 },
];

// The room in each store, in litres: the town's (FOOD_TOWN_STORE_LITRES in
// pw_inc_foodstore) and the factions' larders (FOOD_DREDGERS_LARDER_LITRES
// and FOOD_MILLERS_LARDER_LITRES in pw_inc_foodmodel).
const TOWN_STORE_LITRES = 60000;
const LARDER_LITRES: Record<string, number> = { dredgers: 8000, millers: 12000 };

const volume = (litres: number) =>
  litres < 1000 ? `${fmt(litres)} L` : `${(litres / 1000).toLocaleString("en-US", { maximumFractionDigits: litres < 10000 ? 1 : 0 })} m³`;

// What else takes room in a store besides Foodstock, from the game's
// constants (GREY_SOUP_BOWL_LITRES in pw_inc_foodstore, SCAR_FRAGMENT_LITRES
// in pw_inc_foodmodel): the Grey Soup pots, in the town's stores and the
// Millers' larder, and the Millers' Scar Fragments. Neither is Foodstock, so
// neither counts in a store's level, but the room they take is room the food
// cannot have.
type StoreExtra = { key: string; label: string; unit: string; n: number; litres: number; keeps: string };
const greySoupExtra = (n: number): StoreExtra =>
  ({ key: "soup", label: "Grey Soup", unit: "bowls", n, litres: 0.4, keeps: "Half of it rots in a day" });
const fragmentsExtra = (n: number): StoreExtra =>
  ({ key: "fragments", label: "Scar Fragments", unit: "fragments", n, litres: 0.05, keeps: "Never spoils" });

// How much of a store's room each kind takes, from a level's detail.stock,
// and anything else kept there (`extras`).
function StockCard({ stock: raw, litres, title, extras = [] }: { stock: Record<string, number>; litres: number; title: string; extras?: StoreExtra[] }) {
  const stock = byKind(raw);
  const total = Object.values(stock).reduce((s, n) => s + n, 0);
  const room = (k: { key: string; litres: number }) => (stock[k.key] ?? 0) * k.litres;
  const used = STOCK_KINDS.reduce((s, k) => s + room(k), 0) + extras.reduce((s, x) => s + x.n * x.litres, 0);
  const free = Math.max(0, litres - used);
  return (
    <div className="economy__card">
      <h4>{title}</h4>
      <p className="demo-note">
        One space that every kind shares, by the room each takes packed for keeping{extras.length ? `, with the ${extras.map((x) => x.label).join(" and ")} kept beside them` : ""}. Food that does not fit is turned away.
      </p>
      <div className="demo-bars">
        <BarRow label="Room Used" value={`${volume(used)} / ${volume(litres)}`} max={litres}
          segments={[
            ...STOCK_KINDS.map((k) => ({ n: room(k), className: `eco-kind--${k.key}` })),
            ...extras.map((x) => ({ n: x.n * x.litres, className: `eco-kind--${x.key}` })),
          ]}
          tip={<>
            <strong>{share(used, litres)} full</strong>
            <span>{fmt(total)} Foodstock{extras.some((x) => x.n) ? ` and ${extras.filter((x) => x.n).map((x) => `${fmt(x.n)} ${x.unit}`).join(" and ")}` : ""} in {volume(used)} · room for {fmt(free / 0.15)} more fish, or {fmt(free / 0.42)} potatoes</span>
            {STOCK_KINDS.filter((k) => stock[k.key]).map((k) => (
              <span key={k.key} className="economy__tip-row"><i className={`eco-kind--${k.key}`} />{k.label}<b>{volume(room(k))}</b></span>
            ))}
            {extras.filter((x) => x.n).map((x) => (
              <span key={x.key} className="economy__tip-row"><i className={`eco-kind--${x.key}`} />{x.label}<b>{volume(x.n * x.litres)}</b></span>
            ))}
          </>} />
        {STOCK_KINDS.map((k) => {
          const n = stock[k.key] ?? 0;
          return (
            <BarRow key={k.key} label={k.label} value={fmt(n)} max={litres}
              segments={[{ n: room(k), className: `eco-kind--${k.key}` }]}
              tip={<>
                <strong>{k.label}</strong>
                <span>{fmt(n)} Foodstock, {share(n, total)} of the food in store · {volume(room(k))}, {share(room(k), litres)} of the room</span>
                <span>{k.litres} litres each · {k.halfLife >= 100 ? "Keeps for months" : `Half of it rots in ${k.halfLife} days`}</span>
              </>} />
          );
        })}
        {extras.map((x) => (
          <BarRow key={x.key} label={x.label} value={fmt(x.n)} max={litres}
            segments={[{ n: x.n * x.litres, className: `eco-kind--${x.key}` }]}
            tip={<>
              <strong>{x.label}</strong>
              <span>{fmt(x.n)} {x.unit}, not Foodstock · {volume(x.n * x.litres)}, {share(x.n * x.litres, litres)} of the room</span>
              <span>{x.litres} litres each · {x.keeps}</span>
            </>} />
        ))}
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
          ? `A day, with no room in store or larder: fish ${fmt(by("fishing"))}, potatoes ${fmt(by("farming"))}, meat ${fmt(by("livestock"))}`
          : "None in the last 7 days"}
      </span>
    </div>
  );
}

// What the Millers took from the town's stores into their larder without
// the Council's say (granary_taken: flows alone, positive, by the faction
// that took it). The game keeps these out of the town's food history on
// purpose, so the Council's ledger never names them and neither does the
// Food Stores chart above; DMs see them here.
const GRANARY: ResourceConfig = {
  resource: "granary_taken",
  title: "Taken from the Granary",
  description: "",
  gains: [{ key: "millers", label: "Taken by the Millers", color: "var(--eco-vermilion)", reasons: ["millers"] }],
  losses: [],
  totalLabel: "Taken",
  flowsLabel: "Taken from the granary per day",
};

// The Millers quietly taking from the town's stores: what they took over
// the range shown, by day, beside the stores whose fall it leaves
// unexplained.
function GranaryCard({ history }: { history: History }) {
  const days = useMemo(() => foldFlows(history.flows, GRANARY), [history]);
  const taken = history.flows.reduce((s, f) => s + f[2], 0);
  const times = history.flows.reduce((s, f) => s + f[3], 0);
  return (
    <div className="economy__card">
      <h4>Taken by the Millers, Unrecorded</h4>
      <p className="demo-note">
        The Millers guard and work the town's granary, and their officer can take food from it into their own larder. By law nothing leaves it without the Council's say, and nothing tells the Council: the game keeps these withdrawals out of the stores' history, so the chart below never names them and the stores simply hold less than their ins and outs explain. Players never see this; it is shown here for DMs.
      </p>
      {taken === 0 ? <p className="economy__empty">Nothing taken in the range shown.</p> : (
        <>
          <p className="demo-note">{fmt(taken)} Foodstock taken over the range shown, in {fmt(times)} {times === 1 ? "withdrawal" : "withdrawals"}.</p>
          <FlowChart days={days} config={GRANARY} />
        </>
      )}
    </div>
  );
}

// The same as a figure beside the stores' own: a daily average over the
// last 7 days, like the Added and Removed figures, which leave it out.
function GranaryStat({ history, now }: { history: History; now: number }) {
  const { week, perDay } = perDayOverWeek(history.flows, now);
  return (
    <div className="economy__stat">
      <span className="economy__stat-label">Taken by the Millers</span>
      <span className={`economy__stat-value${week.length ? " economy__neg" : ""}`}>{week.length ? fmt(perDay((f) => f[2])) : "0"}</span>
      <span className="economy__stat-note">{week.length ? "A day from the granary, unrecorded in the stores' history" : "Nothing from the granary in the last 7 days"}</span>
    </div>
  );
}

// Each faction's larder (food_dredgers, food_millers), with the faction's
// name for the figures beside it. The faction's two ration groups eat from
// it as their kind of group ("ration_labourers"), so `workers` in
// larderConfig names who each of them is.
type LarderInfo = { faction: string; name: string; config: ResourceConfig };

const larderConfig = (faction: string, title: string, description: string, workers: [string, string], extraGains: Series[] = []): ResourceConfig => ({
  resource: `food_${faction}`,
  title,
  description,
  gains: [
    { key: "kept", label: "Kept back", color: "var(--eco-green)", reasons: ["kept"] },
    { key: "supplied", label: "Sent by the Council", color: "var(--eco-blue)", reasons: ["supplied"] },
    ...extraGains,
  ],
  losses: [
    { key: "rations", label: "Rations: the faction's workers", color: "var(--eco-magenta)", reasons: ["ration_labourers", "ration_tradespeople"],
      reasonLabels: { ration_labourers: `Rations: ${workers[0]}`, ration_tradespeople: `Rations: ${workers[1]}` } },
    { key: "meals", label: "Meals and snacks", color: "var(--eco-yellow)", reasons: ["meal", "snack"], reasonLabels: { meal: "Meals bought (3 each)", snack: "Snacks bought" } },
    { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ROT_REASONS, reasonLabels: ROT_LABELS },
    { key: "released", label: "Released to the town", color: "var(--eco-olive)", reasons: ["released"] },
  ],
  otherLabels: { dm: "DM changes" },
});

// From version 2 of the food model (pw_inc_foodmodel): each faction feeds
// its own workers from its larder, at rations its officer sets, and the
// Council can send it food it never sees inside. The figures are the
// model's: the Dredgers' 32 fishers at 18 and 9 at 14, the fish processors and their Provisioner, 702
// a day; the Millers' 30 farm hands and Blight Control at 18 and 23 at the
// mill at 14, 904 a day, against a harvest of about 660.
const FACTION_LARDERS: LarderInfo[] = [
  {
    faction: "dredgers", name: "the Dredgers",
    config: larderConfig("dredgers", "The Dredgers' Larder",
      "What the Dredgers keep back of the fish they land: everything their share does not send to the town's stores, a share set by the holder of a Dredger Trustee's Badge, 70% to start. It feeds their own 41 workers, the 32 fishers and the 9 fish processors and Provisioner, at rations the Trustee sets: 702 a day at the baselines. The Council can send it food from the town's stores, without seeing inside. It has room in the hold of their ship and the barrels at their camp, 8 m³, about 53,000 fish, and rots as the town's stores do, until it is released to the town. Kelo sells snacks and meals from it aboard the ship, to feed the faction's members, at the Refuge's prices while it is well stocked and dearer as it runs low. The Dredgers keep no Grey Soup, so their workers have nothing to fall back on when it runs short.",
      ["fishers (Labourers)", "fish processors (Tradespeople)"]),
  },
  {
    faction: "millers", name: "the Millers",
    config: larderConfig("millers", "The Millers' Larder",
      "What the Millers keep back of the potatoes and meat their farms bring in: everything their share does not send to the town's stores, a share set by the holder of a Miller Logistics Badge, nothing to start. It feeds their own 56 workers, the 30 farm hands and Blight Control and the 26 at the mill, at rations the officer sets: 904 a day at the baselines, more than the whole harvest at full strength (about 660), so the Millers cannot feed their own without the Council's supplies or the granary, which they guard and can quietly take from. Their Scar Fragments and Grey Soup take room in it too, and their hungry workers fall back on the soup. It has room on the mill's floor and in its basement, 12 m³, about 28,500 potatoes, and rots as the town's stores do, until it is released to the town. The Provisioner sells snacks, meals, and Grey Soup from it at the mill, to feed the faction's members, the food at the Refuge's prices while it is well stocked and dearer as it runs low.",
      ["farm hands and Blight Control (Labourers)", "the mill (Tradespeople)"],
      [{ key: "granary", label: "Taken from the town's granary", color: "var(--eco-vermilion)", reasons: ["granary"] }]),
  },
];

// What came with version 2 of the food model, Oct 13: the Grey Soup pots,
// the Millers' fragments, and what the Millers take from the granary.
const GREY_SOUP_RESOURCES = ["grey_soup", "grey_soup_millers", "fragments_millers", "granary_taken"];

// The Grey Soup and the Scar Fragments it is brewed from (pw_inc_foodstore
// and pw_inc_foodmodel in the module), in bowls and fragments: the town's
// pot (grey_soup), the Millers' pot in their larder (grey_soup_millers), and
// their fragments (fragments_millers). "fragments" in the town's pot is
// history from the first hour of the pots, before the fragments went to the
// Millers.
const GREY_SOUP: ResourceConfig = {
  resource: "grey_soup",
  title: "The Town's Grey Soup",
  description: "The town's Grey Soup pot, in bowls. Grey Soup is not Foodstock, and no one eats it by choice. The Millers brew it from the Scar Fragments players hand in at Dazai's, a bowl a fragment, keep a day of what their own hungry workers need, and send the town every other bowl, with anything over that reserve each hour and all of it when they release their larder. The Refuge sells from the pot, and no shop sells from an empty one. Any of the Council's groups whose ration, as the stores gave it, falls short of its baseline makes up the rest from it while it lasts, a bowl for a Foodstock, and if it cannot cover them all each gets the same share of what it lacks. Soup holds off weight loss, lost output, and deaths, but not unhappiness: a group loses half a point of morale for each percent of its baseline made up with soup, and a point for each percent made up with nothing, so living wholly on soup heads for 50 and eating nothing at all for 0. Each bowl takes 0.4 litres of the town's stores, and what is left of it a day after brewing spoils.",
  gains: [
    { key: "millers", label: "Sent by the Millers", color: "var(--eco-olive)", reasons: ["from_millers"] },
    { key: "fragments", label: "Scar Fragments handed in (Oct 13, before the Millers)", color: "var(--eco-blue)", reasons: ["fragments"], retired: true },
  ],
  losses: [
    { key: "rations", label: "Eaten by the Council's hungry groups", color: "var(--eco-magenta)", reasons: ["rations"] },
    { key: "sold", label: "Sold at the Refuge", color: "var(--eco-yellow)", reasons: ["sold"] },
    { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ["rot"] },
  ],
  otherLabels: { dm: "DM changes" },
};

const MILLERS_SOUP: ResourceConfig = {
  resource: "grey_soup_millers",
  title: "The Millers' Grey Soup",
  description: "The Grey Soup the Millers keep in their larder, in bowls: the first of every batch they brew, up to a day of what their own workers' rations, as the larder last fed them, leave short of the baseline, which is nothing while it feeds them in full. Their hungry workers make up their shortfall from it, and the Provisioner sells it at the mill. Every other bowl goes to the town's pot as it is brewed, whatever is over the reserve follows it each hour, and releasing the larder sends all of it. Each bowl takes 0.4 litres of the larder's room, and half of it rots in a day.",
  gains: [{ key: "brewed", label: "Brewed and kept", color: "var(--eco-olive)", reasons: ["brewed"] }],
  losses: [
    { key: "rations", label: "Eaten by the Millers' hungry workers", color: "var(--eco-magenta)", reasons: ["rations"] },
    { key: "sold", label: "Sold by the Provisioner", color: "var(--eco-yellow)", reasons: ["sold"] },
    { key: "to_town", label: "Sent to the town's pot", color: "var(--eco-aqua)", reasons: ["to_town", "released"], reasonLabels: { to_town: "Sent to the town's pot: over the reserve", released: "Sent to the town's pot: released" } },
    { key: "rot", label: "Rotted", color: "var(--eco-rot)", reasons: ["rot"] },
  ],
  otherLabels: { dm: "DM changes" },
};

const FRAGMENTS: ResourceConfig = {
  resource: "fragments_millers",
  title: "The Millers' Scar Fragments",
  description: "The Scar Fragments handed in at Dazai's, who still pays gold for each, go to the Millers, who keep them in their larder, 0.05 litres each, never spoiling, and brew them into Grey Soup as their officer sets, a fragment to a bowl, one a minute. Brewing is worked out from the clock, so it carries on through a restart, and it waits rather than wastes a fragment when there is no room for the soup. They started on Oct 13 with 5,540: the fragments handed in since Sep 29, less the 1,810 bowls the Refuge had already sold.",
  gains: [
    { key: "handin", label: "Handed in at Dazai's", color: "var(--eco-blue)", reasons: ["handin"] },
    { key: "seed", label: "Counted in at the start (Oct 13)", color: "var(--eco-lavender)", reasons: ["seed"] },
  ],
  losses: [{ key: "brewed", label: "Brewed into Grey Soup", color: "var(--eco-olive)", reasons: ["brewed"] }],
  otherLabels: { dm: "DM changes" },
};

// The room a store's Grey Soup takes, as a stat beside its chart.
function RoomTakenStat({ litres, of, where }: { litres: number; of: number; where: string }) {
  return (
    <div className="economy__stat">
      <span className="economy__stat-label">Room Taken</span>
      <span className="economy__stat-value">{volume(litres)}</span>
      <span className="economy__stat-note">{share(litres, of)} of {where}</span>
    </div>
  );
}

// The Millers' brewing, from the fragments sample's detail. The game brings
// the brewing up to the clock only when something looks at it, at least
// every in-game hour, so `brewing` can be a little behind: a bowl a minute
// has gone on since `brewSince`, as far as there were fragments and room.
type BrewDetail = { brewing: number; brewSince: number | null };

function BrewingStat({ detail, fragments, now }: { detail: BrewDetail | null | undefined; fragments: number; now: number }) {
  const set = detail?.brewing ?? 0;
  const due = detail?.brewSince ? Math.max(0, Math.floor((now - detail.brewSince) / 60)) : 0;
  const left = Math.max(0, Math.min(set, fragments) - due);
  return (
    <div className="economy__stat">
      <span className="economy__stat-label">Brewing</span>
      <span className="economy__stat-value">{set ? fmt(left) : "–"}</span>
      <span className="economy__stat-note">
        {!set ? "Nothing set brewing" : left ? `Fragments still to brew, about ${left >= 90 ? `${Math.round(left / 60)} hours` : `${left} minutes`} at a bowl a minute` : "Should be done by now, room allowing"}
      </span>
    </div>
  );
}

// The ration groups in the game's order, by who feeds them: the Council's
// seven from the town's stores, then the Dredgers' and the Millers' own
// workers from their larders (version 2 of the model; a sample from before
// has only the seven, and the rest are left out). Each one's baseline, the
// Foodstock a day that keeps one of it comfortable at full output, comes
// with the sample, from the game (GetFoodGroupBaseline), as does the group
// each workplace's workers are in (GetFoodWorkRationGroup): the page keeps
// only their names, as the game gives them (GetFoodGroupName).
const FEEDERS: { key: string; label: string; store: string }[] = [
  { key: "council", label: "The Council", store: "the town's stores" },
  { key: "dredgers", label: "The Dredgers", store: "their larder" },
  { key: "millers", label: "The Millers", store: "their larder" },
];

const RATION_GROUPS: { key: string; label: string; feeder: string }[] = [
  { key: "labourers", label: "Labourers", feeder: "council" },
  { key: "tradespeople", label: "Tradespeople", feeder: "council" },
  { key: "skilled", label: "Skilled Workers", feeder: "council" },
  { key: "free", label: "Free Labour", feeder: "council" },
  { key: "mothers", label: "Mothers", feeder: "council" },
  { key: "elders", label: "Elders", feeder: "council" },
  { key: "children", label: "Children", feeder: "council" },
  { key: "dredgers_labourers", label: "Dredgers' Labourers", feeder: "dredgers" },
  { key: "dredgers_tradespeople", label: "Dredgers' Tradespeople", feeder: "dredgers" },
  { key: "millers_labourers", label: "Millers' Labourers", feeder: "millers" },
  { key: "millers_tradespeople", label: "Millers' Tradespeople", feeder: "millers" },
];

const WORKPLACES: [string, string][] = [
  ["fishing", "Fishing"], ["farmland", "Farmland"], ["blight", "Blight Control"], ["building", "Building"],
  ["forestry", "Forestry"], ["mining", "Mining"], ["reeves", "Reeves"], ["millers", "Millers"], ["crafts", "Crafts & Trades"],
  ["fishproc", "Fish Processing"], ["skilled", "Skilled Roles"],
];
const groupLabel = (key: string | undefined) => RATION_GROUPS.find((g) => g.key === key)?.label ?? "–";

// Weight lost as the game names it (GetFoodReserveState).
const reserves = (loss: number) =>
  loss >= 0.25 ? "Exhausted" : loss >= 0.15 ? "Underweight" : loss >= 0.05 ? "Thin" : "Healthy";

// `baseline` is null in a sample from a model the game saved before it wrote
// one, and a workplace's group is missing from a wkserver from before then.
// `fed` counts the Grey Soup eaten, and `soup` is that part of it, both as
// fractions of the baseline. `morale` is the whole of how the group feels,
// its food and the Treasury's pressures together; it drifts toward
// `moraleTarget`, and `moraleFood` is where food alone would put it. The
// rest, and who feeds the group, are missing from a wkserver from before
// Oct 13, and the targets from a model saved before the game wrote them.
type RationGroup = {
  people: number; feeder?: string; ration: number; baseline?: number | null; fed: number; soup?: number; loss: number;
  morale: number; moraleFood?: number | null; moraleTarget?: number | null; output: number;
};
type VillagersDetail = { groups: Record<string, RationGroup>; work: Record<string, [number, number, string?]>; shares: Record<string, number> };

// Deaths from hunger (the villagers' flows, negative, as "died_" and the
// group's key), charted upwards in the same three bands as the rations, the
// factions' own workers in a fourth, and the infants lost to under-fed
// Mothers. The Labourers were the fishers and the farm hands until Oct 13.
const DEATHS: ResourceConfig = {
  resource: "villagers",
  title: "Deaths from Hunger",
  description: "",
  gains: [
    { key: "labourers", label: "Labourers", color: "var(--eco-vermilion)", reasons: ["died_labourers"] },
    { key: "workers", label: "Other workers", color: "var(--eco-blue)", reasons: ["died_tradespeople", "died_skilled"], reasonLabels: { died_tradespeople: "Tradespeople", died_skilled: "Skilled Workers" } },
    { key: "dependants", label: "Dependants", color: "var(--eco-magenta)", reasons: ["died_free", "died_mothers", "died_elders", "died_children"], reasonLabels: { died_free: "Free Labour", died_mothers: "Mothers", died_elders: "Elders", died_children: "Children" } },
    { key: "factions", label: "The factions' workers", color: "var(--eco-aqua)",
      reasons: ["died_dredgers_labourers", "died_dredgers_tradespeople", "died_millers_labourers", "died_millers_tradespeople"],
      reasonLabels: { died_dredgers_labourers: "Dredgers' Labourers", died_dredgers_tradespeople: "Dredgers' Tradespeople", died_millers_labourers: "Millers' Labourers", died_millers_tradespeople: "Millers' Tradespeople" } },
    { key: "infants", label: "Infants", color: "var(--eco-yellow)", reasons: ["died_infants"] },
  ],
  losses: [],
  totalLabel: "Died",
  flowsLabel: "Deaths from hunger per day",
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

// The share of its harvest Blight Control's ten posts cost the farms, from
// the model's figures (GetFoodBlightPostsManned and GetFoodBlightFactor in
// pw_inc_foodmodel): a post counts as manned only as far as its worker
// works, at the Millers' Labourers' output and the Millers' Morale, and
// each one short costs 2%. The Morale is the Treasury's (treasury_purse);
// without it the faction works at full strength, as the game has it.
const BLIGHT_LOSS_PER_POST = 0.02;

function blightPosts(detail: VillagersDetail, millersMorale: number | undefined) {
  const [workers, posts] = detail.work.blight ?? [0, 0];
  const output = (detail.groups.millers_labourers ?? detail.groups.labourers)?.output ?? 1;
  const manned = Math.min(posts, workers * output * (millersMorale ?? 100) / 100);
  return { posts, manned, lost: Math.min(1, BLIGHT_LOSS_PER_POST * (posts - manned)) };
}

function VillagersSection({ history, millersMorale }: { history: History; millersMorale?: number }) {
  const { levels, latest } = history;
  const detail = latest?.detail as VillagersDetail | null | undefined;
  const deaths = useMemo(() => history.flows.map(([t, r, a, e]): Flow => [t, r, -a, e]), [history]);
  const days = useMemo(() => foldFlows(deaths, DEATHS), [deaths]);
  const died = deaths.reduce((s, f) => s + f[2], 0);
  const infants = deaths.filter((f) => f[1] === "died_infants").reduce((s, f) => s + f[2], 0);
  // The faction groups only where the sample has them; the Council's seven
  // always, as the game's defaults where one is missing.
  const groups = RATION_GROUPS
    .filter((g) => g.feeder === "council" || detail?.groups[g.key])
    .map((g) => ({ ...g, ...(detail?.groups[g.key] ?? { people: 0, ration: 0, fed: 1, loss: 0, morale: 100, output: 1 }) }));
  const people = groups.reduce((s, g) => s + g.people, 0);
  const morale = people ? groups.reduce((s, g) => s + g.morale * g.people, 0) / people : 0;
  const lowest = groups.filter((g) => g.people > 0).sort((a, b) => a.morale - b.morale)[0];
  // Whose output the boats and the fields work at: the factions' own
  // Labourers, or the Council's in a sample from before they had their own.
  const workerGroup = (key: string) => groups.find((g) => g.key === key) ?? groups[0];
  const fishers = workerGroup("dredgers_labourers"), farmHands = workerGroup("millers_labourers");
  const blight = detail ? blightPosts(detail, millersMorale) : null;
  const feeders = FEEDERS.map((f) => {
    const members = groups.filter((g) => g.feeder === f.key);
    return {
      ...f, members,
      people: members.reduce((s, g) => s + g.people, 0),
      need: members.reduce((s, g) => s + g.people * (g.baseline ?? 0), 0),
      rations: members.reduce((s, g) => s + g.people * g.ration, 0),
    };
  }).filter((f) => f.members.length);
  const moraleShown = groups.some((g) => g.moraleTarget != null);
  const start = levels[0];
  const labelOf = (reason: string) => {
    const s = DEATHS.gains.find((s) => s.reasons.includes(reason));
    return s?.reasonLabels?.[reason] ?? s?.label ?? reason.replace(/_/g, " ");
  };

  return (
    <section className="economy__section" aria-labelledby="eco-villagers">
      <h3 id="eco-villagers">Villagers</h3>
      <p className="economy__sub">
        The town's people as the food model last saved them: how well each ration group is fed, how it feels, and what hunger has cost. The Council feeds seven groups from the town's stores, at the rations set in the Town Food Ledger; the Dredgers and the Millers feed their own workers from their larders, at rations their officers set. A group whose ration, as its store gave it, falls short of its baseline makes up the rest from its Grey Soup pot while it lasts: the town's for the Council's groups, the Millers' for theirs, and none for the Dredgers', who keep none. Soup feeds the body but not the spirits. Short of that, a group works more slowly at once, then loses weight, and once Underweight or Exhausted it starts to die, the Elders and Children first; under-fed Mothers lose infants. Need falls as people lose weight, so a moderate shortfall settles thin but stable. The fishers' and the farm hands' output is the pace the boats and fields work at, so starving them starves everyone.
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
          <span className="economy__stat-label">Fishers' Output</span>
          <span className={`economy__stat-value${detail && fishers.output < 1 ? " economy__neg" : ""}`}>{detail ? pct(fishers.output) : "–"}</span>
          <span className="economy__stat-note">The pace the boats work at</span>
        </div>
        <div className="economy__stat">
          <span className="economy__stat-label">Farm Hands' Output</span>
          <span className={`economy__stat-value${detail && farmHands.output < 1 ? " economy__neg" : ""}`}>{detail ? pct(farmHands.output) : "–"}</span>
          <span className="economy__stat-note">The pace the fields and Blight Control work at</span>
        </div>
        {blight && blight.posts > 0 && (
          <div className="economy__stat">
            <span className="economy__stat-label">Blight Control</span>
            <span className={`economy__stat-value${blight.lost >= 0.005 ? " economy__neg" : ""}`}>{blight.manned.toFixed(1)} / {fmt(blight.posts)}</span>
            <span className="economy__stat-note">
              Posts effectively manned · the Blight takes {blight.lost >= 0.005 ? `${(blight.lost * 100).toFixed(blight.lost < 0.1 ? 1 : 0)}%` : "none"} of the harvest{millersMorale === undefined ? "" : `, at the Millers' Morale of ${fmt(millersMorale)}`}
            </span>
          </div>
        )}
      </div>

      {detail && (
        <div className="economy__card">
          <h4>Ration Groups</h4>
          <p className="demo-note">
            Rations are Foodstock a head a day. Fed is the last hour's food against the group's baseline, Grey Soup included, and Soup is how much of the baseline was soup.{moraleShown && " Morale is the whole of how a group feels: its food, and the Treasury's pressures on top (the Hearth Tax, the Council's own wages for the Council's groups, and the Reeves' watch). It moves toward its Target every hour, quickly down and slowly up; Food Alone is where its food alone would put it, so the gap between Target and Food Alone is the Treasury's doing."}
          </p>
          <div className="economy__table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="economy__cell-left">Group</th><th>People</th><th>Ration</th><th>Baseline</th><th>Fed</th><th>Soup</th>
                  <th>Weight Lost</th><th className="economy__cell-left">Reserves</th><th>Morale</th>
                  {moraleShown && <><th>Target</th><th>Food Alone</th></>}
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {feeders.map((f) => (
                  <Fragment key={f.key}>
                    {feeders.length > 1 && (
                      <tr className="economy__row-head">
                        <th colSpan={moraleShown ? 12 : 10} className="economy__cell-left">
                          {f.label}, from {f.store} · {fmt(f.people)} people, {fmt(f.rations)} a day at these rations{f.need ? `, ${fmt(f.need)} at the baselines` : ""}
                        </th>
                      </tr>
                    )}
                    {f.members.map((g) => (
                      <tr key={g.key}>
                        <td className="economy__cell-left">{g.label}</td>
                        <td>{fmt(g.people)}</td>
                        <td>{fmt(g.ration)}</td>
                        <td>{g.baseline == null ? "–" : fmt(g.baseline)}</td>
                        <td className={g.fed < 0.995 ? "economy__neg" : undefined}>{pct(g.fed)}</td>
                        <td>{g.soup ? pct(g.soup) : "–"}</td>
                        <td>{g.loss > 0 ? `${(g.loss * 100).toFixed(1)}%` : "–"}</td>
                        <td className={`economy__cell-left${g.loss >= 0.15 ? " economy__neg" : ""}`}>{reserves(g.loss)}</td>
                        <td>{fmt(g.morale)}</td>
                        {moraleShown && <>
                          <td>{g.moraleTarget == null ? "–" : fmt(g.moraleTarget)}</td>
                          <td>{g.moraleFood == null ? "–" : fmt(g.moraleFood)}</td>
                        </>}
                        <td>{pct(g.output)}</td>
                      </tr>
                    ))}
                  </Fragment>
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
                  {WORKPLACES.map(([key, label]) => (
                    <tr key={key}>
                      <td className="economy__cell-left">{label}</td>
                      <td className="economy__cell-left">{groupLabel(detail.work[key]?.[2])}</td>
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

// --- The village Treasury ----------------------------------------------------
//
// The Council's Treasury and the coffers around it (pw_inc_treasury in the
// module), sampled by wkserver once the game has opened it. Gold reaches the
// Council only as tax: the shops keep their takings, less the sales tax,
// and the villagers' coin wages pay the Hearth Tax.

const TREASURY_RESOURCES = ["treasury", "treasury_purse", "treasury_villagers", "treasury_merchants", "treasury_tax", "treasury_fines"];

// The factions with a treasury of their own, as the game keys them.
const PURSE_FACTIONS: [string, string][] = [["dredgers", "The Dredgers"], ["millers", "The Millers"], ["reeves", "The Reeves"]];
const perFaction = (suffix: string, prefix = "") => PURSE_FACTIONS.map(([f]) => `${prefix}${f}${suffix}`);
const perFactionLabels = (suffix: string, prefix: string, label: string) =>
  Object.fromEntries(PURSE_FACTIONS.map(([f, name]) => [`${prefix}${f}${suffix}`, `${label}: ${name.replace("The ", "the ")}`]));

const TREASURY: ResourceConfig = {
  resource: "treasury",
  title: "The Council's Treasury",
  description: "The Council's own chest, run by the holder of the Advisor's Brooch. Sales tax reaches it when a Clerk empties the village's Tax Boxes and pays the takings in; the Hearth Tax takes a share of the coin wages paid to the villagers; and the Refuge pays a fixed Wholesale Price for each Foodstock it serves. Out of it come the coin wages of the workers the Council employs itself, the round sum it allocates each faction a day, the wage packets of its own employees (the Advisor, the Clerks, and the holders of a Village Worker's Badge), the Hand-In Bounty paid for Foodstock, and each new character's starting purse. Nothing else can take gold out of it.",
  gains: [
    { key: "deposit", label: "Paid in (taxes and deposits)", color: "var(--eco-blue)", reasons: ["deposit"] },
    { key: "hearth", label: "Hearth Tax", color: "var(--eco-aqua)", reasons: ["hearth_tax"] },
    { key: "wholesale", label: "Wholesale food (the Refuge)", color: "var(--eco-orange)", reasons: ["wholesale"] },
  ],
  losses: [
    { key: "wages", label: "Council workers' wages", color: "var(--eco-vermilion)", reasons: ["npc_wages"] },
    { key: "alloc", label: "Allocations to the factions", color: "var(--eco-violet)", reasons: perFaction("", "alloc_"), reasonLabels: perFactionLabels("", "alloc_", "Allocation") },
    { key: "members", label: "Employees' wage packets", color: "var(--eco-magenta)", reasons: ["member_wages"] },
    { key: "bounty", label: "Hand-In Bounty", color: "var(--eco-green)", reasons: ["bounty"] },
    { key: "purse", label: "New characters' purses", color: "var(--eco-yellow)", reasons: ["starting_purse"] },
  ],
  otherLabels: { adjust: "DM adjustments" },
};

const PURSES: ResourceConfig = {
  resource: "treasury_purse",
  title: "The Factions' Treasuries",
  description: "The Dredgers', the Millers', and the Reeves' treasuries together, each kept by the faction's officer. The Council's allocation comes in every day, with whatever the officer pays in, the faction's own sales tax among it. Out go the coin wages of the faction's workers, the wage packets of its members, which they collect from the faction's paymaster (Kelo, the Provisioner, or the Reeve Provisioner), and whatever the officer takes out. A treasury can go into debt, and a faction in debt loses Morale. Each faction's Morale heads for its own people's, moved by its own debt and wages: the Dredgers' and the Millers' for their own workers', by head, and the Reeves' for the Council's Tradespeople, among whom they eat. It sets the pace of the Dredgers' catch, the Millers' harvest, and the Reeves' watch.",
  gains: [
    { key: "alloc", label: "The Council's allocation", color: "var(--eco-violet)", reasons: perFaction("_alloc"), reasonLabels: perFactionLabels("_alloc", "", "Allocation") },
    { key: "in", label: "Paid in", color: "var(--eco-blue)", reasons: perFaction("_in"), reasonLabels: perFactionLabels("_in", "", "Paid in") },
  ],
  losses: [
    { key: "wages", label: "Workers' coin wages", color: "var(--eco-vermilion)", reasons: perFaction("_wages"), reasonLabels: perFactionLabels("_wages", "", "Workers' wages") },
    { key: "members", label: "Members' wage packets", color: "var(--eco-magenta)", reasons: perFaction("_members"), reasonLabels: perFactionLabels("_members", "", "Members' wages") },
    { key: "out", label: "Taken out", color: "var(--eco-yellow)", reasons: perFaction("_out"), reasonLabels: perFactionLabels("_out", "", "Taken out") },
    // What Haremaru pays hunters for their Scar Fragments, at the prices the
    // Millers set, comes out of the Millers' treasury (ChargeTreasuryFragments).
    { key: "fragments", label: "Scar Fragments bought (the Millers)", color: "var(--eco-brown)", reasons: ["millers_fragments"] },
  ],
};

const VILLAGERS_PURSE: ResourceConfig = {
  resource: "treasury_villagers",
  title: "The Villagers' Purse",
  description: "The households' savings: the coin wages the Council and the factions pay their workers, and the takings of the shops the villagers run, less the Hearth Tax. Nothing draws on it, so it is where the gold paid to the village comes to rest. The Council does not see it in game.",
  gains: [
    { key: "wages", label: "Coin wages", color: "var(--eco-aqua)", reasons: ["wages"] },
    { key: "trades", label: "Takings of the villagers' shops", color: "var(--eco-orange)", reasons: ["trades"] },
  ],
  losses: [
    { key: "hearth", label: "Hearth Tax", color: "var(--eco-vermilion)", reasons: ["hearth"] },
  ],
};

// What the Merchants' shops keep (TREASURY_MERCHANTS in pw_inc_treasury):
// Ephedra's, The Boy's, Dan Lockwood's, and Rotheld's Refuge.
const MERCHANTS_PURSE: ResourceConfig = {
  resource: "treasury_merchants",
  title: "The Merchants' Purse",
  description: "What the Merchants' shops keep after tax: Ephedra's, The Boy's, Dan Lockwood's, and Rotheld's Refuge. Out of it they pay their Crafts & Trades workers, and the Refuge pays the Council's Wholesale Price for its food. Nothing else draws on it, so it is where the gold players spend at those counters comes to rest. The Council does not see it in game.",
  gains: [
    { key: "trades", label: "Takings of the Merchants' shops", color: "var(--eco-orange)", reasons: ["trades"] },
  ],
  losses: [
    { key: "wages", label: "Crafts & Trades wages", color: "var(--eco-aqua)", reasons: ["wages"] },
    { key: "wholesale", label: "Wholesale food (the Refuge)", color: "var(--eco-vermilion)", reasons: ["wholesale"] },
  ],
};

// The shops the Treasury taxes, by the keys the game gives them
// (GetTreasuryShopKey), named as the Treasury window names them.
// FACTION_SHOPS are the factions' own (GetTreasuryShopFaction), whose tax
// goes to the faction: Mireva and Kelo's for the Dredgers, Haremaru's counter
// at Fitz Bazalgate's and the Provisioner's for the Millers, and the Reeve
// Provisioner for the Reeves.
const TAX_SHOPS: Record<string, string> = {
  ephedra: "Ephedra, Alchemist", theboy: "The Boy, Scrolls", lockwood: "Dan Lockwood, Smith", logue: "Yasha Logue, Stores",
  mireva: "Mireva", nick: "Nine-Fingered Nick", bazalgate: "Fitz Bazalgate", crow: "The Talking Crow",
  hrotheld: "Rotheld's Refuge", snacks: "Refuge, Snacks", meals: "Refuge, Meals", soup: "Refuge, Grey Soup",
  marian: "Jacq Marian, Tailor", storehouse: "Mushirah Goldgrip", tarsus: "Fabella Tarsus, Healer",
  kelo: "Kelo, Dredgers' Bar", kelosnack: "Kelo, Snacks", kelomeal: "Kelo, Meals",
  provsnack: "Provisioner, Snacks", provmeal: "Provisioner, Meals", provgrey: "Provisioner, Grey Soup",
  reeveprov: "Reeve Provisioner",
};
const FACTION_SHOPS = ["mireva", "kelo", "kelosnack", "kelomeal", "bazalgate", "provsnack", "provmeal", "provgrey", "reeveprov"];
const VILLAGE_SHOPS = Object.keys(TAX_SHOPS).filter((k) => !FACTION_SHOPS.includes(k));
const shopName = (key: string) => TAX_SHOPS[key] ?? key;

const SALES_TAX: ResourceConfig = {
  resource: "treasury_tax",
  title: "Sales Tax",
  description: "The tax on what players buy, set aside in each shop's Tax Box at the rate its owner sets: the Advisor for the village's shops, a faction's officer for its own. The shopkeeper keeps the rest of the price. A Clerk empties the village's boxes and pays the tax into the Council's Treasury, and an officer the faction's into its treasury. Now is what is waiting in the boxes.",
  gains: [
    { key: "village", label: "Taxed at the village's shops", color: "var(--eco-blue)", reasons: VILLAGE_SHOPS, reasonLabels: Object.fromEntries(VILLAGE_SHOPS.map((k) => [k, `Tax: ${shopName(k)}`])) },
    { key: "factions", label: "Taxed at the factions' shops", color: "var(--eco-violet)", reasons: FACTION_SHOPS, reasonLabels: Object.fromEntries(FACTION_SHOPS.map((k) => [k, `Tax: ${shopName(k)}`])) },
  ],
  losses: [
    { key: "collected", label: "Emptied from the boxes", color: "var(--eco-green)", reasons: ["collected"] },
  ],
};

const FINES: ResourceConfig = {
  resource: "treasury_fines",
  title: "The Fines Chest",
  description: "Fines paid into the Fines Chest, and what the Reeves and the Clerks have taken out of it.",
  gains: [{ key: "paid", label: "Fines paid", color: "var(--eco-blue)", reasons: ["paid"] }],
  losses: [{ key: "collected", label: "Taken out", color: "var(--eco-yellow)", reasons: ["collected"] }],
};

// Each faction's treasury and Morale (out of 100), from the latest sample.
type PurseDetail = { purses: Record<string, number>; morale: Record<string, number> };

function PurseStats({ detail }: { detail: PurseDetail | null | undefined }) {
  if (!detail) return null;
  return (
    <>
      {PURSE_FACTIONS.map(([f, name]) => {
        const gold = detail.purses[f] ?? 0, morale = detail.morale[f];
        return (
          <div className="economy__stat" key={f}>
            <span className="economy__stat-label">{name}</span>
            <span className={`economy__stat-value${gold < 0 ? " economy__neg" : ""}`}>{signed(gold).replace("+", "")}</span>
            <span className="economy__stat-note">{morale === undefined ? "Morale not set yet" : `Morale ${fmt(morale)} out of 100`}{gold < 0 ? " · in debt" : ""}</span>
          </div>
        );
      })}
    </>
  );
}

// What waits in each Tax Box now, largest first.
function TaxBoxesCard({ boxes }: { boxes: Record<string, number> }) {
  const rows = Object.entries(boxes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="economy__card">
      <h4>Waiting in the Tax Boxes</h4>
      {rows.length === 0 ? <p className="economy__empty">Every box is empty.</p> : (
        <div className="demo-bars">
          {rows.map(([key, n]) => {
            const faction = FACTION_SHOPS.includes(key);
            return (
              <BarRow key={key} label={shopName(key)} value={fmt(n)} max={rows[0][1]}
                segments={[{ n, className: faction ? "eco-seg--factions" : "eco-seg--village" }]}
                tip={<>
                  <strong>{shopName(key)}</strong>
                  <span>{fmt(n)} gold, {share(n, total)} of the tax waiting · {faction ? "the faction's, for its officer to empty" : "the village's, for a Clerk to empty"}</span>
                </>} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Everyone on the Treasury's payroll, from wkserver's /economy/treasury/members:
// each faction's members and the Council's own employees, as the game keeps
// them in faction_members. `wage` is gold a day; `owed` is the wage packets
// waiting to be collected; `active` is false for one who has left but is
// still owed.
type Member = { pcid: string; name: string; faction: string; badge: string; active: boolean; wage: number; owed: number; joined: number; seen: number };
type Payroll = { members: Member[]; now: number };

const PAYROLL_GROUPS: [string, string, string][] = [
  ["council", "The Council", "Yasha Logue"],
  ["dredgers", "The Dredgers", "Kelo"],
  ["millers", "The Millers", "the Provisioner"],
  ["reeves", "The Reeves", "the Reeve Provisioner"],
];

// The badges that make a member, by tag (GetTreasuryFactionBadges).
const BADGES: Record<string, string> = {
  PW_IT_BDGDRDTRST: "Dredger Trustee's Badge", PW_IT_BDGDREDGE: "Dredger's Badge",
  PW_IT_BDGMILLOG: "Miller Logistics Badge", PW_IT_BDGMILRES: "Miller Researcher's Badge",
  PW_IT_BDGMILASST: "Miller Research Assistant's Badge", PW_IT_BDGMILCPD: "Miller Containment, Procurement, and Defense Badge",
  PW_IT_BDGMILLER: "Miller's Badge", PW_IT_BDGREEVSGT: "Reeve Sergeant's Badge", PW_IT_BDGREEVE: "Reeve's Badge",
  PW_IT_BDGADVISOR: "Advisor's Brooch", PW_IT_BDGCLERK: "Clerk's Badge", PW_IT_BDGEMPLOY: "Village Worker's Badge",
};

function PayrollSection({ data }: { data: Payroll }) {
  const groups = PAYROLL_GROUPS.map(([key, label, paymaster]) => {
    const members = data.members.filter((m) => m.faction === key);
    const active = members.filter((m) => m.active);
    return {
      key, label, paymaster, members,
      count: active.length,
      perDay: active.reduce((s, m) => s + m.wage, 0),
      owed: members.reduce((s, m) => s + m.owed, 0),
    };
  });

  return (
    <section className="economy__section" aria-labelledby="eco-payroll">
      <h3 id="eco-payroll">Members' Wages</h3>
      <p className="economy__sub">
        Every character who carries a faction's badge is one of its members, and the holders of the Advisor's Brooch, a Clerk's Badge, or a Village Worker's Badge are the Council's own employees. Each one's wage, gold a day, is set by the faction's officer, or for the Council by the Advisor, starting at the faction's default. It is a wage packet: every day at noon UTC the faction's treasury pays the whole of it into what the member is owed, on top of anything not yet collected, and it waits there until they collect it from the paymaster. A member who gives up the badge gets no more packets, but can still collect what they were owed.
      </p>

      <div className="economy__stats">
        {groups.map((g) => (
          <div className="economy__stat" key={g.key}>
            <span className="economy__stat-label">{g.label}</span>
            <span className="economy__stat-value">{fmt(g.perDay)}</span>
            <span className="economy__stat-note">
              A day, to {fmt(g.count)} {g.count === 1 ? "member" : "members"}{g.owed ? ` · ${fmt(g.owed)} waiting with ${g.paymaster}` : ""}
            </span>
          </div>
        ))}
      </div>

      {data.members.length === 0 ? <p className="economy__empty">Nobody carries a badge yet.</p> : (
        <div className="economy__card">
          <h4>On the Payroll</h4>
          <div className="economy__table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="economy__cell-left">Character</th><th className="economy__cell-left">Paid By</th>
                  <th className="economy__cell-left">Badge</th><th>Wage a Day</th><th>Waiting</th><th>Last Seen (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((g) => g.members.map((m) => (
                  <tr key={`${m.faction}/${m.pcid}`}>
                    <td className="economy__cell-left">{m.name}{m.active ? "" : " (left)"}</td>
                    <td className="economy__cell-left">{g.label}</td>
                    <td className="economy__cell-left">{BADGES[m.badge] ?? m.badge}</td>
                    <td>{m.active ? fmt(m.wage) : "–"}</td>
                    <td>{m.owed ? fmt(m.owed) : "–"}</td>
                    <td>{timeLabel(m.seen).replace(" UTC", "")}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// The Treasury's journal, from wkserver's /economy/treasury/journal: newest
// first, [unix seconds, character, kind, coffer, amount, detail], where the
// detail is the line the Treasury window shows after the name.
type JournalEntry = [number, string, string, string, number, string];
type Journal = { entries: JournalEntry[]; now: number };

// How many entries are shown before "Show all".
const JOURNAL_ROWS = 50;

function JournalSection({ data }: { data: Journal }) {
  const [all, setAll] = useState(false);
  const shown = all ? data.entries : data.entries.slice(0, JOURNAL_ROWS);
  return (
    <section className="economy__section" aria-labelledby="eco-treasury_journal">
      <h3 id="eco-treasury_journal">Treasury Journal</h3>
      <p className="economy__sub">
        Every hand that moved the Treasury's gold or changed its settings over the range shown, newest first: who emptied which Tax Box, what was paid into which coffer, who changed a rate, an allocation, or a wage, who collected their wages, and any DM's correction. The Advisor and the Clerks read the same journal in the Treasury window.
      </p>
      {data.entries.length === 0 ? <p className="economy__empty">Nothing in this range.</p> : (
        <div className="economy__card">
          <div className="economy__table-wrap">
            <table>
              <thead>
                <tr><th>When (UTC)</th><th className="economy__cell-left">Character</th><th className="economy__cell-left">What They Did</th></tr>
              </thead>
              <tbody>
                {shown.map(([t, name, , , , detail], i) => (
                  <tr key={i}>
                    <td>{timeLabel(t).replace(" UTC", "")}</td>
                    <td className="economy__cell-left">{name}</td>
                    <td className="economy__cell-left">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.entries.length > JOURNAL_ROWS && (
            <button className="economy__more" onClick={() => setAll(!all)}>
              {all ? `Show the latest ${JOURNAL_ROWS}` : `Show all ${fmt(data.entries.length)}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}


interface EconomyPageProps {
  authToken: string;
}

// The page's two halves: food (the stores, the larders, the Grey Soup, and
// the villagers who eat it all) and gold (the Treasury, and the gold the
// characters hold, spend, and are paid). Both are fetched together, so a
// switch shows the other at once, for the same range.
const TABS = [["granaries", "Granaries"], ["treasuries", "Treasuries"]] as const;
type Tab = typeof TABS[number][0];

// A tab list as the ARIA practices have it: one tab in the Tab order, and the
// arrow keys, Home, and End move between them, selecting as they go.
function EconomyTabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const at = TABS.findIndex(([key]) => key === tab);
    const to = e.key === "ArrowRight" ? (at + 1) % TABS.length
      : e.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(TABS[to][0]);
    refs.current[to]?.focus();
  }
  return (
    <div className="economy__tabs" role="tablist" aria-label="Economy" onKeyDown={onKeyDown}>
      {TABS.map(([key, label], i) => (
        <button key={key} ref={(el) => { refs.current[i] = el; }} role="tab" id={`eco-tab-${key}`}
          aria-selected={tab === key} aria-controls="eco-panel" tabIndex={tab === key ? 0 : -1}
          className="economy__tab" onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}

function EconomyPage({ authToken }: EconomyPageProps) {
  const [tab, setTab] = useState<Tab>("granaries");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Record<string, History>>({});
  const [contributors, setContributors] = useState<Contributions | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [journal, setJournal] = useState<Journal | null>(null);
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
    // A wkserver from before the average gold, the spending, the
    // contributors, the food model, the Treasury, or the Grey Soup answers
    // 404 for them, and the page shows the rest.
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
        ...["food_dredgers", "food_millers", "food_lost", "villagers", "gold_paid", ...TREASURY_RESOURCES, ...GREY_SOUP_RESOURCES].map((r) => get<History>(r, days, true)),
      ]),
      get<Contributions>("food/contributors", days, true),
      get<Payroll>("treasury/members", days, true),
      get<Journal>("treasury/journal", days, true),
    ])
      .then(([results, contributed, members, entries]) => {
        if (!current) return;
        setData(Object.fromEntries(results.filter((r): r is History => r !== null).map((r) => [r.resource, r])));
        setContributors(contributed);
        setPayroll(members);
        setJournal(entries);
        setFetchedAt(Date.now() / 1000);
        setLoading(false);
      })
      .catch((err) => { if (current) { setError(err.message); setLoading(false); } });
    return () => { current = false; };
  }, [days, authToken, reloads]);

  // The larders and the villagers are sampled once the game's food model has
  // saved itself; before that (or from an older wkserver) they are left out.
  const modelRunning = !!data.villagers?.latest;
  // The Treasury likewise, once the game has opened it (PW_TREASURY).
  const treasuryOpen = !!data.treasury?.latest;
  const stockOf = (h: History) => (h.latest?.detail?.stock ?? null) as Record<string, number> | null;
  // A count from a sample's detail, or undefined where it has none (a
  // wkserver or a model from before the Grey Soup).
  const countOf = (h: History | undefined, key: string) => {
    const n = h?.latest?.detail?.[key];
    return typeof n === "number" ? n : undefined;
  };
  const townSoup = countOf(data.food, "soup");
  const millersExtras = (h: History) => {
    const fragments = countOf(h, "fragments"), soup = countOf(h, "soup");
    return fragments === undefined && soup === undefined ? [] : [fragmentsExtra(fragments ?? 0), greySoupExtra(soup ?? 0)];
  };
  const villagersDetail = data.villagers?.latest?.detail as VillagersDetail | null | undefined;
  // A faction's workers' rations a day, at the rations set now and at the
  // baselines, from the villagers' latest sample.
  const workersOf = (faction: string) => {
    const groups = Object.entries(villagersDetail?.groups ?? {}).filter(([key]) => key.startsWith(`${faction}_`)).map(([, g]) => g);
    return {
      people: groups.reduce((s, g) => s + g.people, 0),
      rations: groups.reduce((s, g) => s + g.people * g.ration, 0),
      need: groups.reduce((s, g) => s + g.people * (g.baseline ?? 0), 0),
    };
  };
  const millersMorale = (data.treasury_purse?.latest?.detail?.morale as Record<string, number> | undefined)?.millers;
  const soupRunning = !!data.grey_soup?.latest;
  // The granary can be taken from only from version 2 of the model, so it is
  // shown once that is running, or once anything has been taken.
  const granary = data.granary_taken && (soupRunning || data.granary_taken.flows.length > 0) ? data.granary_taken : null;
  const granaries = !loading && !error && tab === "granaries";
  const treasuries = !loading && !error && tab === "treasuries";

  return (
    <div className="economy">
      <h2 className="sr-only">Economy</h2>
      <EconomyTabs tab={tab} onChange={setTab} />
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
      <div className="economy__panel" role="tabpanel" id="eco-panel" aria-labelledby={`eco-tab-${tab}`}>
        {loading && <p role="status">Loading...</p>}
        {error && <p role="alert" style={{ color: "#c0323a" }}>Error: {error}</p>}
        {granaries && data.food && (
          <>
            <ResourceSection config={FOOD} history={data.food}
              stats={<>
                {modelRunning && data.food_lost && <FoodLostStat history={data.food_lost} now={fetchedAt} />}
                {granary && <GranaryStat history={granary} now={fetchedAt} />}
              </>}>
              {stockOf(data.food) && (
                <StockCard stock={stockOf(data.food)!} litres={TOWN_STORE_LITRES} title="In Store Now, by Kind"
                  extras={townSoup === undefined ? [] : [greySoupExtra(townSoup)]} />
              )}
              {granary && <GranaryCard history={granary} />}
            </ResourceSection>
            {contributors && <ContributorsSection data={contributors} />}
            {modelRunning && FACTION_LARDERS.map(({ faction, name, config }) => {
              const history = data[config.resource];
              if (!history) return null;
              const workers = workersOf(faction);
              return (
                <ResourceSection key={faction} config={config} history={history}
                  stats={<>
                    <div className="economy__stat">
                      <span className="economy__stat-label">Sent to the Town</span>
                      <span className="economy__stat-value">{Number(history.latest?.detail?.share ?? 100)}%</span>
                      <span className="economy__stat-note">Of what it produces; it keeps the rest</span>
                    </div>
                    {workers.people > 0 && (
                      <div className="economy__stat">
                        <span className="economy__stat-label">Workers' Rations</span>
                        <span className="economy__stat-value">{fmt(workers.rations)}</span>
                        <span className="economy__stat-note">A day, for {name}' {fmt(workers.people)} workers; {fmt(workers.need)} at the baselines</span>
                      </div>
                    )}
                  </>}>
                  <StockCard stock={stockOf(history) ?? {}} litres={LARDER_LITRES[faction]} title="In the Larder Now, by Kind"
                    extras={faction === "millers" ? millersExtras(history) : []} />
                </ResourceSection>
              );
            })}
            {modelRunning && soupRunning && (
              <>
                <ResourceSection config={GREY_SOUP} history={data.grey_soup}
                  stats={<RoomTakenStat litres={(data.grey_soup.latest?.value ?? 0) * 0.4} of={TOWN_STORE_LITRES} where="the town's stores" />} />
                {data.grey_soup_millers && (
                  <ResourceSection config={MILLERS_SOUP} history={data.grey_soup_millers}
                    stats={<>
                      <RoomTakenStat litres={(data.grey_soup_millers.latest?.value ?? 0) * 0.4} of={LARDER_LITRES.millers} where="the Millers' larder" />
                      <div className="economy__stat">
                        <span className="economy__stat-label">Brewed Ever</span>
                        <span className="economy__stat-value">{fmt(Number(data.grey_soup_millers.latest?.detail?.made ?? 0))}</span>
                        <span className="economy__stat-note">Bowls, for the town and themselves, counting the 1,810 the Refuge sold before the Millers brewed</span>
                      </div>
                    </>} />
                )}
                {data.fragments_millers && (
                  <ResourceSection config={FRAGMENTS} history={data.fragments_millers}
                    stats={<>
                      <BrewingStat detail={data.fragments_millers.latest?.detail as BrewDetail | null | undefined}
                        fragments={data.fragments_millers.latest?.value ?? 0} now={fetchedAt} />
                      <RoomTakenStat litres={(data.fragments_millers.latest?.value ?? 0) * 0.05} of={LARDER_LITRES.millers} where="the Millers' larder" />
                    </>} />
                )}
              </>
            )}
            {modelRunning && <VillagersSection history={data.villagers} millersMorale={millersMorale} />}
          </>
        )}
        {treasuries && treasuryOpen && (
          <>
            <ResourceSection config={TREASURY} history={data.treasury} />
            {data.treasury_purse && (
              <ResourceSection config={PURSES} history={data.treasury_purse}
                stats={<PurseStats detail={data.treasury_purse.latest?.detail as PurseDetail | null | undefined} />} />
            )}
            {data.treasury_villagers && <ResourceSection config={VILLAGERS_PURSE} history={data.treasury_villagers} />}
            {data.treasury_merchants && <ResourceSection config={MERCHANTS_PURSE} history={data.treasury_merchants} />}
            {data.treasury_tax && (
              <ResourceSection config={SALES_TAX} history={data.treasury_tax}>
                <TaxBoxesCard boxes={(data.treasury_tax.latest?.detail?.boxes ?? {}) as Record<string, number>} />
              </ResourceSection>
            )}
            {data.treasury_fines && <ResourceSection config={FINES} history={data.treasury_fines} />}
            {payroll && <PayrollSection data={payroll} />}
            {journal && <JournalSection data={journal} />}
          </>
        )}
        {treasuries && data.gold && <ResourceSection config={GOLD} history={data.gold} />}
        {treasuries && data.gold_average && <AverageGoldSection history={data.gold_average} rangeDays={days} />}
        {treasuries && data.gold_spent && <PaymentsSection history={data.gold_spent} now={fetchedAt} config={SPENDING} words={SPEND_WORDS} nameOf={spendLabel} />}
        {treasuries && data.gold_paid && <PaymentsSection history={data.gold_paid} now={fetchedAt} config={PAID} words={PAID_WORDS} nameOf={paidLabel} />}
      </div>
    </div>
  );
}

export default EconomyPage;
