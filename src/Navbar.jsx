import "./Navbar.css";
import { PAGES, PAGE_TITLES } from "./pages";

const DM_NAV_ITEMS = [PAGES.ONLINE_PLAYERS, PAGES.BANNED_PLAYERS, PAGES.ALL_PLAYERS];

function Navbar({ activePage, onNavigate, onLogout, isDM, accountUuid }) {
  return (
    <nav className="navbar">
      <span className="navbar__title">Wellkeeper</span>
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
        {accountUuid && <span className="navbar__uuid"><span className="navbar__uuid-label">UUID:</span>{accountUuid}</span>}
        <button
          className={`navbar__link${activePage === PAGES.MY_CD_KEYS ? " navbar__link--active" : ""}`}
          onClick={() => onNavigate(PAGES.MY_CD_KEYS)}
        >
          {PAGE_TITLES[PAGES.MY_CD_KEYS]}
        </button>
        <button className="navbar__logout" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;
