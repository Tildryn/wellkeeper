import { useState } from "react";
import "./LoginPage.css";

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    onLogin();
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
            />
          </div>
          <button className="login-form__submit" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
