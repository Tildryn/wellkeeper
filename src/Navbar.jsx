import "./Navbar.css";
import { PAGES, PAGE_TITLES } from "./pages";
import { IconWell } from "./Icons";

const DM_NAV_ITEMS = [PAGES.ONLINE_PLAYERS, PAGES.ALL_PLAYERS, PAGES.BANNED_PLAYERS, PAGES.ALL_BANS];

function Navbar({ activePage, onNavigate, onLogout, isDM, displayName }) {
  return (
    <nav className="navbar">
      <span className="navbar__title"><IconWell /> Wellkeeper</span>
      {isDM && (
        <ul className="navbar__links">
          {DM_NAV_ITEMS.map((page) => (
            <li key={page}>
              <button
                className={`navbar__link${activePage === page ? " navbar__link--active" : ""}`}
                onClick={() => onNavigate(page)}
              >
                {PAGE_TITLES[page]}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="navbar__right">
        <span className={`navbar__display-name${displayName ? "" : " navbar__display-name--placeholder"}`}>
          {displayName || "No display name set"}
        </span>
        <button
          className={`navbar__link${activePage === PAGES.MY_CD_KEYS ? " navbar__link--active" : ""}`}
          onClick={() => onNavigate(PAGES.MY_CD_KEYS)}
        >
          {PAGE_TITLES[PAGES.MY_CD_KEYS]}
        </button>
        <button
          className={`navbar__link${activePage === PAGES.SETTINGS ? " navbar__link--active" : ""}`}
          onClick={() => onNavigate(PAGES.SETTINGS)}
        >
          {PAGE_TITLES[PAGES.SETTINGS]}
        </button>
        <button className="navbar__logout" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;
