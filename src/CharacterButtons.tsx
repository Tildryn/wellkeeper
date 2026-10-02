import { IconScroll, IconGlobe, IconMapPin } from "./Icons";
import type { InnerWorldState } from "./types";

// The Description and Inner World buttons, on the online list and on each
// character in the player search. They behave as the in-game Player List's
// do: Description always opens; Inner World is greyed when the character has
// written nothing there, and glows when there is something this DM has not
// read -- a page they have never opened, or one changed since they last did.
// The tooltips are the game's.
//
// Location is only on the online list: it shows where the character is
// standing now, and there is nowhere to show for one who is not in the game.

interface CharacterButtonsProps {
  name: string;
  innerWorld: InnerWorldState | undefined;
  // Labelled buttons where there is room, icon-only on the online list.
  withText?: boolean;
  // Absent when there is no character to show (the dummy data).
  onDescription?: () => void;
  onInnerWorld?: () => void;
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

function CharacterButtons({ name, innerWorld, withText = false, onDescription, onInnerWorld, onLocation }: CharacterButtonsProps) {
  const innerOff = !onInnerWorld || innerWorld === "empty";
  const innerNew = !innerOff && (innerWorld === "unread" || innerWorld === "changed");
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
