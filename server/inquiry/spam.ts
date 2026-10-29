/**
 * Lightweight abuse protection for the inquiry endpoint.
 * - honeypot field that real visitors never see
 * - minimum time between form render and submit
 * - per-IP sliding-window rate limit (best effort: memory is per server instance)
 * - link-count heuristic for the free-text message
 * - optional Cloudflare Turnstile verification when TURNSTILE_SECRET_KEY is set
 */

const WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PER_WINDOW = 5;
const MIN_FILL_MS = 2500;

const hits = new Map<string, number[]>();

/** `limit` comes from INQUIRY_RATE_LIMIT (requests per visitor per 10 minutes, 0 disables). */
export function isRateLimited(ip: string, limit = DEFAULT_MAX_PER_WINDOW, now = Date.now()): boolean {
  if (limit <= 0) return false;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

export function honeypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function filledTooFast(elapsedMs: unknown): boolean {
  const ms = typeof elapsedMs === 'number' ? elapsedMs : Number(elapsedMs);
  return !Number.isFinite(ms) || ms < MIN_FILL_MS;
}

export function tooManyLinks(message: string | null): boolean {
  if (!message) return false;
  return (message.match(/https?:\/\/|www\./gi) ?? []).length > 2;
}

export async function verifyTurnstile(token: unknown, ip: string, secret: string): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/** Remembers recently accepted idempotency keys so a double submit is not mailed twice. */
const accepted = new Map<string, { at: number; id: string }>();
const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;

export function recallAccepted(key: string, now = Date.now()): string | null {
  const hit = accepted.get(key);
  if (!hit) return null;
  if (now - hit.at > IDEMPOTENCY_TTL_MS) {
    accepted.delete(key);
    return null;
  }
  return hit.id;
}

export function rememberAccepted(key: string, id: string, now = Date.now()): void {
  accepted.set(key, { at: now, id });
  if (accepted.size > 2000) {
    for (const [k, v] of accepted) if (now - v.at > IDEMPOTENCY_TTL_MS) accepted.delete(k);
  }
}
