// ── API response shapes ────────────────────────────────────────────────────

export interface OnlinePlayer {
  public_cd_key: string;
  online_player_name: string;
  character_name: string;
  ip_address: string;
  logged_on_at: string;
}

export interface Character {
  pcid: string;
  character_name: string;
}

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
