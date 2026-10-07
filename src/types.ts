// ── API response shapes ────────────────────────────────────────────────────

// The state of a character's Inner World button for the DM looking, as the
// in-game Player List shows it: nothing written (greyed), read and unchanged
// since, never opened by this DM, or changed since they last did. The last two
// make the button glow.
export type InnerWorldState = "empty" | "seen" | "unread" | "changed";

// The state of a character's Notes button for the DM looking, as the Inner
// World's: no notes on the character or its account, all read as they stand,
// some this DM has never opened, or some changed since they last did (added,
// edited, or deleted, here or in game). The last two make the button glow.
export type NotesState = "empty" | "seen" | "unread" | "changed";

// How many DM notes there are on a character, and on the account it is logged
// in on (or listed under, in the player search), and the button's state.
// Absent from an older API, and `state` from one older still.
export interface NoteCounts {
  character: number;
  account: number;
  state?: NotesState;
}

export interface OnlinePlayer {
  // Optional only because the dummy data has neither.
  pcid?: string;
  public_cd_key: string;
  online_player_name: string;
  character_name: string;
  ip_address: string;
  logged_on_at: string;
  inner_world?: InnerWorldState;
  notes?: NoteCounts;
}

// A DM logged in to the game. `character_name` is the DM avatar's name.
export interface OnlineDM {
  public_cd_key: string;
  online_player_name: string;
  character_name: string;
  logged_on_at: string;
}

export interface Character {
  pcid: string;
  character_name: string;
  inner_world: InnerWorldState;
  notes?: NoteCounts;
}

// One DM note, written here or in game from the DM Player List. `updated` is
// null for a note never edited; `mine` says this DM wrote it, and so may
// change or delete it.
export interface DMNote {
  id: number;
  author: string;
  body: string;
  created: string;
  updated: string | null;
  mine?: boolean;
}

// `fingerprints` is each list as sent, null when empty, which the page sends
// back once the DM has been shown them, to stop the button glowing.
export interface DMNotes {
  character: DMNote[];
  account: DMNote[];
  fingerprints?: { character: string | null; account: string | null };
}

export interface Bond {
  type: number;
  type_name: string;
  description: string;
}

export interface InnerWorldPage {
  text: string;
  bonds: Bond[];
  state: InnerWorldState;
  fingerprint: number;
}

export interface CharacterDescription {
  description: string | null;
  source: "custom" | "character" | null;
  vault: boolean;
}

// An area in the running game. `id` tells one instance of an area from
// another; `resref` is the area file they share. `width` and `height` are in
// tiles of 10m, and `map` is the area's image under /maps, or null.
export interface GameArea {
  id: string;
  resref: string;
  name: string;
  tag: string;
  width: number;
  height: number;
  instance: number;
  players?: number;
  map: string | null;
}

// A point in an area, in metres from its south-west corner.
export interface MapPoint {
  x: number;
  y: number;
}

// Where an online character is. `area` is null while they are between areas.
// `driving` names the creature they are possessing, whose position this then
// is. `others` are the other characters in the same area.
export type CharacterLocation =
  | { online: false }
  | {
      online: true;
      name: string;
      dead: boolean;
      driving: string | null;
      area: GameArea | null;
      x?: number;
      y?: number;
      z?: number;
      facing?: number;
      others?: (MapPoint & { name: string, dm: boolean })[];
    };

export interface BanBase {
  ban_id: number;
  ban_reason: string | null;
  ban_start: string;
  ban_end: string | null;
  ban_temporary: boolean;
  creator_display_name: string | null;
  ban_creator: string | null;
  ban_lifter: string | null;
  lifter_display_name: string | null;
}

export interface BanDetails {
  ban_id: number;
  cd_keys: string[];
  player_names: string[];
  ip_addresses: string[];
}

export type Ban = BanBase & BanDetails;

export interface PlayerData {
  public_cd_key: string;
  player_names: string[];
  ip_addresses: string[];
  characters: Character[];
}

export interface PlayerSession {
  public_cd_key: string;
  logged_on_at: string;
  logged_off_at: string | null;
}

export interface CdKey {
  public_cd_key: string;
  dm: boolean;
}

// ── Shared component types ─────────────────────────────────────────────────

export interface BanTarget {
  cdKeys: string[];
  playerNames: string[];
  ipAddresses: string[];
}

export interface BanPayload {
  ban_reason?: string;
  ban_temporary: boolean;
  ban_end?: string;
}

export interface BanEditFields {
  ban_reason?: string | null;
  ban_temporary?: boolean;
  ban_end?: string;
  add_cd_keys?: string[];
  remove_cd_keys?: string[];
  add_player_names?: string[];
  remove_player_names?: string[];
  add_ip_addresses?: string[];
  remove_ip_addresses?: string[];
}

export interface ExpandGen {
  v: number;
  expanded: boolean | null;
}

// A character's Description or Inner World, open in the viewer.
export interface CharacterView {
  kind: "description" | "inner_world";
  pcid: string;
  name: string;
}

// A character's DM notes, open in the notes viewer, with the account whose
// notes are shown beside them.
export interface NotesView {
  pcid: string;
  name: string;
  cdKey: string;
}

// An online character whose Location is open.
export interface LocationView {
  pcid: string;
  name: string;
}
