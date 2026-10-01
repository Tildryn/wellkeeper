import { useState, useRef, useEffect, type ReactNode } from "react";
import "./BanModal.css";
import "./CharacterTextModal.css";
import type { CharacterView, CharacterDescription, InnerWorldPage, InnerWorldState } from "./types";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ── NWN colour codes ───────────────────────────────────────────────────────

// Text written in game can carry the engine's colour tokens: "<c" and three
// bytes (red, green, blue) then ">", closed by "</c>". The API sends the text
// as Unicode, so a byte from 0x80 to 0x9F arrives as its Windows-1252
// character and has to be turned back into the byte.
const CP1252_HIGH = "€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8DŽ\x8F\x90‘’“”•–—˜™š›œ\x9DžŸ";
const byteOf = (c: string) => {
  const i = CP1252_HIGH.indexOf(c);
  return i >= 0 ? 0x80 + i : c.charCodeAt(0) & 0xff;
};
const COLOUR_TOKEN = /<c([\s\S]{3})>|<\/c>/g;

// The text with each coloured run in its colour, the way the game draws it.
// A new colour replaces the last rather than nesting, as in game.
function NwnText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let colour: string | null = null;
  let last = 0;

  const push = (end: number) => {
    if (end <= last) return;
    const run = text.slice(last, end);
    parts.push(colour ? <span key={last} style={{ color: colour }}>{run}</span> : run);
  };

  for (const m of text.matchAll(COLOUR_TOKEN)) {
    push(m.index);
    colour = m[1] ? `rgb(${[...m[1]].map(byteOf).join(", ")})` : null;
    last = m.index + m[0].length;
  }
  push(text.length);

  return <>{parts}</>;
}

const hasWords = (text: string) => text.replace(COLOUR_TOKEN, "").trim() !== "";

// ── The window ──────────────────────────────────────────────────────────────

interface CharacterTextModalProps {
  view: CharacterView;
  authToken: string | null;
  onClose: () => void;
  // The Inner World button's state once this DM has been shown the page, so
  // the lists stop it glowing without waiting for their next fetch.
  onInnerWorldState: (pcid: string, state: InnerWorldState) => void;
}

// A character's Description or Inner World, read-only, as the game shows them
// to a DM. Opening an Inner World records it as read, as opening it in game
// does, which is what stops its button glowing here and in game alike.
function CharacterTextModal({ view, authToken, onClose, onInnerWorldState }: CharacterTextModalProps) {
  const [description, setDescription] = useState<CharacterDescription | null>(null);
  const [page, setPage] = useState<InnerWorldPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Focus starts on Close, not on the first focusable thing (the scrolling
  // text, which takes focus so the keyboard can scroll it): there is nothing
  // to fill in here, and Close is what the keyboard wants first.
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(".ban-modal__cancel")?.focus();
    return () => prevFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = `${import.meta.env.VITE_API_URL}/characters/${encodeURIComponent(view.pcid)}/${view.kind}`;
    const headers = { Authorization: `Bearer ${authToken ?? ""}` };

    fetch(url, { cache: "no-store", headers })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json();
      })
      .then(async (data) => {
        if (cancelled) return;
        if (view.kind === "description") {
          setDescription(data as CharacterDescription);
          return;
        }

        const loaded = data as InnerWorldPage;
        setPage(loaded);
        if (loaded.state !== "unread" && loaded.state !== "changed") {
          onInnerWorldState(view.pcid, loaded.state);
          return;
        }

        // The fingerprint of the page as it was shown, not as it is by the
        // time this lands: an edit made in game in between should still glow.
        const res = await fetch(`${url}/seen`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: loaded.fingerprint }),
        });
        if (res.ok) onInnerWorldState(view.pcid, (await res.json()).state as InnerWorldState);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [view.pcid, view.kind]);

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

  const title = view.kind === "description" ? "Description" : "Inner World";
  const loading = !error && !description && !page;

  return (
    <div className="ban-modal__overlay" onClick={onClose}>
      <div
        className="ban-modal char-text-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="char-text-modal-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="char-text-modal__header">
          <div>
            <h2 className="ban-modal__title" id="char-text-modal-title">{title}</h2>
            <p className="ban-modal__target char-text-modal__name">{view.name || "Unknown"}</p>
          </div>
          {page?.state === "unread" && <span className="char-text-modal__badge">Unread</span>}
          {page?.state === "changed" && <span className="char-text-modal__badge">Changed Since Last Read</span>}
        </div>

        <div className="char-text-modal__body" tabIndex={0}>
          {loading && <p role="status" className="char-text-modal__muted">Loading…</p>}
          {error && <p role="alert" className="char-text-modal__error">Error: {error}</p>}
          {description && <DescriptionView name={view.name} description={description} />}
          {page && <InnerWorldView name={view.name} page={page} />}
        </div>

        <div className="ban-modal__actions">
          <button className="ban-modal__cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DescriptionView({ name, description }: { name: string, description: CharacterDescription }) {
  if (description.description && hasWords(description.description)) {
    return <p className="char-text-modal__text"><NwnText text={description.description} /></p>;
  }
  return (
    <>
      <p className="char-text-modal__muted">{name || "This character"} has not written a description.</p>
      {!description.vault && (
        <p className="char-text-modal__muted char-text-modal__note">
          This server cannot read the servervault, so only a description set in game is shown here, not one
          written when the character was made.
        </p>
      )}
    </>
  );
}

// The free text, then every bond in the player's order. A blank one is a
// standing Oath or Doctrine prompt the player has not answered yet, and is
// shown as such, as in game.
function InnerWorldView({ name, page }: { name: string, page: InnerWorldPage }) {
  const who = name || "This character";
  return (
    <>
      <section className="char-text-modal__section" aria-label="Inner World text">
        {hasWords(page.text)
          ? <p className="char-text-modal__text"><NwnText text={page.text} /></p>
          : <p className="char-text-modal__muted">{who} has not written anything here.</p>}
      </section>
      <section className="char-text-modal__section">
        <h3 className="ban-modal__label">Bonds</h3>
        {page.bonds.length === 0
          ? <p className="char-text-modal__muted">{who} has not written any bonds.</p>
          : (
            <ul className="char-text-modal__bonds">
              {page.bonds.map((bond, i) => (
                <li key={i} className="char-text-modal__bond">
                  <span className="char-text-modal__bond-type">{bond.type_name}</span>
                  {hasWords(bond.description)
                    ? <span className="char-text-modal__text"><NwnText text={bond.description} /></span>
                    : <span className="char-text-modal__muted">Not answered yet.</span>}
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}

export default CharacterTextModal;
