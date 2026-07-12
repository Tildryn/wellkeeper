import "./SortBar.css";

interface SortField {
  key: string;
  label: string;
}

interface SortBarProps {
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  fields?: SortField[];
}

const DEFAULT_FIELDS: SortField[] = [
  { key: "online_player_name", label: "Name" },
  { key: "character_name",     label: "Character" },
  { key: "public_cd_key",      label: "CD Key" },
  { key: "ip_address",         label: "IP Address" },
  { key: "logged_on_at",       label: "Logged On" },
];

function SortBar({ sortKey, sortDir, onSort, fields = DEFAULT_FIELDS }: SortBarProps) {
  return (
    <div className="sort-bar">
      <span className="sort-bar__label">Sort by</span>
      {fields.map(({ key, label }) => {
        const active = sortKey === key;
        const dirLabel = active ? (sortDir === "asc" ? ", ascending" : ", descending") : "";
        return (
          <button
            key={key}
            className={`sort-bar__btn${active ? " sort-bar__btn--active" : ""}`}
            onClick={() => onSort(key)}
            aria-pressed={active}
            aria-label={`Sort by ${label}${dirLabel}`}
          >
            {label}
            {active && (
              <span className="sort-bar__arrow" aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SortBar;
