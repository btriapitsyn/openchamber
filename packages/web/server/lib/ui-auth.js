import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'oc_ui_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const isSecureRequest = (req) => {
  if (req.secure) {
    return true;
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    const firstProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
    return firstProto === 'https';
  }
  return false;
};

const parseCookies = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, segment) => {
    const [name, ...rest] = segment.split('=');
    if (!name) {
      return acc;
    }
    const key = name.trim();
    if (!key) {
      return acc;
    }
    const value = rest.join('=').trim();
    acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
};

const buildCookie = ({
  name,
  value,
  maxAge,
  secure,
}) => {
  const attributes = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];

  if (typeof maxAge === 'number') {
    attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }

  const expires = maxAge === 0
    ? 'Thu, 01 Jan 1970 00:00:00 GMT'
    : new Date(Date.now() + maxAge * 1000).toUTCString();

  attributes.push(`Expires=${expires}`);

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
};

const normalizePassword = (candidate) => {
  if (typeof candidate !== 'string') {
    return '';
  }
  return candidate.normalize().trim();
};

export const createUiAuth = ({
  password,
  cookieName = SESSION_COOKIE_NAME,
  sessionTtlMs = SESSION_TTL_MS,
} = {}) => {
  const normalizedPassword = normalizePassword(password);

  if (!normalizedPassword) {
    const setSessionCookie = (req, res, token) => {
      const secure = isSecureRequest(req);
      const maxAgeSeconds = Math.floor(sessionTtlMs / 1000);
      const header = buildCookie({
        name: cookieName,
        value: encodeURIComponent(token),
        maxAge: maxAgeSeconds,
        secure,
      });
      res.setHeader('Set-Cookie', header);
    };

    const ensureSessionToken = (req, res) => {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[cookieName]) {
        return cookies[cookieName];
      }
      const token = crypto.randomBytes(32).toString('base64url');
      setSessionCookie(req, res, token);
      return token;
    };

    return {
      enabled: false,
      requireAuth: (_req, _res, next) => next(),
      handleSessionStatus: (_req, res) => {
        res.json({ authenticated: true, disabled: true });
      },
      handleSessionCreate: (_req, res) => {
        res.status(400).json({ error: 'UI password not configured' });
      },
      ensureSessionToken,
      dispose: () => {

      },
    };
  }

  const salt = crypto.randomBytes(16);
  const expectedHash = crypto.scryptSync(normalizedPassword, salt, 64);
  const sessions = new Map();

  let cleanupTimer = null;

  const getTokenFromRequest = (req) => {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[cookieName]) {
      return cookies[cookieName];
    }
    return null;
  };

  const dropSession = (token) => {
    if (token) {
      sessions.delete(token);
    }
  };

  const setSessionCookie = (req, res, token) => {
    const secure = isSecureRequest(req);
    const maxAgeSeconds = Math.floor(sessionTtlMs / 1000);
    const header = buildCookie({
      name: cookieName,
      value: encodeURIComponent(token),
      maxAge: maxAgeSeconds,
      secure,
    });
    res.setHeader('Set-Cookie', header);
  };

  const clearSessionCookie = (req, res) => {
    const secure = isSecureRequest(req);
    const header = buildCookie({
      name: cookieName,
      value: '',
      maxAge: 0,
      secure,
    });
    res.setHeader('Set-Cookie', header);
  };

  const verifyPassword = (candidate) => {
    if (!candidate) {
      return false;
    }
    const normalizedCandidate = normalizePassword(candidate);
    if (!normalizedCandidate) {
      return false;
    }
    try {
      const candidateHash = crypto.scryptSync(normalizedCandidate, salt, 64);
      return crypto.timingSafeEqual(candidateHash, expectedHash);
    } catch {
      return false;
    }
  };

  const isSessionValid = (token) => {
    if (!token) {
      return false;
    }
    const record = sessions.get(token);
    if (!record) {
      return false;
    }
    if (Date.now() - record.lastSeen > sessionTtlMs) {
      sessions.delete(token);
      return false;
    }
    record.lastSeen = Date.now();
    return true;
  };

  const issueSession = (req, res) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    sessions.set(token, { createdAt: now, lastSeen: now });
    setSessionCookie(req, res, token);
    return token;
  };

  const cleanupStaleSessions = () => {
    const now = Date.now();
    for (const [token, record] of sessions.entries()) {
      if (now - record.lastSeen > sessionTtlMs) {
        sessions.delete(token);
      }
    }
  };

  const startCleanup = () => {
    if (!cleanupTimer) {
      cleanupTimer = setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS);
      if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
      }
    }
  };

  startCleanup();

  const respondUnauthorized = (req, res) => {
    res.status(401);
    const acceptsJson = req.headers.accept?.includes('application/json');
    if (acceptsJson || req.path.startsWith('/api')) {
      res.json({ error: 'UI authentication required', locked: true });
    } else {
      res.type('text/plain').send('Authentication required');
    }
  };

  const requireAuth = (req, res, next) => {
    if (req.method === 'OPTIONS') {
      return next();
    }
    const token = getTokenFromRequest(req);
    if (isSessionValid(token)) {
      return next();
    }
    clearSessionCookie(req, res);
    return respondUnauthorized(req, res);
  };

  const handleSessionStatus = (req, res) => {
    const token = getTokenFromRequest(req);
    if (isSessionValid(token)) {
      res.json({ authenticated: true });
      return;
    }
    clearSessionCookie(req, res);
    res.status(401).json({ authenticated: false, locked: true });
  };

  const handleSessionCreate = (req, res) => {
    const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!verifyPassword(candidate)) {
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Invalid password', locked: true });
      return;
    }

    const previousToken = getTokenFromRequest(req);
    if (previousToken) {
      dropSession(previousToken);
    }

    issueSession(req, res);
    res.json({ authenticated: true });
  };

  const dispose = () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    sessions.clear();
  };

  return {
    enabled: true,
    requireAuth,
    handleSessionStatus,
    handleSessionCreate,
    ensureSessionToken: (req, _res) => {
      const token = getTokenFromRequest(req);
      return isSessionValid(token) ? token : null;
    },
    dispose,
  };
};
