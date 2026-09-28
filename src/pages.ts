export const PAGES = {
  ONLINE_PLAYERS: 0,
  BANS:           1,
  ALL_PLAYERS:    2,
  MY_CD_KEYS:     3,
  SETTINGS:       4,
  ECONOMY:        5,
  DEMOGRAPHICS:   6,
} as const;

export type Page = typeof PAGES[keyof typeof PAGES];

export const PAGE_TITLES: Record<Page, string> = {
  [PAGES.ONLINE_PLAYERS]: "Online Players",
  [PAGES.BANS]:           "Bans",
  [PAGES.ALL_PLAYERS]:    "All Players",
  [PAGES.MY_CD_KEYS]:     "My CD Keys",
  [PAGES.SETTINGS]:       "Settings",
  [PAGES.ECONOMY]:        "Economy",
  [PAGES.DEMOGRAPHICS]:   "Demographics",
};
