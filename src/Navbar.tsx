import "./Navbar.css";
import { PAGES, PAGE_TITLES, type Page } from "./pages";
import { IconWell, IconCog } from "./Icons";

interface NavbarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  isDM: boolean;
  displayName: string | null;
}

const DM_NAV_ITEMS: Page[] = [PAGES.ONLINE_PLAYERS, PAGES.ALL_PLAYERS, PAGES.BANS, PAGES.ECONOMY, PAGES.DEMOGRAPHICS, PAGES.METRICS];

function Navbar({ activePage, onNavigate, onLogout, isDM, displayName }: NavbarProps) {
  return (
    <nav className="navbar" aria-label="Main navigation">
      <span className="navbar__title">
        <IconWell /> Wellkeeper
        {displayName && <span className="navbar__display-name"><span className="navbar__display-name-prefix">as </span>{displayName}</span>}
      </span>
      {isDM && (
        <ul className="navbar__links">
          {DM_NAV_ITEMS.map((page) => (
            <li key={page}>
              <button
                className={`navbar__link${activePage === page ? " navbar__link--active" : ""}`}
                onClick={() => onNavigate(page)}
                aria-current={activePage === page ? "page" : undefined}
              >
                {PAGE_TITLES[page]}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="navbar__user-row">
        <button
          className={`navbar__link${activePage === PAGES.MY_CD_KEYS ? " navbar__link--active" : ""}`}
          onClick={() => onNavigate(PAGES.MY_CD_KEYS)}
          aria-current={activePage === PAGES.MY_CD_KEYS ? "page" : undefined}
        >
          {PAGE_TITLES[PAGES.MY_CD_KEYS]}
        </button>
      </div>
      <div className="navbar__controls">
        <button
          className={`navbar__link navbar__link--icon${activePage === PAGES.SETTINGS ? " navbar__link--active" : ""}`}
          onClick={() => onNavigate(PAGES.SETTINGS)}
          aria-label={PAGE_TITLES[PAGES.SETTINGS]}
          aria-current={activePage === PAGES.SETTINGS ? "page" : undefined}
        >
          <IconCog />
        </button>
        <button className="navbar__logout" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;
