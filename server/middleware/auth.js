/**
 * Bearer token authentication middleware
 */
export function authMiddleware(config) {
  return (req, res, next) => {
    // Skip auth for health endpoint
    if (req.path === '/health') {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (token !== config.apiToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  };
}