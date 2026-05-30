import "./Navbar.css";

const NAV_ITEMS = ["Online Players", "Banned Players", "Player Search"];

function Navbar({ activePage, onNavigate }) {
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
    </nav>
  );
}

export default Navbar;
