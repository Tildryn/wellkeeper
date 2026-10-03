import { useState, useRef, useEffect } from "react";
import "./BanModal.css";
import "./CharacterTextModal.css";
import "./NotesModal.css";
import type { DMNote, DMNotes, NotesView } from "./types";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface NotesModalProps {
  view: NotesView;
  authToken: string | null;
  onClose: () => void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// The DM notes on a character and on its account, read-only, as the game's
// notes window lists them: two lists, newest first, each note with the DM who
// wrote it. Writing, editing, and deleting stay in game, where only a note's
// author may change it.
function NotesModal({ view, authToken, onClose }: NotesModalProps) {
  const [notes, setNotes] = useState<DMNotes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Focus starts on Close, as in the Description viewer: nothing to fill in.
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(".ban-modal__cancel")?.focus();
    return () => prevFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = `${import.meta.env.VITE_API_URL}/characters/${encodeURIComponent(view.pcid)}/notes?cd_key=${encodeURIComponent(view.cdKey)}`;

    fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${authToken ?? ""}` } })
      .then((res) => {
        if (res.status === 404) throw new Error("This server has no DM notes yet.");
        if (!res.ok) throw new Error(`Server error (${res.status}).`);
        return res.json() as Promise<DMNotes>;
      })
      .then((data) => { if (!cancelled) setNotes(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [view.pcid, view.cdKey]);

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

  const who = view.name || "this character";

  return (
    <div className="ban-modal__overlay" onClick={onClose}>
      <div
        className="ban-modal char-text-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-modal-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="char-text-modal__header">
          <div>
            <h2 className="ban-modal__title" id="notes-modal-title">DM Notes</h2>
            <p className="ban-modal__target char-text-modal__name">{view.name || "Unknown"}</p>
          </div>
        </div>

        <div className="char-text-modal__body" tabIndex={0}>
          {!error && !notes && <p role="status" className="char-text-modal__muted">Loading…</p>}
          {error && <p role="alert" className="char-text-modal__error">Error: {error}</p>}
          {notes && (
            <>
              <NoteList title="Character" notes={notes.character} empty={`No DM has written a note on ${who}.`} />
              <NoteList title="Account" notes={notes.account} empty="No DM has written a note on this player's account." />
              <p className="char-text-modal__muted char-text-modal__note">
                Notes are written and edited in game, from the DM Player List.
              </p>
            </>
          )}
        </div>

        <div className="ban-modal__actions">
          <button className="ban-modal__cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function NoteList({ title, notes, empty }: { title: string, notes: DMNote[], empty: string }) {
  return (
    <section className="char-text-modal__section" aria-label={`${title} notes`}>
      <h3 className="ban-modal__label">{title}</h3>
      {notes.length === 0
        ? <p className="char-text-modal__muted">{empty}</p>
        : (
          <ul className="notes-modal__list">
            {notes.map((note) => (
              <li key={note.id} className="notes-modal__note">
                <p className="notes-modal__meta">
                  <span className="notes-modal__author">{note.author || "Unknown DM"}</span>
                  <span>{formatDate(note.created)}</span>
                  {note.updated && <span>edited {formatDate(note.updated)}</span>}
                </p>
                <p className="char-text-modal__text">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export default NotesModal;
