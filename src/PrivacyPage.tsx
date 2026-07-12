import "./PrivacyPage.css";

interface PrivacyPageProps {
  onBack: () => void;
}

function PrivacyPage({ onBack }: PrivacyPageProps) {
  return (
    <main id="main-content" className="privacy-page">
      <div className="privacy-card">
        <div className="privacy-card__header">
          <h1 className="login-card__title">Privacy Policy</h1>
          <button className="login-form__link" onClick={onBack} aria-label="Back to login"><span aria-hidden="true">← </span>Back</button>
        </div>
        <p className="privacy-card__updated">Last updated: July 2026</p>

        <section className="privacy-section">
          <h2 className="privacy-section__heading">Who we are</h2>
          <p>Wellkeeper is an administration and player tool for a Neverwinter Nights server. Player-facing features, such as CD Key registration, are available to all account holders. Moderation and oversight features are restricted to Dungeon Masters and server administrators.</p>
        </section>

        <section className="privacy-section">
          <h2 className="privacy-section__heading">What data we hold</h2>
          <p>The following personal data is collected and stored in the course of server operation:</p>
          <ul>
            <li>Player names and character names</li>
            <li>CD Key identifiers</li>
            <li>IP addresses</li>
            <li>Login and logout timestamps</li>
            <li>Ban records, including the reason and the Dungeon Master or administrator responsible</li>
          </ul>
          <p>For registered accounts, we store your email address and a hashed password. Passwords are never stored in plain text.</p>
        </section>

        <section className="privacy-section">
          <h2 className="privacy-section__heading">Why we hold it</h2>
          <p>Data is collected for the purpose of server administration: moderating player conduct, investigating incidents, and maintaining a fair game environment. No data is used for commercial purposes or shared with third parties.</p>
        </section>

        <section className="privacy-section">
          <h2 className="privacy-section__heading">How long we keep it</h2>
          <p>Session and account data is retained for as long as is reasonably necessary for administration purposes. Ban records may be retained indefinitely as part of the ongoing moderation history.</p>
        </section>

        <section className="privacy-section">
          <h2 className="privacy-section__heading">Your rights under GDPR</h2>
          <p>If you are based in the European Economic Area, you have the right to:</p>
          <ul>
            <li>Request access to the personal data we hold about you</li>
            <li>Request correction of any inaccurate data</li>
            <li>Request erasure of your data, subject to legitimate administration requirements</li>
            <li>Object to or request restriction of processing</li>
          </ul>
          <p>To exercise any of these rights, please contact the server administration team.</p>
        </section>

        <section className="privacy-section">
          <h2 className="privacy-section__heading">Contact</h2>
          <p>For any questions regarding this policy or the data we hold, please contact the server administration team via our <a className="privacy-link" href="https://discord.gg/QUQx763d8q" target="_blank" rel="noopener noreferrer">Discord server<span className="sr-only"> (opens in new tab)</span></a>.</p>
        </section>
      </div>
    </main>
  );
}

export default PrivacyPage;
