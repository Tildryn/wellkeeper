import { useState, useEffect, useRef } from "react";
import "./PlayerListItem.css";
import "./BannedPlayerItem.css";
import CharacterButtons from "./CharacterButtons";
import type { ExpandGen, InnerWorldState, NoteCounts } from "./types";

interface BootSpinnerProps {
  visible: boolean;
}

const BootSpinner = ({ visible }: BootSpinnerProps) => (
  <span className={`player-card__boot-spinner${visible ? "" : " player-card__boot-spinner--hidden"}`}>
    <span className="sr-only">Kick pending</span>
    <svg className="player-card__spinner-ring" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
    <svg className="player-card__boot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h4v9.5h2l3 2.5v2H5v-2l3-2.5V3z"/>
    </svg>
  </span>
);

interface PlayerListItemProps {
  online_player_name: string;
  character_name: string;
  public_cd_key: string;
  ip_address: string;
  logged_on_at: string;
  inner_world?: InnerWorldState;
  notes?: NoteCounts;
  onBan: () => void;
  onUnban: () => void;
  onDescription?: () => void;
  onInnerWorld?: () => void;
  onNotes?: () => void;
  onLocation?: () => void;
  isBanned: boolean;
  expandGen: ExpandGen | null;
}

function PlayerListItem({ online_player_name, character_name, public_cd_key, ip_address, logged_on_at, inner_world, notes, onBan, onUnban, onDescription, onInnerWorld, onNotes, onLocation, isBanned, expandGen }: PlayerListItemProps) {
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const confirmYesRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (confirming) confirmYesRef.current?.focus(); }, [confirming]);

  useEffect(() => {
    if (!expandGen || expandGen.expanded === null) return;
    setExpanded(expandGen.expanded);
  }, [expandGen]);

  function handleConfirm() {
    setConfirming(false);
    if (isBanned) onUnban(); else onBan();
  }

  return (
    <div className={`player-card${isBanned ? " player-card--kick-pending" : ""}`} onClick={e => { if (!(e.target as HTMLElement).closest('button')) setExpanded(x => !x); }}>
      <div className="player-card__primary">
        <span className="player-card__username">{online_player_name}</span>
        <span className="player-card__character">{character_name}</span>
        <button
          className="player-card__expand-toggle"
          onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
          aria-label={expanded ? "Hide details" : "Show details"}
          aria-expanded={expanded}
          aria-controls={`player-secondary-${public_cd_key}`}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
      <div id={`player-secondary-${public_cd_key}`} className={`player-card__secondary${expanded ? " player-card__secondary--open" : ""}`}>
        <code className="player-card__cdkey">{public_cd_key}</code>
        <code className="player-card__ip">{ip_address}</code>
        <span className="player-card__timestamp">{new Date(logged_on_at).toLocaleString()}</span>
        <div className="player-card__action-group">
          <CharacterButtons name={character_name} innerWorld={inner_world} notes={notes} onDescription={onDescription} onInnerWorld={onInnerWorld} onNotes={onNotes} onLocation={onLocation} />
        </div>
        <div className="player-card__ban-area">
          <BootSpinner visible={isBanned} />
          {isBanned
            ? <button className="player-card__unban-btn" onClick={() => setConfirming(true)} disabled={confirming}>Unban</button>
            : <button className="player-card__ban-btn" onClick={() => setConfirming(true)} disabled={confirming}>Ban</button>
          }
          {confirming && (
            <div className="cdkeys-confirm">
              <span className="cdkeys-confirm__label">{isBanned ? "Unban?" : "Ban?"}</span>
              <button ref={confirmYesRef} className="cdkeys-confirm__yes" aria-label={isBanned ? "Confirm unban" : "Confirm ban"} onClick={handleConfirm}>Yes</button>
              <button className="cdkeys-confirm__no" aria-label={isBanned ? "Cancel unban" : "Cancel ban"} onClick={() => setConfirming(false)}>No</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlayerListItem;
