import { useState, useRef, useEffect } from "react";
import "./BanModal.css";
import "./CharacterTextModal.css";
import "./PlayerListItem.css";
import "./NotesModal.css";
import type { DMNote, DMNotes, NoteCounts, NotesView } from "./types";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The game's DM_NOTE_MAX_LENGTH, and the column's width.
const MAX_LENGTH = 2048;

type ListKind = "character" | "account";

// The note being written: a new one on a list (id null), or one of this DM's
// being changed, with its text as saved to tell an unsaved edit by.
interface Editor {
  list: ListKind;
  id: number | null;
  original: string;
}

interface NotesModalProps {
  view: NotesView;
  authToken: string | null;
  onClose: () => void;
  // The Notes button's counts and state once this DM has been shown the notes
  // (or changed them), so the lists stop it glowing without waiting for their
  // next fetch.
  onNotesState?: (pcid: string, cdKey: string, notes: NoteCounts) => void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// The error a failed request gives, the API's own words where it has them.
async function failure(res: Response): Promise<Error> {
  if (res.status === 404 && res.url.includes("/characters/")) return new Error("This server has no DM notes yet.");
  try {
    const { error } = await res.json() as { error?: string };
    if (error) return new Error(error);
  } catch { /* not JSON */ }
  return new Error(`Server error (${res.status}).`);
}

// The DM notes on a character and on its account, as the game's notes window
// lists them: two lists, newest first, each note with the DM who wrote it.
// Any DM can write a note on either, and change or delete their own, as in
// game; the API enforces the second as the game does. Being shown the lists
// counts as reading them, which is what stops the Notes button glowing here
// and in game alike.
function NotesModal({ view, authToken, onClose, onNotesState }: NotesModalProps) {
  const [notes, setNotes] = useState<DMNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const api = import.meta.env.VITE_API_URL;
  const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${authToken ?? ""}`, ...extra });

  const dirty = editor !== null && draft.trim() !== editor.original.trim();

  // Focus starts on Close, as in the Description viewer.
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(".ban-modal__cancel")?.focus();
    return () => prevFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = `${api}/characters/${encodeURIComponent(view.pcid)}/notes?cd_key=${encodeURIComponent(view.cdKey)}`;

    fetch(url, { cache: "no-store", headers: headers() })
      .then(async (res) => {
        if (!res.ok) throw await failure(res);
        return res.json() as Promise<DMNotes>;
      })
      .then(async (data) => {
        if (cancelled) return;
        setNotes(data);
        setError(null);
        if (!data.fingerprints) return;

        // The fingerprints of the lists as they were shown, not as they are by
        // the time this lands: a note written in game in between should glow.
        const res = await fetch(`${url.split("?")[0]}/seen`, {
          method: "POST",
          headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ cd_key: view.cdKey, ...data.fingerprints }),
        });
        if (res.ok && !cancelled) onNotesState?.(view.pcid, view.cdKey, await res.json() as NoteCounts);
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, [view.pcid, view.cdKey, reload]);

  // Closing by accident -- Escape, or a click beside the window -- does not
  // throw away a note being written. Close itself is deliberate, as in game.
  function requestClose() {
    if (dirty) {
      setActionError("Save or cancel the note you are writing first.");
      return;
    }
    onClose();
  }

  function startEditor(list: ListKind, note: DMNote | null) {
    if (dirty) {
      setActionError("Save or cancel the note you are writing first.");
      return;
    }
    setEditor({ list, id: note?.id ?? null, original: note?.body ?? "" });
    setDraft(note?.body ?? "");
    setActionError(null);
    setConfirmingDelete(null);
  }

  function cancelEditor() {
    setEditor(null);
    setDraft("");
    setActionError(null);
  }

  async function save() {
    if (!editor || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = editor.id === null
        ? await fetch(`${api}/characters/${encodeURIComponent(view.pcid)}/notes`, {
            method: "POST",
            headers: headers({ "Content-Type": "application/json" }),
            body: JSON.stringify({ cd_key: view.cdKey, account: editor.list === "account", body: draft }),
          })
        : await fetch(`${api}/notes/${editor.id}`, {
            method: "PATCH",
            headers: headers({ "Content-Type": "application/json" }),
            body: JSON.stringify({ body: draft }),
          });
      if (!res.ok) throw await failure(res);
      setEditor(null);
      setDraft("");
      setReload((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`${api}/notes/${id}`, { method: "DELETE", headers: headers() });
      // A note already gone is as good as deleted, as in game.
      if (!res.ok && res.status !== 404) throw await failure(res);
      setConfirmingDelete(null);
      if (editor?.id === id) cancelEditor();
      setReload((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // Escape in the editor leaves the editor, if nothing would be lost.
      if (editor) { if (dirty) setActionError("Save or cancel the note you are writing first."); else cancelEditor(); return; }
      requestClose();
      return;
    }
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

  const composer = (label: string) => (
    <div className="notes-modal__editor">
      <textarea
        className="ban-modal__input notes-modal__textarea"
        aria-label={label}
        placeholder="Write your note here."
        value={draft}
        maxLength={MAX_LENGTH}
        rows={5}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="notes-modal__editor-actions">
        <span className="notes-modal__count" aria-live="polite">{draft.length} / {MAX_LENGTH}</span>
        <button className="ban-modal__cancel" onClick={cancelEditor} disabled={busy}>Cancel</button>
        <button className="notes-modal__save" onClick={save} disabled={busy || draft.trim() === "" || !dirty}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  const list = (kind: ListKind, title: string, items: DMNote[], empty: string, hint: string) => {
    const writingNew = editor?.list === kind && editor.id === null;
    return (
      <section className="char-text-modal__section" aria-label={`${title} notes`}>
        <div className="notes-modal__list-head">
          <h3 className="ban-modal__label">{title}</h3>
          <button
            className="player-card__action-btn player-card__action-btn--with-text"
            title={hint}
            onClick={() => startEditor(kind, null)}
            disabled={writingNew}
          >
            New Note
          </button>
        </div>
        {writingNew && composer(`New ${title.toLowerCase()} note`)}
        {items.length === 0
          ? !writingNew && <p className="char-text-modal__muted">{empty}</p>
          : (
            <ul className="notes-modal__list">
              {items.map((note) => (
                <li key={note.id} className="notes-modal__note">
                  <div className="notes-modal__meta">
                    <span className="notes-modal__author">{note.author || "Unknown DM"}{note.mine && " (you)"}</span>
                    <span>{formatDate(note.created)}</span>
                    {note.updated && <span>edited {formatDate(note.updated)}</span>}
                    {note.mine && editor?.id !== note.id && (
                      <span className="notes-modal__note-actions">
                        {confirmingDelete === note.id
                          ? (
                            <>
                              <span className="notes-modal__confirm-label">Delete this note?</span>
                              <button className="notes-modal__link notes-modal__link--danger" onClick={() => remove(note.id)} disabled={busy}>Yes</button>
                              <button className="notes-modal__link" onClick={() => setConfirmingDelete(null)} disabled={busy}>No</button>
                            </>
                          )
                          : (
                            <>
                              <button className="notes-modal__link" onClick={() => startEditor(kind, note)} aria-label="Edit this note">Edit</button>
                              <button className="notes-modal__link notes-modal__link--danger" onClick={() => setConfirmingDelete(note.id)} aria-label="Delete this note">Delete</button>
                            </>
                          )}
                      </span>
                    )}
                  </div>
                  {editor?.id === note.id
                    ? composer("Edit your note")
                    : <p className="char-text-modal__text">{note.body}</p>}
                </li>
              ))}
            </ul>
          )}
      </section>
    );
  };

  return (
    <div className="ban-modal__overlay" onClick={requestClose}>
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
              {list("character", "Character", notes.character, `No DM has written a note on ${who} yet.`,
                "Write a note about this character. Every DM can read it; only you can change it.")}
              {list("account", "Account", notes.account, "No DM has written a note on this player's account yet.",
                "Write a note about this player, which shows on every character they log in with. Every DM can read it; only you can change it.")}
              <p className="char-text-modal__muted char-text-modal__note">
                Every DM can read these notes, here and in game; only a note's author can change it.
              </p>
            </>
          )}
        </div>

        {actionError && <p role="alert" className="char-text-modal__error">{actionError}</p>}

        <div className="ban-modal__actions">
          <button className="ban-modal__cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default NotesModal;
