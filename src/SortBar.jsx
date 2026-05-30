import "./SortBar.css";

const DEFAULT_FIELDS = [
  { key: "online_player_name", label: "Name" },
  { key: "character_name",     label: "Character" },
  { key: "public_cd_key",      label: "CD Key" },
  { key: "ip_address",         label: "IP Address" },
  { key: "logged_on_at",       label: "Logged On" },
];

function SortBar({ sortKey, sortDir, onSort, fields = DEFAULT_FIELDS }) {
  return (
    <div className="sort-bar">
      <span className="sort-bar__label">Sort by</span>
      {fields.map(({ key, label }) => {
        const active = sortKey === key;
        return (
          <button
            key={key}
            className={`sort-bar__btn${active ? " sort-bar__btn--active" : ""}`}
            onClick={() => onSort(key)}
          >
            {label}
            {active && (
              <span className="sort-bar__arrow">{sortDir === "asc" ? "↑" : "↓"}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SortBar;
