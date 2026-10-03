import { IconScroll, IconGlobe, IconNotepad, IconMapPin } from "./Icons";
import type { InnerWorldState, NoteCounts } from "./types";

// The Description, Inner World, and Notes buttons, on the online list and on
// each character in the player search. They behave as the in-game Player
// List's do: Description always opens; Inner World is greyed when the
// character has written nothing there, and glows when there is something this
// DM has not read -- a page they have never opened, or one changed since they
// last did. The tooltips are the game's.
//
// Notes always opens, since a DM can write the first note on anyone. It glows
// as Inner World does while there is something on the character or its
// account that this DM has not read: notes they have never opened, or ones
// added, edited, or deleted since they last did, here or in game -- the two
// share one record of what each DM has read, as they do for Inner Worlds.
//
// Location is only on the online list: it shows where the character is
// standing now, and there is nowhere to show for one who is not in the game.

interface CharacterButtonsProps {
  name: string;
  innerWorld: InnerWorldState | undefined;
  // Undefined from an older API that does not count them.
  notes?: NoteCounts;
  // Labelled buttons where there is room, icon-only on the online list.
  withText?: boolean;
  // Absent when there is no character to show (the dummy data).
  onDescription?: () => void;
  onInnerWorld?: () => void;
  onNotes?: () => void;
  // Absent where the characters listed may not be online (the player search).
  onLocation?: () => void;
}

function innerWorldTitle(name: string, state: InnerWorldState | undefined): string {
  if (state === undefined) return "Inner World";
  if (state === "empty") return `${name || "This character"} has not written anything in their Inner World`;
  const read = "Read what this character's player has written about their inner life";
  if (state === "unread") return `${read}\nYou have not read it yet.`;
  if (state === "changed") return `${read}\nIt has changed since you last read it.`;
  return read;
}

const plural = (n: number) => `${n} note${n === 1 ? "" : "s"}`;

function notesTitle(name: string, notes: NoteCounts | undefined): string {
  if (notes === undefined) return "Read and write DM notes on this character and their account";
  if (notes.character + notes.account === 0) {
    return `No DM has written a note on ${name || "this character"} or their account yet\nClick to write one.`;
  }
  const counts = `DM notes: ${plural(notes.character)} on this character, ${plural(notes.account)} on the account`;
  if (notes.state === "unread") return `${counts}\nYou have not read them yet.`;
  if (notes.state === "changed") return `${counts}\nThey have changed since you last read them.`;
  return counts;
}

function CharacterButtons({ name, innerWorld, notes, withText = false, onDescription, onInnerWorld, onNotes, onLocation }: CharacterButtonsProps) {
  const innerOff = !onInnerWorld || innerWorld === "empty";
  const innerNew = !innerOff && (innerWorld === "unread" || innerWorld === "changed");
  const notesNew = !!onNotes && (notes?.state === "unread" || notes?.state === "changed");
  const btn = `player-card__action-btn${withText ? " player-card__action-btn--with-text" : ""}`;

  // aria-disabled rather than disabled, as before, so the greyed button still
  // shows its tooltip saying why.
  return (
    <>
      <button
        className={btn}
        aria-label={withText ? undefined : "Description"}
        aria-disabled={!onDescription}
        title="Read this character's description"
        onClick={(e) => { e.preventDefault(); onDescription?.(); }}
      >
        <IconScroll />{withText && " Description"}
      </button>
      <button
        className={`${btn}${innerNew ? " player-card__action-btn--new" : ""}`}
        aria-label={withText ? undefined : `Inner World${innerNew ? (innerWorld === "unread" ? ", unread" : ", changed") : ""}`}
        aria-disabled={innerOff}
        title={innerWorldTitle(name, innerWorld)}
        onClick={(e) => { e.preventDefault(); if (!innerOff) onInnerWorld?.(); }}
      >
        <IconGlobe />{withText && " Inner World"}
        {withText && innerNew && <span className="sr-only">{innerWorld === "unread" ? " (unread)" : " (changed)"}</span>}
      </button>
      <button
        className={`${btn}${notesNew ? " player-card__action-btn--new" : ""}`}
        aria-label={withText ? undefined : `DM Notes${notesNew ? (notes?.state === "unread" ? ", unread" : ", changed") : ""}`}
        aria-disabled={!onNotes}
        title={notesTitle(name, notes)}
        onClick={(e) => { e.preventDefault(); onNotes?.(); }}
      >
        <IconNotepad />{withText && " Notes"}
        {withText && notesNew && <span className="sr-only">{notes?.state === "unread" ? " (unread)" : " (changed)"}</span>}
      </button>
      {onLocation && (
        <button
          className={btn}
          aria-label={withText ? undefined : "Location"}
          title="See where this character is, and teleport them"
          onClick={(e) => { e.preventDefault(); onLocation(); }}
        >
          <IconMapPin />{withText && " Location"}
        </button>
      )}
    </>
  );
}

export default CharacterButtons;
