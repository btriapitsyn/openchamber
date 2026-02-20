import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'oc_ui_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.OPENCHAMBER_RATE_LIMIT_MAX_ATTEMPTS) || 10;
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;
const RATE_LIMIT_CLEANUP_MS = 60 * 60 * 1000;
const RATE_LIMIT_NO_IP_MAX_ATTEMPTS = Number(process.env.OPENCHAMBER_RATE_LIMIT_NO_IP_MAX_ATTEMPTS) || 3;

const loginRateLimiter = new Map();
let rateLimitCleanupTimer = null;

const rateLimitLocks = new Map();

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const ip = forwarded.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  const ip = req.ip || req.connection?.remoteAddress;
  if (ip) {
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }
  return null;
};

const getRateLimitKey = (req) => {
  const ip = getClientIp(req);
  if (ip) return ip;
  return 'rate-limit:no-ip';
};

const getRateLimitConfig = (key) => {
  if (key === 'rate-limit:no-ip') {
    return {
      maxAttempts: RATE_LIMIT_NO_IP_MAX_ATTEMPTS,
      windowMs: RATE_LIMIT_WINDOW_MS
    };
  }
  return {
    maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS
  };
};

const acquireRateLimitLock = async (key) => {
  const prev = rateLimitLocks.get(key) || Promise.resolve();
  const curr = prev.then(() => rateLimitLocks.delete(key));
  rateLimitLocks.set(key, curr);
  await curr;
};

const checkRateLimit = async (req) => {
  const key = getRateLimitKey(req);
  await acquireRateLimitLock(key);

  const now = Date.now();
  const { maxAttempts } = getRateLimitConfig(key);

  let record;
  try {
    record = loginRateLimiter.get(key);
  } catch (err) {
    console.error('[RateLimit] Failed to get record', { key, error: err.message });
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: maxAttempts,
      reset: Math.ceil((now + RATE_LIMIT_WINDOW_MS) / 1000)
    };
  }

  if (record?.lockedUntil && now < record.lockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((record.lockedUntil - now) / 1000),
      locked: true,
      limit: maxAttempts,
      remaining: 0,
      reset: Math.ceil(record.lockedUntil / 1000)
    };
  }

  if (record?.lockedUntil && now >= record.lockedUntil) {
    try {
      loginRateLimiter.delete(key);
    } catch (err) {
      console.error('[RateLimit] Failed to delete expired record', { key, error: err.message });
    }
  }

  if (!record || now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: maxAttempts,
      reset: Math.ceil((now + RATE_LIMIT_WINDOW_MS) / 1000)
    };
  }

  if (record.count >= maxAttempts) {
    const lockedUntil = now + RATE_LIMIT_LOCKOUT_MS;
    try {
      loginRateLimiter.set(key, { count: record.count + 1, lastAttempt: now, lockedUntil });
    } catch (err) {
      console.error('[RateLimit] Failed to set lockout', { key, error: err.message });
    }
    return {
      allowed: false,
      retryAfter: Math.ceil(RATE_LIMIT_LOCKOUT_MS / 1000),
      locked: true,
      limit: maxAttempts,
      remaining: 0,
      reset: Math.ceil(lockedUntil / 1000)
    };
  }

  const remaining = maxAttempts - record.count;
  const reset = Math.ceil((record.lastAttempt + RATE_LIMIT_WINDOW_MS) / 1000);
  return {
    allowed: true,
    limit: maxAttempts,
    remaining,
    reset
  };
};

const recordFailedAttempt = async (req) => {
  const key = getRateLimitKey(req);
  await acquireRateLimitLock(key);

  const now = Date.now();
  const { maxAttempts } = getRateLimitConfig(key);
  const record = loginRateLimiter.get(key);

  if (!record || now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    try {
      loginRateLimiter.set(key, { count: 1, lastAttempt: now });
    } catch (err) {
      console.error('[RateLimit] Failed to record attempt', { key, error: err.message });
    }
  } else {
    const newCount = record.count + 1;
    try {
      loginRateLimiter.set(key, { count: newCount, lastAttempt: now });
    } catch (err) {
      console.error('[RateLimit] Failed to record attempt', { key, error: err.message });
    }
  }
};

const clearRateLimit = async (req) => {
  const key = getRateLimitKey(req);
  await acquireRateLimitLock(key);

  try {
    loginRateLimiter.delete(key);
  } catch (err) {
    console.error('[RateLimit] Failed to clear', { key, error: err.message });
  }
};

const cleanupRateLimitRecords = () => {
  const now = Date.now();
  for (const [key, record] of loginRateLimiter.entries()) {
    const isExpired = record.lockedUntil && now >= record.lockedUntil;
    const isStale = now - record.lastAttempt > RATE_LIMIT_CLEANUP_MS;
    if (isExpired || isStale) {
      try {
        loginRateLimiter.delete(key);
      } catch (err) {
        console.error('[RateLimit] Cleanup failed', { key, error: err.message });
      }
    }
  }
};

const startRateLimitCleanup = () => {
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(cleanupRateLimitRecords, RATE_LIMIT_CLEANUP_MS);
    if (rateLimitCleanupTimer && typeof rateLimitCleanupTimer.unref === 'function') {
      rateLimitCleanupTimer.unref();
    }
  }
};

const stopRateLimitCleanup = () => {
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer);
    rateLimitCleanupTimer = null;
  }
};

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
  startRateLimitCleanup();

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

  const handleSessionCreate = async (req, res) => {
    const rateLimitResult = await checkRateLimit(req);

    res.setHeader('X-RateLimit-Limit', rateLimitResult.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitResult.reset);

    if (!rateLimitResult.allowed) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter);
      res.status(429).json({ 
        error: 'Too many login attempts, please try again later',
        retryAfter: rateLimitResult.retryAfter 
      });
      return;
    }

    const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!verifyPassword(candidate)) {
      await recordFailedAttempt(req);
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await clearRateLimit(req);

    const previousToken = getTokenFromRequest(req);
    if (previousToken) {
      dropSession(previousToken);
    }

    issueSession(req, res);
    res.json({ authenticated: true });
  };

  const dispose = () => {
    sessions.clear();
    loginRateLimiter.clear();
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    if (rateLimitCleanupTimer) {
      clearInterval(rateLimitCleanupTimer);
      rateLimitCleanupTimer = null;
    }
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
