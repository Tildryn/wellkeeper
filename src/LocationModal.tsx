import { useState, useRef, useEffect, useMemo, useId } from "react";
import "./BanModal.css";
import "./PlayerListItem.css";
import "./LocationModal.css";
import pinUrl from "./assets/pin.png";
import pinTargetUrl from "./assets/pin_target.png";
import { fuzzyRank } from "./fuzzy";
import type { CharacterLocation, GameArea, LocationView, MapPoint } from "./types";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How often the character's position is asked for while the window is open.
// Each ask is answered by the game itself within a frame, so this is cheap.
const POLL_MS = 3000;

// As many matches as the picker lists at once. There are about 250 areas, and
// anything past the first few dozen is better found by typing another letter.
const MAX_OPTIONS = 60;

const API = import.meta.env.VITE_API_URL;

const authHeaders = (authToken: string | null) => ({ Authorization: `Bearer ${authToken ?? ""}` });

// The reply's JSON, or an Error carrying the reason the server gave: the
// game's own refusals ("That character is not online.") come back in `error`
// and are written to be shown as they are.
async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Server error (${res.status}).`);
  return body as T;
}

// ── Map images ──────────────────────────────────────────────────────────────

// The maps are served only to DMs, so an <img> cannot ask for one itself: it
// has no way to send the token. Each is fetched once, kept as an object URL
// for the life of the page, and shared by every window that shows it.
const mapUrls = new Map<string, Promise<string>>();

function loadMapUrl(file: string, authToken: string | null): Promise<string> {
  let url = mapUrls.get(file);
  if (!url) {
    url = fetch(`${API}/maps/${file}`, { headers: authHeaders(authToken) })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    // A failure is not kept, so that the next window tries again.
    url.catch(() => mapUrls.delete(file));
    mapUrls.set(file, url);
  }
  return url;
}

function useMapUrl(file: string | null, authToken: string | null): string | null {
  const [loaded, setLoaded] = useState<{ file: string, url: string } | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    loadMapUrl(file, authToken)
      .then((url) => { if (!cancelled) setLoaded({ file, url }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [file, authToken]);

  return loaded && loaded.file === file ? loaded.url : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Two instances of an area share its name, so the instance number goes with it.
const areaLabel = (area: GameArea) => area.instance ? `${area.name} #${area.instance}` : area.name;

const formatPoint = (p: MapPoint) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;

// Where a point in the area falls on its map, which is drawn north up: x runs
// east from the left edge, and y runs north from the BOTTOM edge.
const mapPosition = (p: MapPoint, area: GameArea) => ({
  left: `${(p.x / (area.width * 10)) * 100}%`,
  top:  `${(1 - p.y / (area.height * 10)) * 100}%`,
});

const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);

// ── Area picker ─────────────────────────────────────────────────────────────

interface AreaPickerProps {
  areas: GameArea[] | null;
  error: string | null;
  onOpen: () => void;
  onPick: (area: GameArea) => void;
}

// A combobox over every area in the running game, filtered as you type.
function AreaPicker({ areas, error, onOpen, onPick }: AreaPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(
    () => fuzzyRank(query, areas ?? [], (a) => `${a.name} ${a.tag} ${a.resref}`).slice(0, MAX_OPTIONS),
    [query, areas]
  );

  // jsdom has no scrollIntoView, hence the ?. on the call itself.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function show() {
    if (!open) { setOpen(true); onOpen(); }
  }

  function pick(area: GameArea) {
    onPick(area);
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
      if (matches.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === "Enter") {
      if (open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    } else if (e.key === "Escape" && open) {
      // Closes the list, not the window: stopped here so the dialog's own
      // Escape handler does not see it.
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="location-picker">
      <label className="ban-modal__label" htmlFor={`${listId}-input`}>Show Another Area</label>
      <input
        id={`${listId}-input`}
        className="ban-modal__input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
        placeholder="Search areas…"
        autoComplete="off"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); show(); }}
        onFocus={show}
        onClick={show}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="location-picker__list" role="listbox" id={listId} aria-label="Areas" ref={listRef}>
          {error && <li className="location-picker__note" role="alert">{error}</li>}
          {!error && areas === null && <li className="location-picker__note">Loading…</li>}
          {!error && areas !== null && matches.length === 0 && <li className="location-picker__note">No area matches.</li>}
          {matches.map((area, i) => (
            <li
              key={area.id}
              id={`${listId}-${area.id}`}
              role="option"
              aria-selected={i === active}
              className={`location-picker__option${i === active ? " location-picker__option--active" : ""}`}
              // mousedown, and prevented: a click would land after the
              // input's blur had already closed the list.
              onMouseDown={(e) => { e.preventDefault(); pick(area); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="location-picker__name">{areaLabel(area)}</span>
              {!!area.players && (
                <span className="location-picker__players">{area.players} player{area.players === 1 ? "" : "s"}</span>
              )}
              <code className="location-picker__resref">{area.resref}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── The window ──────────────────────────────────────────────────────────────

interface LocationModalProps {
  view: LocationView;
  authToken: string | null;
  onClose: () => void;
}

// Where an online character is, on a map of their area, kept up to date while
// the window is open; and a way to send them somewhere else. Clicking the map
// puts a second pin down, and Teleport sends the character to it. The picker
// swaps the map for any other area's, so the pin can go down there instead.
function LocationModal({ view, authToken, onClose }: LocationModalProps) {
  const [where, setWhere] = useState<CharacterLocation | null>(null);
  const [whereError, setWhereError] = useState<string | null>(null);
  const [areas, setAreas] = useState<GameArea[] | null>(null);
  const [areasError, setAreasError] = useState<string | null>(null);
  // The area picked to look at instead of the character's own. Null follows
  // the character from area to area.
  const [picked, setPicked] = useState<GameArea | null>(null);
  // The pin put down by a click, and the area it was put down in: a pin
  // belongs to its map, and is gone as soon as another map is shown.
  const [placed, setPlaced] = useState<(MapPoint & { areaId: string }) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error", text: string } | null>(null);
  // Bumped to ask for the position again at once rather than at the next poll.
  const [refresh, setRefresh] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const confirmYesRef = useRef<HTMLButtonElement | null>(null);

  const name = view.name || "This character";

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(".ban-modal__cancel")?.focus();
    return () => prevFocusRef.current?.focus();
  }, []);

  useEffect(() => { if (confirming) confirmYesRef.current?.focus(); }, [confirming]);

  // The character's position, asked for now and then every few seconds. The
  // next ask is only scheduled once the last has come back, so a slow server
  // is never asked twice at once.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = () => {
      fetch(`${API}/characters/${encodeURIComponent(view.pcid)}/location`, { cache: "no-store", headers: authHeaders(authToken) })
        .then((res) => readJson<CharacterLocation>(res))
        .then((data) => { if (!cancelled) { setWhere(data); setWhereError(null); } })
        .catch((err: Error) => { if (!cancelled) setWhereError(err.message); })
        .finally(() => { if (!cancelled) timer = setTimeout(ask, POLL_MS); });
    };
    ask();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [view.pcid, authToken, refresh]);

  // Asked for each time the picker opens, so the instances and player counts
  // it lists are current. The server answers from a few seconds' cache.
  function loadAreas() {
    fetch(`${API}/areas`, { cache: "no-store", headers: authHeaders(authToken) })
      .then((res) => readJson<{ areas: GameArea[] }>(res))
      .then((data) => { setAreas(data.areas); setAreasError(null); })
      .catch((err: Error) => setAreasError(err.message));
  }

  const own = where?.online ? where.area : null;
  const shown = picked ?? own;
  const onOwnMap = !!own && !!shown && own.id === shown.id;
  const here: MapPoint | null = where?.online && where.x !== undefined && where.y !== undefined ? { x: where.x, y: where.y } : null;
  const driving = where?.online ? where.driving : null;

  const target: MapPoint | null = placed && shown && placed.areaId === shown.id ? placed : null;

  const mapUrl = useMapUrl(shown?.map ?? null, authToken);

  function placeTarget(point: MapPoint) {
    if (!shown) return;
    setPlaced({ areaId: shown.id, x: clamp(point.x, shown.width * 10), y: clamp(point.y, shown.height * 10) });
    setConfirming(false);
    setNotice(null);
  }

  function handleMapClick(e: React.MouseEvent) {
    if (!shown || !mapRef.current) return;
    const box = mapRef.current.getBoundingClientRect();
    if (!box.width || !box.height) return;
    placeTarget({
      x: ((e.clientX - box.left) / box.width) * shown.width * 10,
      y: (1 - (e.clientY - box.top) / box.height) * shown.height * 10,
    });
  }

  // The keyboard's way of placing the pin: the arrows move it a metre at a
  // time, ten with Shift, starting from the character when they are on this
  // map and from the middle of it when they are not.
  function handleMapKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    const delta = move[e.key];
    if (!delta || !shown) return;
    e.preventDefault();
    const from = target ?? (onOwnMap && here ? here : { x: shown.width * 5, y: shown.height * 5 });
    placeTarget({ x: from.x + delta[0], y: from.y + delta[1] });
  }

  async function teleport() {
    if (!shown || !target) return;
    setConfirming(false);
    setSending(true);
    setNotice(null);

    try {
      const res = await fetch(`${API}/characters/${encodeURIComponent(view.pcid)}/teleport`, {
        method: "POST",
        headers: { ...authHeaders(authToken), "Content-Type": "application/json" },
        body: JSON.stringify({ area: shown.id, resref: shown.resref, x: target.x, y: target.y }),
      });
      const result = await readJson<{ ok: boolean, walkable: boolean }>(res);

      setNotice({
        kind: "ok",
        text: `Sent ${name} to ${areaLabel(shown)}.`
          + (result.walkable ? "" : " That spot cannot be stood on, so the game has put them as near to it as it can."),
      });
      // Back to following them, and asked for again as the jump lands: at
      // once catches a move within the area, and a little later one into
      // another area, which waits on the player's client loading it.
      setPicked(null);
      setPlaced(null);
      setRefresh((n) => n + 1);
      setTimeout(() => setRefresh((n) => n + 1), 1500);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  // ── What the status line says ─────────────────────────────────────────────

  let status: string;
  if (!where) status = whereError ? "" : `Finding ${name}…`;
  else if (!where.online) status = `${name} is not online.`;
  else if (!own) status = `${name} is between areas.`;
  else status = `${areaLabel(own)}${here ? ` · ${formatPoint(here)}` : ""}`;

  return (
    <div className="ban-modal__overlay" onClick={onClose}>
      <div
        className="ban-modal location-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-modal-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="location-modal__header">
          <div>
            <h2 className="ban-modal__title" id="location-modal-title">Location</h2>
            <p className="ban-modal__target location-modal__name">{view.name || "Unknown"}</p>
          </div>
          <div className="location-modal__badges">
            {where?.online && where.dead && <span className="location-modal__badge">Dead</span>}
            {driving && <span className="location-modal__badge">Possessing {driving}</span>}
          </div>
        </div>

        <p className="location-modal__status" role="status">
          <img className="location-modal__legend-pin" src={pinUrl} alt="" />
          {status}
        </p>
        {whereError && <p role="alert" className="location-modal__error">Error: {whereError}</p>}

        <AreaPicker areas={areas} error={areasError} onOpen={loadAreas} onPick={(area) => { setPicked(area); setConfirming(false); setNotice(null); }} />

        {picked && !onOwnMap && (
          <p className="location-modal__viewing">
            <span>Showing {areaLabel(picked)}. {own ? `${name} is not here.` : ""}</span>
            <button className="location-modal__link" onClick={() => { setPicked(null); setConfirming(false); }}>Back to {name}</button>
          </p>
        )}

        {shown ? (
          <div className="location-modal__map-frame">
            <div
              className={`location-map${shown.width <= 12 ? " location-map--small" : ""}`}
              ref={mapRef}
              role="application"
              tabIndex={0}
              aria-label={`Map of ${areaLabel(shown)}. Click to place a teleport target, or move it with the arrow keys.`}
              style={{
                aspectRatio: `${shown.width} / ${shown.height}`,
                width: `min(100%, calc(var(--location-map-max-height) * ${shown.width / shown.height}))`,
              }}
              onClick={handleMapClick}
              onKeyDown={handleMapKeyDown}
            >
              {mapUrl
                ? <img className="location-map__image" src={mapUrl} alt="" draggable={false} />
                : (
                  // No image for this area (or not loaded yet): its 10m tile
                  // grid, which is still enough to place a pin by.
                  <div
                    className="location-map__grid"
                    style={{ backgroundSize: `${100 / shown.width}% ${100 / shown.height}%` }}
                  />
                )}
              {onOwnMap && where?.online && where.others?.map((other, i) => (
                <span
                  key={i}
                  className={`location-map__other${other.dm ? " location-map__other--dm" : ""}`}
                  style={mapPosition(other, shown)}
                  title={other.name}
                />
              ))}
              {onOwnMap && here && (
                <img className="location-map__pin" src={pinUrl} style={mapPosition(here, shown)} alt={`${name} is here`} title={name} />
              )}
              {target && (
                <img className="location-map__pin location-map__pin--target" src={pinTargetUrl} style={mapPosition(target, shown)} alt="Teleport target" />
              )}
            </div>
          </div>
        ) : (
          where && <p className="location-modal__muted">Pick an area above to see its map.</p>
        )}

        {shown && !shown.map && <p className="location-modal__muted">There is no map of this area, only its grid of 10m tiles.</p>}

        <p className="location-modal__target">
          {target && shown
            ? <><img className="location-modal__legend-pin" src={pinTargetUrl} alt="" />Target: {areaLabel(shown)} · {formatPoint(target)}</>
            : shown ? "Click the map to choose where to send them." : ""}
        </p>

        {driving && (
          <p className="location-modal__muted">
            {name} is possessing {driving}, and cannot be moved until they are back in their own body.
          </p>
        )}
        {notice && (
          <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "location-modal__error" : "location-modal__ok"}>
            {notice.text}
          </p>
        )}

        <div className="ban-modal__actions location-modal__actions">
          {confirming && target && shown && (
            <div className="cdkeys-confirm">
              <span className="cdkeys-confirm__label">Teleport {name}?</span>
              <button ref={confirmYesRef} className="cdkeys-confirm__yes" aria-label="Confirm teleport" onClick={teleport}>Yes</button>
              <button className="cdkeys-confirm__no" aria-label="Cancel teleport" onClick={() => setConfirming(false)}>No</button>
            </div>
          )}
          <button
            className="location-modal__teleport"
            disabled={!target || !shown || !where?.online || !!driving || sending || confirming}
            onClick={() => setConfirming(true)}
          >
            {sending ? "Teleporting…" : "Teleport Here"}
          </button>
          <button className="ban-modal__cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default LocationModal;
