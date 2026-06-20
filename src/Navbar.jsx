import "./Navbar.css";

const NAV_ITEMS = ["Online Players", "Banned Players", "All Players"];

function Navbar({ activePage, onNavigate, onLogout }) {
  return (
    <nav className="navbar">
      <span className="navbar__title">Wellkeeper</span>
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
      <button className="navbar__logout" onClick={onLogout}>Logout</button>
    </nav>
  );
}

export default Navbar;
