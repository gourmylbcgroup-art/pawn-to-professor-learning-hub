import crypto from 'node:crypto';

function requestFingerprint(req, userId = '') {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers['x-real-ip'] || 'unknown');
  const ua = String(req.headers['user-agent'] || '').slice(0, 180);
  return crypto.createHash('sha256').update(`${ip}|${ua}|${userId}`).digest('hex').slice(0, 40);
}

export async function enforceRateLimit({ admin, req, res, scope, userId = '', windowSeconds = 60, maxHits = 60 }) {
  const bucketKey = `${scope}:${requestFingerprint(req, userId)}`;
  const { data, error } = await admin.rpc('consume_api_rate_limit', {
    p_key: bucketKey,
    p_window_seconds: windowSeconds,
    p_max_hits: maxHits
  });

  // Reliability choice: if the limiter itself is unavailable, do not take the whole site down.
  if (error) return { allowed: true, degraded: true, error: error.message };

  const result = Array.isArray(data) ? data[0] : data;
  const allowed = Boolean(result?.allowed);
  const retryAfter = Number(result?.retry_after || windowSeconds);
  const hits = Number(result?.hits || 0);
  res.setHeader('X-RateLimit-Limit', String(maxHits));
  res.setHeader('X-RateLimit-Window', String(windowSeconds));
  if (!allowed) res.setHeader('Retry-After', String(retryAfter));
  return { allowed, retryAfter, hits, degraded: false };
}
