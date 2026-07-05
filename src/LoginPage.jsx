import { useState } from "react";
import "./LoginPage.css";

function LoginPage({ onLogin, onRegister, onPrivacy }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Invalid email or password." : `Server error (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        setLoading(false);
        onLogin(data.token ?? data.access_token ?? null);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message);
      });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-card__title">Wellkeeper</h1>
        <p className="login-card__subtitle">Sign in to continue</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="email">Email</label>
            <input
              id="email"
              className="login-form__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              required
            />
          </div>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="password">Password</label>
            <input
              id="password"
              className="login-form__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              required
            />
          </div>
          {error && <p className="login-form__error">{error}</p>}
          <button className="login-form__submit" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <div className="login-form__footer">
            <span>Don't have an account?</span>
            <button type="button" className="login-form__link" onClick={() => onRegister(email, password)}>Register</button>
          </div>
          <div className="login-form__footer">
            <button type="button" className="login-form__link" onClick={onPrivacy}>Privacy Policy</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
