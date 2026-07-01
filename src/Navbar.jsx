import "./Navbar.css";

const NAV_ITEMS = ["Online Players", "Banned Players", "All Players"];

function Navbar({ activePage, onNavigate, onLogout, isDM }) {
  return (
    <nav className="navbar">
      <span className="navbar__title">Wellkeeper</span>
      {isDM && (
        <ul className="navbar__links">
          {NAV_ITEMS.map((item) => (
            <li key={item}>
              <button
                className={`navbar__link${activePage === item ? " navbar__link--active" : ""}`}
                onClick={() => onNavigate(item)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="navbar__right">
        <button
          className={`navbar__link${activePage === "My CD Keys" ? " navbar__link--active" : ""}`}
          onClick={() => onNavigate("My CD Keys")}
        >
          My CD Keys
        </button>
        <button className="navbar__logout" onClick={onLogout}>Logout</button>
      </div>
    </nav>
  );
}

export default Navbar;
