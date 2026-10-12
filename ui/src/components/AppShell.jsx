const navigation = [
  { route: 'now', label: 'Now', number: '01' },
  { route: 'today', label: 'Today', number: '02' },
  { route: 'week', label: 'Week', number: '03' },
  { route: 'settings', label: 'Settings', number: '04' }
];

export default function AppShell({ route, onLock, children }) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="wordmark" href="#/now" aria-label="Routine home">R<span>/</span></a>
        <nav className="nav-index" aria-label="Main navigation">
          {navigation.map(({ route: itemRoute, label, number }) => (
            <a
              className={`nav-index__link${route === itemRoute ? ' is-current' : ''}`}
              href={`#/${itemRoute}`}
              aria-current={route === itemRoute ? 'page' : undefined}
              key={itemRoute}
            >
              <span className="nav-index__number">{number}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <button className="text-button lock-button" onClick={onLock} type="button">Lock</button>
      </header>
      <main className="workspace">{children}</main>
      <footer className="app-footer">
        <span>LOCAL ONLY</span>
        <span>One check-in at a time.</span>
      </footer>
    </div>
  );
}
