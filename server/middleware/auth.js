/**
 * Bearer token authentication middleware
 */
function normalizeHost(hostHeader) {
  const host = (hostHeader || '').trim().toLowerCase();

  if (!host) {
    return '';
  }

  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end > 0) {
      return host.slice(1, end);
    }
  }

  if ((host.match(/:/g) || []).length > 1) {
    return host;
  }

  return host.split(':')[0];
}

export function authMiddleware(config) {
  return (req, res, next) => {
    const allowedHosts = (config.allowedHosts || ['127.0.0.1', 'localhost', '::1'])
      .map((host) => normalizeHost(String(host)))
      .filter(Boolean);

    const requestHost = normalizeHost(req.headers.host);
    if (!allowedHosts.includes(requestHost)) {
      return res.status(403).json({ error: 'Forbidden host' });
    }

    if (req.path === '/health' || req.path === '/' || ['/now', '/today', '/week'].includes(req.path)) {
      return next();
    }

    if (!req.path.startsWith('/api/')) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);

    if (token !== config.apiToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  };
}