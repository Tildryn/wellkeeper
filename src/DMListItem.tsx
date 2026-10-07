import { useState } from "react";
import "./PlayerListItem.css";
import type { ExpandGen } from "./types";

interface DMListItemProps {
  online_player_name: string;
  character_name: string;
  public_cd_key: string;
  logged_on_at: string;
  expandGen: ExpandGen | null;
}

// An online DM, on the player cards' grid so that its columns line up with the
// player list's, but with nothing to act on: no IP address, character buttons,
// or ban.
function DMListItem({ online_player_name, character_name, public_cd_key, logged_on_at, expandGen }: DMListItemProps) {
  const [expanded, setExpanded] = useState(expandGen?.expanded ?? false);

  // Expand All / Collapse All, followed during render rather than in an effect
  // as PlayerListItem does, which the react-hooks lint rejects.
  const [lastGen, setLastGen] = useState(expandGen);
  if (expandGen !== lastGen) {
    setLastGen(expandGen);
    if (expandGen && expandGen.expanded !== null) setExpanded(expandGen.expanded);
  }

  return (
    <div className="player-card" onClick={() => setExpanded(x => !x)}>
      <div className="player-card__primary">
        <span className="player-card__username">{online_player_name}</span>
        <span className="player-card__character">{character_name}</span>
        <button
          className="player-card__expand-toggle"
          onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
          aria-label={expanded ? "Hide details" : "Show details"}
          aria-expanded={expanded}
          aria-controls={`dm-secondary-${public_cd_key}`}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
      <div id={`dm-secondary-${public_cd_key}`} className={`player-card__secondary${expanded ? " player-card__secondary--open" : ""}`}>
        <code className="player-card__cdkey">{public_cd_key}</code>
        <span className="player-card__timestamp">{new Date(logged_on_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default DMListItem;
