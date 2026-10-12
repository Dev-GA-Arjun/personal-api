import { useEffect, useState } from 'react';
import { ApiError, requestJson } from './api.js';
import AppShell from './components/AppShell.jsx';
import TokenGate from './components/TokenGate.jsx';
import NowPage from './pages/NowPage.jsx';
import TodayPage from './pages/TodayPage.jsx';
import WeekPage from './pages/WeekPage.jsx';

const tokenStorageKey = 'routine-api-token';
const routes = new Set(['now', 'today', 'week']);

function readRoute() {
  const route = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return routes.has(route) ? route : 'now';
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenStorageKey) || '');
  const [route, setRoute] = useState(readRoute);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const updateRoute = () => setRoute(readRoute());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  async function unlock(value) {
    setAuthError('');
    try {
      await requestJson('/api/now', value);
      sessionStorage.setItem(tokenStorageKey, value);
      setToken(value);
    } catch (error) {
      setAuthError(error instanceof ApiError && error.status === 401
        ? 'The server rejected that token. Check it and try again.'
        : error.message);
    }
  }

  function lock() {
    sessionStorage.removeItem(tokenStorageKey);
    setToken('');
    setAuthError('');
  }

  function handleUnauthorized(error) {
    if (error instanceof ApiError && error.status === 401) {
      lock();
      setAuthError('Your token was rejected. Enter it again to continue.');
      window.location.hash = '#/now';
    }
  }

  if (!token) {
    return <TokenGate onUnlock={unlock} error={authError} />;
  }

  const page = {
    now: <NowPage token={token} onUnauthorized={handleUnauthorized} />,
    today: <TodayPage token={token} onUnauthorized={handleUnauthorized} />,
    week: <WeekPage token={token} onUnauthorized={handleUnauthorized} />
  }[route];

  return (
    <AppShell route={route} onLock={lock}>
      {page}
    </AppShell>
  );
}
