// Shared chrome: USWDS .gov banner, header w/ Espa\u00f1ol toggle, footer.

const Banner = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="usa-banner" aria-label="Official government website">
      <div className="usa-banner__inner">
        <img className="usa-banner__flag" src="uswds/assets/us_flag_small.svg" alt="" />
        <span className="usa-banner__text">An official website of the United States government</span>
        <button className="usa-banner__toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          Here's how you know{' '}
          <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true" style={{transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s'}}>
            <path d="M0 0l5 6 5-6z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="usa-banner__details">
          <div className="usa-banner__detail">
            <img src="uswds/assets/icons/icon-dot-gov.svg" alt="" />
            <div>
              <b>Official websites use .gov</b>
              A <strong>.gov</strong> website belongs to an official government organization in the United States.
            </div>
          </div>
          <div className="usa-banner__detail">
            <img src="uswds/assets/icons/icon-https.svg" alt="" />
            <div>
              <b>Secure .gov websites use HTTPS</b>
              A <strong>lock</strong> or <strong>https://</strong> means you've safely connected to the .gov website. Share sensitive information only on official, secure websites.
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const Header = ({ activePage, onNav, lang, onLangToggle }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'account', label: 'My account' },
    { id: 'logout', label: 'Log out' },
  ];
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <a
          href="#"
          className="app-header__brand"
          onClick={(e) => { e.preventDefault(); onNav('dashboard'); }}
        >
          Agency Name
        </a>
        <nav className="app-header__nav" aria-label="Primary">
          {navItems.map(item => (
            <a
              key={item.id}
              href="#"
              className="app-header__link"
              aria-current={activePage === item.id ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); onNav(item.id); }}
            >
              {item.label}
            </a>
          ))}
          <button className="app-header__lang" onClick={onLangToggle} aria-label="Switch language">
            {lang === 'en' ? 'Español' : 'English'}
          </button>
        </nav>
      </div>
    </header>
  );
};

const Footer = () => (
  <footer className="app-footer">
    <div className="app-footer__inner">
      <div className="app-footer__brand">Agency Name</div>
      <nav className="app-footer__nav" aria-label="Footer">
        <a href="#">About</a>
        <a href="#">Accessibility</a>
        <a href="#">Privacy</a>
        <a href="#">Contact</a>
      </nav>
      <p className="app-footer__copy">An official website of the United States government.</p>
    </div>
  </footer>
);

Object.assign(window, { Banner, Header, Footer });
